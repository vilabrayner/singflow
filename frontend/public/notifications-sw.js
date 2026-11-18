/* No app-shell caching: normal deploy/update behavior remains unchanged. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let message;
      try {
        message = event.data?.json();
      } catch {
        return;
      }
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        !message ||
        !uuid.test(message.session) ||
        !uuid.test(message.call) ||
        !Number.isFinite(message.expiresAt) ||
        message.expiresAt <= Date.now()
      )
        return;
      // Drop late/revoked alerts using the same browser's restricted participant cookie.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`/api/participation/${message.session}/me`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const view = await response.json();
        if (
          view.session.status !== 'OPEN' ||
          view.active?.id !== message.call ||
          view.active.acceptedAt ||
          message.expiresAt <= Date.now()
        )
          return;
        await self.registration.showNotification(
          String(message.title ?? 'É sua vez no karaokê!').slice(0, 120),
          {
            body: String(message.body ?? '').slice(0, 300),
            icon: '/brand/singflow-icon.png',
            tag: `singflow-call-${message.call}`,
            data: { session: message.session },
          },
        );
      } catch {
        /* Obsolete or unverifiable messages must not become stale summons. */
      } finally {
        clearTimeout(timer);
      }
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const session = event.notification.data?.session;
  if (!/^[0-9a-f-]{36}$/i.test(session ?? '')) return;
  event.waitUntil(
    (async () => {
      const url = new URL(`/participante/${session}/vinculado`, self.location.origin).href;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = clients.find((client) => client.url === url);
      if (client) await client.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
