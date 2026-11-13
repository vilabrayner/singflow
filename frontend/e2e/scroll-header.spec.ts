import { expect, test } from '@playwright/test';

test('reload returns content below the fixed header and polling keeps the reading position', async ({
  page,
}) => {
  let reads = 0;
  const session = { id: 'scroll-session', name: 'Sessão Casa III', status: 'OPEN' };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (path.endsWith('/musicians/sessions')) return route.fulfill({ json: [session] });
    if (path.endsWith('/musicians/sessions/' + session.id)) {
      reads++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({
        json: {
          session,
          stage: {
            active: null,
            history: [],
            waits: [],
            suggestions: Array.from({ length: 18 }, (_, index) => ({
              participantId: String(index),
              name: 'Participante ' + (index + 1),
              title: 'Música ' + (index + 1),
              artist: 'Artista',
              completed: 0,
            })),
          },
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  await expect(page.getByRole('heading', { name: session.name, exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 120));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(120);
  await page.reload();
  await expect(page.getByRole('heading', { name: session.name, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const header = await page.locator('.sf-panel-header').boundingBox();
  const card = await page.locator('app-surface-card').first().boundingBox();
  expect(card!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  const previousReads = reads;
  await page.evaluate(() => window.scrollTo(0, 240));
  await expect.poll(() => reads, { timeout: 10000 }).toBeGreaterThan(previousReads);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(240);
});
