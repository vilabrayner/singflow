import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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
