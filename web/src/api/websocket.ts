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
const MAX_RECONNECT_ATTEMPTS = 15; // Fix: FE-002 — Stop reconnecting after N failures

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
  /** WebSocket base URL, e.g. "ws://192.168.1.50:6229". Null = same origin. */
  private baseWsUrl: string | null;
  /** Pre-supplied token for remote machines (skips the /api/auth/token fetch). */
  private overrideToken: string | null;

  constructor(sessionId: string, handler: MessageHandler, baseWsUrl?: string, token?: string) {
    this.sessionId = sessionId;
    this.handler = handler;
    this.baseWsUrl = baseWsUrl ?? null;
    this.overrideToken = token ?? null;
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
    // Fix: FE-002 — Give up after MAX_RECONNECT_ATTEMPTS consecutive failures
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[ReacherWS] Gave up reconnecting after ${MAX_RECONNECT_ATTEMPTS} attempts`);
      return;
    }
    this.clearReconnectTimer();
    const delay = Math.min(RECONNECT_BASE * 2 ** this.reconnectAttempt, RECONNECT_CAP);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private connect() {
    if (this.closed) return;

    const tokenPromise = this.overrideToken !== null
      ? Promise.resolve(this.overrideToken)
      : getToken();

    tokenPromise.then((token) => {
      if (this.closed) return;
      const base = this.baseWsUrl ?? (() => {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${window.location.host}`;
      })();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
      const url = `${base}/ws/${this.sessionId}${tokenParam}`;

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
