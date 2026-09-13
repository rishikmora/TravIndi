import type {
  AnyRealtimeEvent,
  ChannelName,
  ClientFrame,
  RealtimeConnectionState,
  ServerFrame,
} from '@/types/realtime/events';
import { backoffDelay, DEFAULT_BACKOFF, type BackoffOptions } from './backoff';
import { SOCKET_OPEN, type SocketFactory, type SocketLike } from './socket';

export interface RealtimeClientOptions {
  createSocket: SocketFactory;
  /** Bearer token for the `auth` frame; null in cookie mode. */
  getToken: () => string | null;
  isOnline?: () => boolean;
  /** Stop retrying after this many consecutive failures (state becomes `failed`). */
  maxRetries?: number;
  backoff?: BackoffOptions;
  /** Seconds to wait for a pong before treating the connection as dead. */
  pongTimeoutSeconds?: number;
  /** Called after a reconnect: events may have been missed, so re-query REST. */
  onResync?: () => void;
  onUnauthorized?: () => void;
  random?: () => number;
}

type EventListener = (event: AnyRealtimeEvent) => void;
type StateListener = (state: RealtimeConnectionState) => void;
type ChannelErrorListener = (channel: ChannelName, code: string, message: string) => void;

const SEEN_LIMIT = 500;

/**
 * The single realtime connection for the app. Hints about change arrive here;
 * REST stays the source of truth. Handles auth, channel subscriptions with
 * reference counting, heartbeats, de-duplication and bounded reconnects.
 */
export class RealtimeClient {
  private socket: SocketLike | null = null;
  private current: RealtimeConnectionState = 'idle';
  private channels = new Map<ChannelName, number>();
  private listeners = new Set<EventListener>();
  private stateListeners = new Set<StateListener>();
  private channelErrorListeners = new Set<ChannelErrorListener>();
  private seen = new Set<string>();
  private attempt = 0;
  private heartbeatSeconds = 25;
  private everReady = false;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: Required<Omit<RealtimeClientOptions, 'onResync' | 'onUnauthorized'>> &
    Pick<RealtimeClientOptions, 'onResync' | 'onUnauthorized'>;

  constructor(options: RealtimeClientOptions) {
    this.options = {
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
      maxRetries: 8,
      backoff: DEFAULT_BACKOFF,
      pongTimeoutSeconds: 10,
      random: Math.random,
      ...options,
    };
  }

  get state() {
    return this.current;
  }

  get retryAttempt() {
    return this.attempt;
  }

  // Lifecycle --------------------------------------------------------------------

  start() {
    this.stopped = false;
    void this.open();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= SOCKET_OPEN) socket.close(1000, 'client stopped');
    this.everReady = false;
    this.attempt = 0;
    this.setState('idle');
  }

  /** Network came back or the user asked to retry: reset the budget and connect now. */
  retryNow() {
    if (this.stopped) return;
    this.attempt = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (!this.socket) void this.open();
  }

  /** Network went away: drop the socket without burning retries. */
  markOffline() {
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= SOCKET_OPEN) socket.close(4000, 'offline');
    if (!this.stopped) this.setState('offline');
  }

  // Subscriptions ----------------------------------------------------------------

  subscribe(channel: ChannelName) {
    const count = this.channels.get(channel) ?? 0;
    this.channels.set(channel, count + 1);
    if (count === 0 && this.current === 'connected') this.send({ type: 'subscribe', channel });
    return () => {
      const remaining = (this.channels.get(channel) ?? 1) - 1;
      if (remaining > 0) {
        this.channels.set(channel, remaining);
        return;
      }
      this.channels.delete(channel);
      if (this.current === 'connected') this.send({ type: 'unsubscribe', channel });
    };
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onChannelError(listener: ChannelErrorListener): () => void {
    this.channelErrorListeners.add(listener);
    return () => {
      this.channelErrorListeners.delete(listener);
    };
  }

  sendTyping(conversationId: string, state: 'started' | 'stopped') {
    if (this.current === 'connected') this.send({ type: 'typing', conversation_id: conversationId, state });
  }

  // Internals --------------------------------------------------------------------

  private setState(next: RealtimeConnectionState) {
    if (this.current === next) return;
    this.current = next;
    this.stateListeners.forEach((listener) => listener(next));
  }

  private send(frame: ClientFrame) {
    if (this.socket?.readyState !== SOCKET_OPEN) return;
    try {
      this.socket.send(JSON.stringify(frame));
    } catch {
      // The close handler will schedule a reconnect.
    }
  }

  private async open() {
    if (this.stopped || this.socket) return;
    if (!this.options.isOnline()) {
      this.setState('offline');
      return;
    }
    this.setState(this.everReady ? 'reconnecting' : 'connecting');

    let socket: SocketLike;
    try {
      socket = await this.options.createSocket();
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (this.stopped) {
      socket.close(1000, 'client stopped');
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.setState('authenticating');
      this.send({ type: 'auth', token: this.options.getToken() });
    };
    socket.onmessage = (message) => {
      if (this.socket !== socket) return;
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(message.data)) as ServerFrame;
      } catch {
        return;
      }
      this.handleFrame(frame);
    };
    socket.onerror = () => {
      // A close event always follows; reconnection is handled there.
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.stopped) return;
      if (event.code === 4401) {
        this.setState('failed');
        this.options.onUnauthorized?.();
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handleFrame(frame: ServerFrame) {
    switch (frame.type) {
      case 'ready': {
        const wasReady = this.everReady;
        this.everReady = true;
        this.attempt = 0;
        this.heartbeatSeconds = frame.heartbeat_seconds || 25;
        this.setState('connected');
        this.channels.forEach((_, channel) => this.send({ type: 'subscribe', channel }));
        this.startHeartbeat();
        if (wasReady) this.options.onResync?.();
        return;
      }
      case 'event': {
        const { event } = frame;
        if (this.seen.has(event.event_id)) return;
        this.seen.add(event.event_id);
        if (this.seen.size > SEEN_LIMIT) {
          const oldest = this.seen.values().next().value;
          if (oldest) this.seen.delete(oldest);
        }
        this.listeners.forEach((listener) => listener(event));
        return;
      }
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      case 'error':
        if (frame.code === 'unauthorized') {
          this.setState('failed');
          this.options.onUnauthorized?.();
          return;
        }
        if (frame.channel) {
          this.channels.delete(frame.channel);
          this.channelErrorListeners.forEach((listener) => listener(frame.channel!, frame.code, frame.message));
        }
        return;
      default:
        return;
    }
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', ts: Date.now() });
      if (this.pongTimer) return;
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        // No pong: the connection is silently dead. Close and let reconnect run.
        this.socket?.close(4000, 'heartbeat timeout');
      }, this.options.pongTimeoutSeconds * 1000);
    }, this.heartbeatSeconds * 1000);
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (!this.options.isOnline()) {
      this.setState('offline');
      return;
    }
    this.attempt += 1;
    if (this.attempt > this.options.maxRetries) {
      this.setState('failed');
      return;
    }
    this.setState('reconnecting');
    const delay = backoffDelay(this.attempt, this.options.backoff, this.options.random);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open();
    }, delay);
  }

  private clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
  }
}
