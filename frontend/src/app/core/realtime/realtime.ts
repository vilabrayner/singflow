import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiClient } from '../http/api-client';
import { RUNTIME_CONFIG } from '../config/runtime-config.token';

interface Ticket {
  ticket: string;
  socketPath: string;
}
interface Watch {
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  update: () => Promise<void>;
  connectionChanged?: (connected: boolean) => void;
  blocked?: () => boolean;
}

/** Invalidation transport only. Every update still uses authorized REST reads. */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(RUNTIME_CONFIG);

  watch(options: Watch): () => void {
    const view = this.document.defaultView;
    if (!view) return () => {};
    let socket: WebSocket | undefined;
    let disposed = false,
      ended = false,
      connected = false,
      pending = false,
      updating = false;
    let generation = 0,
      attempts = 0;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let sync: ReturnType<typeof setTimeout> | undefined;
    let authentication: ReturnType<typeof setTimeout> | undefined;

    const flush = async () => {
      sync = undefined;
      if (disposed || this.document.hidden || !pending || updating) return;
      if (options.blocked?.()) {
        sync = setTimeout(() => void flush(), 250);
        return;
      }
      pending = false;
      updating = true;
      try {
        await options.update();
      } catch {
        /* The view owns REST errors. */
      } finally {
        updating = false;
        if (pending && !disposed) sync = setTimeout(() => void flush(), 180);
      }
    };
    const invalidate = () => {
      pending = true;
      if (!sync && !updating) sync = setTimeout(() => void flush(), 180);
    };
    const startFallback = () => {
      if (fallback || disposed || ended || this.document.hidden) return;
      fallback = setTimeout(() => {
        fallback = undefined;
        if (!connected && !disposed && !ended && !this.document.hidden) {
          invalidate();
          startFallback();
        }
      }, 30000);
    };
    const disconnect = () => {
      generation++;
      connected = false;
      options.connectionChanged?.(false);
      clearTimeout(authentication);
      authentication = undefined;
      const previous = socket;
      socket = undefined;
      previous?.close();
    };
    const retry = () => {
      if (disposed || ended || this.document.hidden || reconnect) return;
      startFallback();
      const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5));
      reconnect = setTimeout(
        () => {
          reconnect = undefined;
          void connect();
        },
        delay * (0.8 + Math.random() * 0.4),
      );
    };
    const terminal = () => {
      ended = true;
      disconnect();
      clearTimeout(fallback);
      clearTimeout(reconnect);
      fallback = reconnect = undefined;
      invalidate();
    };
    const connect = async () => {
      if (disposed || ended || this.document.hidden) return;
      disconnect();
      const current = generation;
      startFallback();
      try {
        const ticket = await this.api.post<Ticket>(
          options.path,
          options.body ?? {},
          options.headers ?? {},
          { background: true },
        );
        if (disposed || ended || current !== generation || this.document.hidden) return;
        // Only this origin and API prefix may be used; never trust an arbitrary socket URL.
        if (
          !ticket.socketPath.startsWith('/') ||
          ticket.socketPath.startsWith('//') ||
          !ticket.ticket
        )
          throw new Error('Invalid realtime response');
        const prefix = this.config.apiBaseUrl === '/' ? '' : this.config.apiBaseUrl;
        const url = new URL(prefix + ticket.socketPath, view.location.origin);
        if (url.origin !== view.location.origin) throw new Error('Invalid realtime origin');
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url.toString());
        const active = socket;
        authentication = setTimeout(() => {
          if (current === generation && !connected) {
            disconnect();
            retry();
          }
        }, 7000);
        active.onopen = () => {
          if (disposed || current !== generation) return;
          active.send(JSON.stringify({ type: 'authenticate', ticket: ticket.ticket }));
        };
        active.onmessage = (event) => {
          if (
            disposed ||
            current !== generation ||
            typeof event.data !== 'string' ||
            event.data.length > 2048
          )
            return;
          try {
            const message = JSON.parse(event.data) as { type?: string };
            if (message.type === 'ready') {
              connected = true;
              options.connectionChanged?.(true);
              attempts = 0;
              clearTimeout(authentication);
              clearTimeout(fallback);
              authentication = fallback = undefined;
              invalidate();
            } else if (message.type === 'changed' && connected) invalidate();
            else if (message.type === 'ended') terminal();
          } catch {
            /* Ignore unknown or malformed messages. */
          }
        };
        active.onclose = (event) => {
          if (disposed || current !== generation) return;
          connected = false;
          options.connectionChanged?.(false);
          clearTimeout(authentication);
          authentication = undefined;
          if (event.code === 4001) terminal();
          else retry();
        };
        active.onerror = () => {
          if (current === generation) active.close();
        };
      } catch (error) {
        if (disposed || current !== generation) return;
        if (error instanceof HttpErrorResponse && [401, 403, 410].includes(error.status))
          terminal();
        else retry();
      }
    };
    const visible = () => {
      if (this.document.hidden) {
        disconnect();
        clearTimeout(reconnect);
        clearTimeout(fallback);
        reconnect = fallback = undefined;
      } else if (!ended) void connect();
    };
    this.document.addEventListener('visibilitychange', visible);
    void connect();
    return () => {
      disposed = true;
      disconnect();
      clearTimeout(reconnect);
      clearTimeout(fallback);
      clearTimeout(sync);
      this.document.removeEventListener('visibilitychange', visible);
    };
  }
}
