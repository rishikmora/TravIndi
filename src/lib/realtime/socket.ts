/**
 * The subset of the browser WebSocket API the realtime client depends on.
 * A real `WebSocket` satisfies it; so does the development mock socket.
 */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export type SocketFactory = () => SocketLike | Promise<SocketLike>;

export const SOCKET_OPEN = 1;
