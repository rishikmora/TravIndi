import type { SocketLike } from '@/lib/realtime/socket';
import type {
  AnyRealtimeEvent,
  ChannelName,
  ClientFrame,
  RealtimeEventName,
  RealtimeEventPayloads,
  ServerFrame,
} from '@/types/realtime/events';
import { mockNetwork } from './network';

interface HubAuthority {
  currentUserId: () => string | null;
  canSubscribe: (userId: string, channel: ChannelName) => boolean;
  displayName: (userId: string) => string;
}

/** In-memory pub/sub standing in for the backend's realtime gateway. */
export class RealtimeHub {
  private sockets = new Set<MockSocket>();
  private sequence = 0;

  constructor(readonly authority: HubAuthority) {
    mockNetwork.subscribe((online) => {
      if (!online) this.sockets.forEach((socket) => socket.drop());
    });
  }

  attach(socket: MockSocket) {
    this.sockets.add(socket);
  }

  detach(socket: MockSocket) {
    this.sockets.delete(socket);
  }

  publish<N extends RealtimeEventName>(channel: ChannelName, name: N, payload: RealtimeEventPayloads[N]) {
    this.sequence += 1;
    const event = {
      event_id: `evt_${Date.now().toString(36)}_${this.sequence}`,
      name,
      channel,
      occurred_at: new Date().toISOString(),
      payload,
    } as AnyRealtimeEvent;
    this.sockets.forEach((socket) => socket.deliver(event));
  }

  /** Re-checks access for everyone on a channel, e.g. after a share is revoked. */
  revalidate(channel: ChannelName) {
    this.sockets.forEach((socket) => socket.revalidate(channel));
  }

  /** Closes every socket, as the gateway does when a session ends. */
  disconnectAll(code = 4401, reason = 'session ended') {
    this.sockets.forEach((socket) => socket.close(code, reason));
  }

  createSocket(): SocketLike {
    return new MockSocket(this);
  }
}

/** Behaves like a WebSocket connected to the realtime gateway. */
export class MockSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private subscriptions = new Set<ChannelName>();
  private userId: string | null = null;

  constructor(private readonly hub: RealtimeHub) {
    setTimeout(() => {
      if (!mockNetwork.online) {
        this.readyState = 3;
        this.onerror?.(new Event('error'));
        this.onclose?.(new CloseEvent('close', { code: 1006, reason: 'offline', wasClean: false }));
        return;
      }
      this.readyState = 1;
      hub.attach(this);
      this.onopen?.(new Event('open'));
    }, 140);
  }

  send(data: string) {
    if (this.readyState !== 1) throw new Error('Socket is not open');
    const frame = JSON.parse(data) as ClientFrame;
    setTimeout(() => this.handle(frame), 25);
  }

  close(code = 1000, reason = '') {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.hub.detach(this);
    setTimeout(() => this.onclose?.(new CloseEvent('close', { code, reason, wasClean: code === 1000 })), 0);
  }

  /** Abrupt disconnect, as when the network goes away. */
  drop() {
    this.close(1006, 'network lost');
  }

  revalidate(channel: ChannelName) {
    if (!this.subscriptions.has(channel)) return;
    if (this.userId && this.hub.authority.canSubscribe(this.userId, channel)) return;
    this.subscriptions.delete(channel);
    this.emit({ type: 'error', code: 'forbidden', message: 'Access to this channel has ended.', channel });
    this.emit({ type: 'unsubscribed', channel });
  }

  deliver(event: AnyRealtimeEvent) {
    if (this.readyState === 1 && this.subscriptions.has(event.channel)) this.emit({ type: 'event', event });
  }

  private emit(frame: ServerFrame) {
    if (this.readyState !== 1) return;
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }));
  }

  private handle(frame: ClientFrame) {
    const { authority } = this.hub;
    switch (frame.type) {
      case 'auth': {
        this.userId = authority.currentUserId();
        if (!this.userId) {
          this.emit({ type: 'error', code: 'unauthorized', message: 'Sign in to receive live updates.' });
          this.close(4401, 'unauthorized');
          return;
        }
        this.emit({ type: 'ready', session_id: `rt_${Date.now().toString(36)}`, server_time: new Date().toISOString(), heartbeat_seconds: 25 });
        return;
      }
      case 'subscribe': {
        if (!this.userId || !authority.canSubscribe(this.userId, frame.channel)) {
          this.emit({ type: 'error', code: 'forbidden', message: 'Not allowed to join this channel.', channel: frame.channel });
          return;
        }
        this.subscriptions.add(frame.channel);
        this.emit({ type: 'subscribed', channel: frame.channel });
        return;
      }
      case 'unsubscribe':
        this.subscriptions.delete(frame.channel);
        this.emit({ type: 'unsubscribed', channel: frame.channel });
        return;
      case 'ping':
        this.emit({ type: 'pong', ts: frame.ts });
        return;
      case 'typing': {
        if (!this.userId) return;
        const channel = `conversation:${frame.conversation_id}` as const;
        if (frame.state === 'started') {
          this.hub.publish(channel, 'typing.started', {
            conversation_id: frame.conversation_id,
            user_id: this.userId,
            display_name: authority.displayName(this.userId),
          });
        } else {
          this.hub.publish(channel, 'typing.stopped', { conversation_id: frame.conversation_id, user_id: this.userId });
        }
      }
    }
  }
}
