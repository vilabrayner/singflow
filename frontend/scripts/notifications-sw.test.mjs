import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
// Node requires absolute Request URLs, while worker cache inputs are same-origin paths.
class WorkerRequest extends Request {
  constructor(url, options) {
    super(new URL(url, 'https://app.example.test'), options);
  }
}
const source = readFileSync(new URL('../public/notifications-sw.js', import.meta.url), 'utf8');
function fixture(view, status = 200) {
  const handlers = new Map(),
    shown = [],
    fetched = [],
    opened = [];
  const self = {
    location: { origin: 'https://app.example.test' },
    addEventListener: (type, callback) => handlers.set(type, callback),
    registration: { showNotification: async (...args) => shown.push(args) },
    clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) },
  };
  runInNewContext(source, {
    self,
    URL,
    Date,
    Number,
    String,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      fetched.push({ url, options });
      return { ok: status === 200, json: async () => view };
    },
  });
  return {
    shown,
    fetched,
    opened,
    async emit(type, payload) {
      let pending;
      handlers.get(type)({
        ...payload,
        waitUntil(value) {
          pending = value;
        },
      });
      await pending;
    },
  };
}
const session = '11111111-1111-4111-8111-111111111111',
  call = '22222222-2222-4222-8222-222222222222';
const message = () => ({
  session,
  call,
  title: 'É sua vez!',
  body: 'Giz',
  expiresAt: Date.now() + 30000,
});
test('push revalidates the current call using the device cookie before showing the alert', async () => {
  const fixture1 = fixture({ session: { status: 'OPEN' }, active: { id: call, acceptedAt: null } });
  await fixture1.emit('push', { data: { json: message } });
  assert.equal(fixture1.shown.length, 1);
  assert.equal(fixture1.fetched[0].url, `/api/participation/${session}/me`);
  assert.equal(fixture1.fetched[0].options.credentials, 'same-origin');
});
test('expired, completed and revoked notifications never become stale summons', async () => {
  for (const [view, status] of [
    [{ session: { status: 'OPEN' }, active: null }, 200],
    [{ session: { status: 'OPEN' }, active: { id: call, acceptedAt: 'now' } }, 200],
    [null, 401],
  ]) {
    const fixture1 = fixture(view, status);
    await fixture1.emit('push', { data: { json: message } });
    assert.equal(fixture1.shown.length, 0);
  }
  const fixture1 = fixture(null);
  await fixture1.emit('push', {
    data: { json: () => ({ ...message(), expiresAt: Date.now() - 1 }) },
  });
  assert.equal(fixture1.fetched.length, 0);
});
test('notification clicks can open only the matching same-origin participation route', async () => {
  const fixture1 = fixture(null);
  await fixture1.emit('notificationclick', { notification: { close() {}, data: { session } } });
  assert.equal(fixture1.opened[0], `https://app.example.test/participante/${session}/vinculado`);
  await fixture1.emit('notificationclick', {
    notification: { close() {}, data: { session: 'https://evil.test' } },
  });
  assert.equal(fixture1.opened.length, 1);
});

function offlineFixture() {
  const handlers = new Map(),
    added = [],
    matched = [],
    actions = [];
  const offline = new Response('<h1>Vamos reconectar?</h1>', {
    headers: { 'Content-Type': 'text/html' },
  });
  const cache = {
    addAll: async (requests) => added.push(...requests),
    match: async (key) => {
      matched.push(key);
      return offline;
    },
  };
  const self = {
    location: { origin: 'https://app.example.test' },
    addEventListener: (name, callback) => handlers.set(name, callback),
    clients: { claim: async () => actions.push('claim') },
    skipWaiting: async () => actions.push('skip'),
  };
  runInNewContext(source, {
    self,
    URL,
    Request: WorkerRequest,
    Response,
    caches: { open: async () => cache },
    fetch: async () => {
      throw new Error('offline');
    },
  });
  return {
    added,
    matched,
    actions,
    async emit(name, payload = {}) {
      let pending,
        intercepted = false;
      handlers.get(name)({
        ...payload,
        waitUntil(value) {
          pending = value;
        },
        respondWith(value) {
          intercepted = true;
          pending = value;
        },
      });
      return { intercepted, response: await pending };
    },
  };
}
test('offline storage contains only a generic page and public logo, never API or session data', async () => {
  const fixture1 = offlineFixture();
  await fixture1.emit('install');
  assert.deepEqual(
    fixture1.added.map((request) => new URL(request.url).pathname),
    ['/offline.html', '/brand/singflow-logo-144.webp'],
  );
  assert.ok(fixture1.added.every((request) => request.credentials === 'omit'));
  for (const path of [
    '/api/participation/secret/me',
    '/api/auth/me',
    '/config.json',
    '/version.json',
  ]) {
    const result = await fixture1.emit('fetch', {
      request: {
        url: 'https://app.example.test' + path,
        method: 'GET',
        mode: path.startsWith('/api/') ? 'navigate' : 'cors',
      },
    });
    assert.equal(result.intercepted, false);
  }
  assert.deepEqual(fixture1.matched, []);
});
test('failed navigation returns the generic offline page without storing the visited address', async () => {
  const fixture1 = offlineFixture();
  const result = await fixture1.emit('fetch', {
    request: {
      url: 'https://app.example.test/participante/session/private-code',
      method: 'GET',
      mode: 'navigate',
    },
  });
  assert.equal(result.intercepted, true);
  assert.match(await result.response.text(), /Vamos reconectar/);
  assert.deepEqual(fixture1.matched, ['/offline.html']);
  assert.deepEqual(fixture1.added, []);
});
test('a worker never skips waiting before an explicit update request', async () => {
  const fixture1 = offlineFixture();
  await fixture1.emit('install');
  assert.deepEqual(fixture1.actions, []);
  await fixture1.emit('message', { data: { type: 'UNKNOWN' } });
  assert.deepEqual(fixture1.actions, []);
  await fixture1.emit('message', { data: { type: 'SKIP_WAITING' } });
  assert.deepEqual(fixture1.actions, ['skip']);
});
