"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8010";
const WS_URL = `${API_BASE_URL.replace(/^http/, "ws")}/api/v1/realtime`;

export type RealtimeEvent = { type: string; channel?: string } & Record<string, unknown>;
type EventHandler = (event: RealtimeEvent) => void;

export type RealtimeAuth = { token: string } | { shareToken: string } | null;

const MAX_RETRY_DELAY_MS = 15000;

/**
 * One shared WebSocket per mounting component, authenticated via the
 * first frame (browsers can't set custom headers on a WS handshake) —
 * `{"type":"auth","token":...}` for a logged-in principal or
 * `{"type":"auth_share_token","token":...}` for the public,
 * unauthenticated location-share recipient view. Every real mutation
 * still happens over REST; this connection only ever receives broadcasts
 * of what already happened server-side — it never originates a durable
 * change itself (see backend `app/websocket/`'s own docstring).
 *
 * Reconnects with exponential backoff + jitter and re-subscribes to every
 * channel the caller had asked for — callers should still treat a
 * reconnect as "I may have missed something" and resync via their own
 * REST endpoint (this hook makes no missed-event delivery guarantee).
 */
export function useRealtimeConnection(auth: RealtimeAuth) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const authRef = useRef(auth);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const wantedChannelsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Read by the `onopen` handler below, which fires asynchronously —
    // updating this in an effect (not during render) is what
    // react-hooks/refs requires; the one-tick lag until this commits is
    // irrelevant since nothing reads it synchronously during render.
    authRef.current = auth;
  }, [auth]);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        const currentAuth = authRef.current;
        if (!socket || !currentAuth) return;
        socket.send(
          JSON.stringify(
            "token" in currentAuth
              ? { type: "auth", token: currentAuth.token }
              : { type: "auth_share_token", token: currentAuth.shareToken }
          )
        );
      };

      socket.onmessage = (rawEvent) => {
        let data: RealtimeEvent;
        try {
          data = JSON.parse(rawEvent.data);
        } catch {
          return;
        }
        if (data.type === "auth.ok") {
          setConnected(true);
          retryDelay = 1000;
          for (const channel of wantedChannelsRef.current) {
            socket?.send(JSON.stringify({ type: "subscribe", channel }));
          }
          return;
        }
        if (data.type === "subscribed" || data.type === "error") return;
        const channel = data.channel;
        if (!channel) return;
        for (const handler of handlersRef.current.get(channel) ?? []) handler(data);
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        retryTimer = setTimeout(connect, retryDelay + Math.random() * 500);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      socketRef.current = null;
      setConnected(false);
    };
    // Reconnecting on every `auth` identity change is deliberate (a fresh
    // token or share link is a genuinely new session) — `authRef` exists
    // so a same-value re-render doesn't tear the socket down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth && ("token" in auth ? auth.token : auth.shareToken)]);

  const subscribe = useCallback((channel: string, handler: EventHandler) => {
    wantedChannelsRef.current.add(channel);
    let handlers = handlersRef.current.get(channel);
    if (!handlers) {
      handlers = new Set();
      handlersRef.current.set(channel, handlers);
    }
    handlers.add(handler);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "subscribe", channel }));
    }
    return () => {
      handlers?.delete(handler);
      if (handlers && handlers.size === 0) {
        wantedChannelsRef.current.delete(channel);
        handlersRef.current.delete(channel);
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: "unsubscribe", channel }));
        }
      }
    };
  }, []);

  const sendTyping = useCallback((channel: string, state: "started" | "stopped") => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "typing", channel, state }));
    }
  }, []);

  return { connected, subscribe, sendTyping };
}
