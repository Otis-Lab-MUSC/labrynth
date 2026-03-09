import type { WSMessage } from "../types";
import { getToken } from "./client";

type MessageHandler = (msg: WSMessage) => void;

let _pageUnloading = false;
window.addEventListener("unload", () => {
  _pageUnloading = true;
});

const HEARTBEAT_INTERVAL = 20_000; // 20s client-side keepalive
const RECONNECT_BASE = 1_000; // 1s initial reconnect delay
const RECONNECT_CAP = 10_000; // 10s max reconnect delay

export class ReacherWebSocket {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private handler: MessageHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private onVisibilityChange: (() => void) | null = null;

  constructor(sessionId: string, handler: MessageHandler) {
    this.sessionId = sessionId;
    this.handler = handler;
    this.setupVisibilityListener();
    this.connect();
  }

  private setupVisibilityListener() {
    this.onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !this.closed) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.clearReconnectTimer();
          this.reconnectAttempt = 0;
          this.connect();
        }
      }
    };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.resetStaleTimer();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private resetStaleTimer() {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      // No data received within 2x heartbeat — connection is likely dead
      if (this.ws && !this.closed) {
        this.ws.close();
      }
    }, HEARTBEAT_INTERVAL * 2);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.closed || _pageUnloading) return;
    this.clearReconnectTimer();
    const delay = Math.min(RECONNECT_BASE * 2 ** this.reconnectAttempt, RECONNECT_CAP);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private connect() {
    if (this.closed) return;

    getToken().then((token) => {
      if (this.closed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
      const url = `${proto}//${window.location.host}/ws/${this.sessionId}${tokenParam}`;

      this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.startHeartbeat();
    };
    this.ws.onmessage = (ev) => {
      this.resetStaleTimer();
      try {
        const msg: WSMessage = JSON.parse(ev.data);
        this.handler(msg);
      } catch {
        // ignore malformed messages
      }
    };
    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
    });
  }

  close() {
    this.closed = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.onVisibilityChange) {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    this.ws?.close();
  }
}
