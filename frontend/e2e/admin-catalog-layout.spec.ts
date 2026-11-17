import { expect, test } from '@playwright/test';

test('admin catalogue shares the participant tab card with fixed search and separate synchronization', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const writes: string[] = [];
  const songs = Array.from({ length: 25 }, (_, index) => ({
    id: 's-' + index,
    title: 'Música ' + (index + 1),
    artist: 'Artista ' + (index + 1),
    status: 'APPROVED',
    source: 'ADMIN',
    version: 1,
  }));
  const run = {
    id: 'run-layout',
    status: 'COMPLETED',
    startedBy: 'admin@example.test',
    createdAt: '2026-11-15T12:00:00Z',
    message: '',
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') writes.push(url.pathname);
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          email: 'admin@example.test',
          administrator: true,
          role: 'HOST',
          status: 'APPROVED',
          emailVerified: true,
        },
      });
    if (url.pathname.endsWith('/admin/accounts'))
      return route.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    if (url.pathname.endsWith('/admin/catalog/songs'))
      return route.fulfill({
        json: {
          items: songs,
          total: 50,
          page: Number(url.searchParams.get('page') ?? 0),
          size: 25,
        },
      });
    if (url.pathname.endsWith('/sync/workspace'))
      return route.fulfill({
        json: {
          current: {
            run,
            pendingReview: 1,
            counts: {
              total: 1,
              processed: 1,
              automatic: 0,
              approved: 0,
              review: 1,
              failed: 0,
              skipped: 0,
              queued: 0,
              processing: 0,
            },
            currentTitle: '',
          },
        },
      });
    if (url.pathname.endsWith('/sync/runs')) return route.fulfill({ json: [run] });
    if (url.pathname.endsWith('/items'))
      return route.fulfill({ json: { items: [], total: 0, page: 0, size: 20 } });
    if (url.pathname.endsWith('/sync/runs/run-layout'))
      return route.fulfill({
        json: {
          run,
          pendingReview: 1,
          currentTitle: '',
          counts: {
            total: 1,
            processed: 1,
            automatic: 0,
            approved: 0,
            review: 1,
            failed: 0,
            skipped: 0,
            queued: 0,
            processing: 0,
          },
        },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  const card = page.locator('.sf-admin-catalog-card');
  const catalogTab = card.getByRole('tab', { name: 'Catálogo de músicas', exact: true });
  const syncTab = card.getByRole('tab', { name: 'Sincronizar', exact: true });
  await expect(catalogTab).toHaveAttribute('aria-selected', 'true');
  await expect(card.getByRole('tab')).toHaveCount(2);
  await expect(card.getByRole('tab', { name: /Favoritas|Mais cantadas/ })).toHaveCount(0);
  await expect(card.getByRole('heading', { name: 'Catálogo de músicas', exact: true })).toHaveCSS(
    'position',
    'absolute',
  );
  await expect(card.getByRole('heading', { name: 'Catálogo de músicas', exact: true })).toHaveCSS(
    'width',
    '1px',
  );
  const search = page.getByLabel('Buscar música ou artista', { exact: true });
  await expect(search).toHaveAttribute('placeholder', 'Digite a música para buscar');
  const before = await search.boundingBox();
  const viewport = card.getByRole('region', {
    name: 'Listagem do catálogo administrativo',
    exact: true,
  });
  await expect(viewport.getByRole('listitem')).toHaveCount(25);
  await viewport.evaluate((el) => {
    el.scrollTop = 400;
  });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(300);
  expect((await search.boundingBox())!.y).toBe(before!.y);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const outer = page.locator('.sf-workspace-viewport');
  expect(await outer.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect(await catalogTab.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).not.toBe(
    '0px',
  );
  expect(await syncTab.evaluate((el) => getComputedStyle(el).borderTopRightRadius)).not.toBe('0px');
  const area = viewport.locator('..');
  expect(await area.evaluate((el) => getComputedStyle(el, '::after').boxShadow)).not.toBe('none');
  await search.fill('');
  await syncTab.click();
  await expect(
    card.getByRole('region', { name: 'Área de sincronização', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Progresso da sincronização', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar ao catálogo', exact: true })).toHaveCount(
    0,
  );
  await catalogTab.click();
  await expect(page.locator('.p-toast-message-warn')).toContainText(
    'Existem músicas pendentes de revisão',
  );
  await expect(search).toHaveValue('');
  await expect(search).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Cadastrar música', exact: true })).toHaveCSS(
    'background-color',
    'rgb(124, 58, 237)',
  );
  await page.getByRole('button', { name: 'Cadastrar música', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cadastrar música', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar cadastro', exact: true }).click();
  await page.locator('.p-toast-close-button').click();
  await expect(page.locator('.p-toast-message-warn')).toHaveCount(0);
  await viewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('admin-catalog-tabs.png'), scale: 'css' });
  expect(writes).toEqual([]);
});
