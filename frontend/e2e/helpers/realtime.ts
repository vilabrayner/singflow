import { expect, Page, WebSocketRoute } from '@playwright/test';

/** Simulates server invalidations, never periodic changes or polling. */
export async function installRealtime(page: Page, participant?: string) {
  let active: WebSocketRoute | undefined;
  let connections = 0;
  const frames: unknown[] = [];
  let available = true;
  await page.route(/\/api\/(?:participation\/[^/]+\/)?realtime\/tickets$/, (route) => {
    if (participant) expect(route.request().headers()['x-singflow-participant']).toBe(participant);
    if (!available) return route.fulfill({ status: 503 });
    const socketPath = new URL(route.request().url()).pathname
      .slice('/api'.length)
      .replace(/tickets$/, 'ws');
    return route.fulfill({ json: { ticket: 'test-only-ticket', socketPath } });
  });
  await page.routeWebSocket(/\/api\/(?:participation\/[^/]+\/)?realtime\/ws$/, (socket) => {
    expect(new URL(socket.url()).search).toBe('');
    socket.onMessage((data) => {
      const frame = JSON.parse(data.toString());
      frames.push(frame);
      expect(frame).toEqual({ type: 'authenticate', ticket: 'test-only-ticket' });
      active = socket;
      connections++;
      socket.send(JSON.stringify({ type: 'ready' }));
    });
    socket.onClose(() => {
      if (active === socket) active = undefined;
    });
  });
  return {
    ready: () => expect.poll(() => !!active).toBe(true),
    changed: () => {
      if (!active) throw new Error('Realtime connection not ready');
      active.send(JSON.stringify({ type: 'changed' }));
    },
    disconnect: () => {
      active?.close({ code: 4000, reason: 'test reconnect' });
      active = undefined;
    },
    connections: () => connections,
    frames,
    available: (value: boolean) => {
      available = value;
    },
  };
}
