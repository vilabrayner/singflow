import { expect, test } from '@playwright/test';
import { installRealtime } from './helpers/realtime';

async function fixture(page: import('@playwright/test').Page) {
  let reads = 0;
  const session = {
    id: 'realtime-session',
    name: 'Realtime test',
    status: 'OPEN',
    createdAt: '2026-11-18T12:00:00Z',
  };
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'musician@example.test', role: 'MUSICIAN' } });
    if (path.endsWith('/musicians/sessions')) return route.fulfill({ json: [session] });
    if (path.endsWith('/musicians/sessions/' + session.id)) {
      reads++;
      return route.fulfill({
        json: {
          session,
          stage: { active: null, suggestions: [], paused: [], history: [] },
          chords: {},
          streaming: {},
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  const realtime = await installRealtime(page);
  await page.goto('/musico');
  await realtime.ready();
  await expect(page.locator('.sf-workspace-viewport')).toBeVisible();
  await expect.poll(() => reads).toBe(2); // Initial snapshot plus subscribe/recovery snapshot.
  return { realtime, reads: () => reads };
}

test('realtime coalesces changes, avoids idle polling and restores a snapshot after reconnect @release', async ({
  page,
}) => {
  const state = await fixture(page);
  state.realtime.changed();
  state.realtime.changed();
  state.realtime.changed();
  await expect.poll(state.reads).toBe(3);
  await page.clock.install();
  await page.clock.fastForward(15000);
  expect(state.reads()).toBe(3);
  state.realtime.disconnect();
  await expect.poll(state.realtime.connections).toBe(2);
  await expect.poll(state.reads).toBe(4);
  await expect(page.locator('.sf-application-loading')).toHaveCount(0);
  // Backgrounded pages suspend the socket and all contingency reads.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60000);
  expect(state.reads()).toBe(4);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(state.realtime.connections).toBe(3);
  await expect.poll(state.reads).toBe(5);
  state.realtime.available(false);
  state.realtime.disconnect();
  await page.clock.fastForward(31000);
  await expect.poll(state.reads).toBe(6); // Moderate fallback, even while ticket renewal fails.
});

test('pull refresh requires a deliberate vertical gesture at the viewport top @release', async ({
  page,
}) => {
  const state = await fixture(page);
  const viewport = page.locator('.sf-workspace-viewport');
  const card = viewport.locator('app-surface-card > .sf-card:visible').first();
  const content = viewport.locator('p-scrollarea-content').first();
  const before = (await card.boundingBox())!;
  const pull = async (distance: number, release = true, steps = 1) =>
    card.evaluate(
      async (element, data) => {
        function touch(type: string, y: number) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'touches', {
            value: type === 'touchend' ? [] : [{ clientX: 180, clientY: y }],
          });
          element.dispatchEvent(event);
        }
        touch('touchstart', 160);
        for (let step = 1; step <= data.steps; step++) {
          touch('touchmove', 160 + (data.distance * step) / data.steps);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        if (data.release) touch('touchend', 160 + data.distance);
      },
      { distance, release, steps },
    );
  // Starting on empty viewport space must not move the cards or refresh.
  await viewport.evaluate((element) => {
    for (const [type, y] of [
      ['touchstart', 160],
      ['touchmove', 340],
      ['touchend', 340],
    ] as const) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: type === 'touchend' ? [] : [{ clientX: 180, clientY: y }],
      });
      element.dispatchEvent(event);
    }
  });
  await expect(page.locator('.sf-pull-refresh')).toBeHidden();
  expect(state.reads()).toBe(2);
  await pull(50, false);
  await expect(page.getByRole('status').filter({ hasText: 'Puxe para atualizar' })).toBeVisible();
  await expect.poll(async () => (await card.boundingBox())!.y - before.y).toBeGreaterThan(20);
  await viewport.dispatchEvent('touchcancel');
  await expect.poll(() => content.evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  expect(state.reads()).toBe(2);
  await pull(160, false);
  await expect(page.getByRole('status').filter({ hasText: 'Solte para atualizar' })).toBeVisible();
  const fastDistance = (await card.boundingBox())!.y - before.y;
  expect(fastDistance).toBeGreaterThan(64);
  expect(fastDistance).toBeLessThan(109);
  await page.screenshot({ path: test.info().outputPath('musician-elastic-pull.png') });
  await viewport.dispatchEvent('touchcancel');
  await expect.poll(() => content.evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  await pull(160, false, 4);
  await expect(page.getByRole('status').filter({ hasText: 'Solte para atualizar' })).toBeVisible();
  const slowDistance = (await card.boundingBox())!.y - before.y;
  expect(slowDistance).toBeCloseTo(fastDistance, 0);
  await viewport.dispatchEvent('touchend');
  await expect.poll(state.reads).toBe(3);
  await expect(page.locator('.sf-pull-refresh')).toBeHidden();
  await expect.poll(() => content.evaluate((el) => getComputedStyle(el).translate)).toBe('none');
  expect((await card.boundingBox())!.y).toBeCloseTo(before.y, 0);
  await page.screenshot({ path: test.info().outputPath('musician-pull-refresh.png') });
});
