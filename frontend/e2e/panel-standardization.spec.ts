import { expect, test, Page } from '@playwright/test';

const session = {
  id: 'current',
  name: 'Karaokê no Café Tão com convidados e músicos',
  status: 'OPEN',
  createdAt: '2026-11-14T12:00:00Z',
};
const suggestions = Array.from({ length: 30 }, (_, i) => ({
  participantId: 'p-' + i,
  name: 'Participante ' + (i + 1),
  title: 'Música ' + (i + 1),
  artist: 'Artista com nome comprido',
  completed: 0,
  tableLabel: null,
  requestId: 'r-' + i,
  reason: 'Próxima oportunidade',
}));
const stage = {
  suggestions,
  active: {
    id: 'call',
    participantId: 'singing',
    participantName: 'Ana Maria',
    title: 'Equalize',
    artist: 'Pitty',
    status: 'CALLED',
    acceptedAt: null,
  },
  waits: [],
  history: [
    {
      id: 'completed',
      participantName: 'João',
      title: 'Tempo Perdido',
      artist: 'Legião Urbana',
      status: 'COMPLETED',
    },
  ],
};

async function geometry(page: Page) {
  const header = await page.locator('.sf-panel-header').boundingBox();
  const dock = await page
    .getByRole('navigation', { name: /Navegação (do músico|administrativa)/ })
    .boundingBox();
  const viewport = await page.locator('.sf-workspace-viewport').boundingBox();
  expect(viewport!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  expect(viewport!.y + viewport!.height).toBeLessThanOrEqual(dock!.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
}

test('musician dock keeps full queue search and scroll, with read-only stage and history at 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (path.endsWith('/musicians/sessions')) return route.fulfill({ json: [session] });
    if (path.endsWith('/musicians/sessions/current'))
      return route.fulfill({ json: { session, stage } });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  await expect(page.getByRole('heading', { name: 'Ana Maria', exact: true })).toBeVisible();
  await geometry(page);
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await page.getByLabel('Buscar na fila', { exact: true }).fill('Música 27');
  const queue = page.getByRole('region', { name: 'Próximas músicas', exact: true });
  await expect(queue.locator('.history-order')).toHaveText(['27']);
  await page.getByRole('tab', { name: 'Palco', exact: true }).click();
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(page.getByLabel('Buscar na fila', { exact: true })).toHaveValue('Música 27');
  await page.getByLabel('Buscar na fila', { exact: true }).fill('');
  await expect(queue.locator('li')).toHaveCount(30);
  const viewport = page.locator('.sf-workspace-viewport');
  await viewport.evaluate((el) => {
    el.scrollTop = 700;
  });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico do palco', exact: true })).toContainText(
    'Tempo Perdido',
  );
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  await geometry(page);
  await page.getByRole('button', { name: 'Opções do músico', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  await page.screenshot({ path: info.outputPath('musician-workspace.png') });
  for (const name of ['Chamar', 'Concluir apresentação', 'Criar participante'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
});

test('admin dock retains each collection filter and uses bordered items without page scrolling', async ({
  page,
}, info) => {
  const calls: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          email: 'admin@example.test',
          role: 'HOST',
          administrator: true,
          emailVerified: true,
          status: 'APPROVED',
        },
      });
    if (path.endsWith('/admin/accounts'))
      return route.fulfill({
        json: {
          items: Array.from({ length: 25 }, (_, i) => ({
            name: 'Músico ' + i,
            email: 'p' + i + '@example.test',
            role: 'MUSICIAN',
            status: 'PENDING',
            emailVerified: true,
            version: 0,
          })),
          total: 25,
          page: 0,
          size: 25,
        },
      });
    if (path.endsWith('/admin/sessions'))
      return route.fulfill({
        json: [{ session, host: { name: 'Anfitrião', email: 'host@example.test' } }],
      });
    if (path.endsWith('/admin/catalog/songs'))
      return route.fulfill({
        json: {
          items: [
            { id: 'song', title: 'Equalize', artist: 'Pitty', status: 'APPROVED', version: 1 },
          ],
          total: 1,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Cadastros', exact: true })).toBeVisible();
  await geometry(page);
  await expect(page.locator('.admin-account-row').first()).toHaveCSS('border-radius', '12px');
  await page.getByLabel('Buscar cadastro', { exact: true }).fill('Músico');
  const viewport = page.locator('.sf-workspace-viewport');
  await viewport.evaluate((el) => {
    el.scrollTop = 500;
  });
  await page.getByRole('tab', { name: 'Sessões', exact: true }).click();
  await page.getByLabel('Buscar sessão ou anfitrião').fill('Café');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await page.getByLabel('Buscar música ou artista', { exact: true }).fill('Eq');
  await page.getByRole('tab', { name: 'Cadastros', exact: true }).click();
  await expect(page.getByLabel('Buscar cadastro', { exact: true })).toHaveValue('Músico');
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(300);
  await page.getByRole('tab', { name: 'Sessões', exact: true }).click();
  await expect(page.getByLabel('Buscar sessão ou anfitrião')).toHaveValue('Café');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(page.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue('Eq');
  expect(calls.filter((path) => path.endsWith('/admin/catalog/songs'))).toHaveLength(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await geometry(page);
  await page.screenshot({ path: info.outputPath('admin-workspace.png') });
});
