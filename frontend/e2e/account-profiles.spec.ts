import { expect, test } from '@playwright/test';
import { songDetails } from './helpers/song-details';
import { installRealtime } from './helpers/realtime';

const admin = {
  email: 'admin@example.test',
  name: 'Admin',
  role: 'HOST',
  roles: ['HOST', 'MUSICIAN'],
  administrator: true,
  emailVerified: true,
  status: 'APPROVED',
};
const session = {
  id: 'session',
  name: 'Quarta',
  status: 'OPEN',
  createdAt: '2026-11-19T12:00:00Z',
};

test('saving a catalog song preserves loaded pages and exact list scroll @release', async ({
  page,
}) => {
  const songs = Array.from({ length: 30 }, (_, i) => ({
    id: `song-${i}`,
    title: `Música ${String(i + 1).padStart(2, '0')}`,
    artist: 'Artista',
    status: 'APPROVED',
    source: 'ADMIN',
    originalKey: null,
    version: 0,
  }));
  let listReads = 0;
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (path.endsWith('/auth/me')) return r.fulfill({ json: admin });
    if (path.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/details')) {
      const id = path.split('/').at(-2),
        song = songs.find((s) => s.id === id)!;
      if (req.method() === 'GET') return r.fulfill({ json: songDetails(song) });
      Object.assign(song, req.postDataJSON(), { version: song.version + 1 });
      return r.fulfill({ json: song });
    }
    if (path === '/api/admin/catalog/songs') {
      listReads++;
      const index = Number(url.searchParams.get('page') ?? 0);
      return r.fulfill({
        json: { items: songs.slice(index * 10, index * 10 + 10), total: 30, page: index, size: 10 },
      });
    }
    if (path === '/api/admin/accounts')
      return r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    return r.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(page.locator('.admin-song-item')).toHaveCount(20);
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(page.locator('.admin-song-item')).toHaveCount(30);
  await expect(page.locator('.sf-application-loading')).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  const target = page.getByRole('button', {
    name: 'Informações de Música 18 — Artista',
    exact: true,
  });
  await target.scrollIntoViewIfNeeded();
  const viewport = page.getByRole('region', { name: 'Listagem do catálogo administrativo' });
  const before = await viewport.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(100);
  await target.click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await modal.getByLabel('Título da música', { exact: true }).fill('Música 18 corrigida');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.admin-song-item')).toHaveCount(30);
  await expect(
    page.getByRole('button', { name: 'Informações de Música 18 corrigida — Artista', exact: true }),
  ).toBeVisible();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
  expect(listReads).toBe(3);
});

test('admin edits the song inside the musician panel while a regular musician cannot @release', async ({
  page,
}) => {
  let song = {
    id: 'song',
    title: 'Giz',
    artist: 'Legião Urbana',
    originalKey: 'C',
    status: 'APPROVED',
    source: 'ADMIN',
    version: 0,
  };
  const writes: string[] = [],
    unexpected: string[] = [];
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/me')) return r.fulfill({ json: admin });
    if (path.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path === '/api/musicians/sessions') return r.fulfill({ json: [session] });
    if (path === '/api/musicians/sessions/session')
      return r.fulfill({
        json: {
          session,
          stage: {
            active: null,
            suggestions: [
              {
                participantId: 'p',
                name: 'Ana',
                title: song.title,
                artist: song.artist,
                catalogSongId: 'song',
                completed: 0,
              },
            ],
            history: [],
            waits: [],
          },
          chords: {},
          streaming: {},
        },
      });
    if (path.endsWith('/details')) {
      if (req.method() === 'GET') return r.fulfill({ json: songDetails(song) });
      writes.push(path);
      song = { ...song, ...req.postDataJSON(), version: song.version + 1 };
      return r.fulfill({ json: song });
    }
    unexpected.push(path);
    return r.fulfill({ status: 403 });
  });
  await installRealtime(page);
  await page.goto('/musico');
  await expect(page.getByRole('heading', { name: 'Quarta', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(page.locator('.sf-application-loading')).toBeHidden();
  await page.getByRole('button', { name: 'Editar música Giz', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await modal.getByLabel('Tom original', { exact: true }).fill('Dm');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Fila', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(page.url()).toContain('/musico');
  expect(writes).toEqual(['/api/admin/catalog/songs/song/details']);
  expect(unexpected).toEqual([]);
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { ...admin, role: 'MUSICIAN', roles: ['MUSICIAN'], administrator: false } }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Quarta', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar música Giz', exact: true })).toHaveCount(0);
});

test('admin can associate an additional profile without changing email or original profile @release', async ({
  page,
}) => {
  let account = {
    ...admin,
    email: 'host@example.test',
    name: 'Vila',
    roles: ['HOST'],
    administrator: false,
    version: 0,
    createdAt: '2026-11-19T12:00:00Z',
  };
  const writes: any[] = [];
  await page.route('**/api/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/auth/me')) return r.fulfill({ json: admin });
    if (path.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/accounts/history')) return r.fulfill({ json: [] });
    if (path.endsWith('/accounts/profiles')) {
      const body = r.request().postDataJSON();
      writes.push(body);
      account = { ...account, roles: body.roles, version: 1 };
      return r.fulfill({ json: account });
    }
    if (path.endsWith('/accounts'))
      return r.fulfill({ json: { items: [account], total: 1, page: 0, size: 25 } });
    return r.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await page.getByRole('button').filter({ hasText: 'Vila' }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhes do cadastro', exact: true });
  await expect(modal.getByRole('checkbox', { name: 'Anfitrião', exact: true })).toBeDisabled();
  await modal.getByRole('checkbox', { name: 'Músico', exact: true }).check();
  await modal.getByRole('button', { name: 'Salvar perfis', exact: true }).click();
  await expect
    .poll(() => writes)
    .toEqual([{ email: 'host@example.test', roles: ['HOST', 'MUSICIAN'], version: 0 }]);
  await expect(modal.getByRole('checkbox', { name: 'Músico', exact: true })).toBeChecked();
});
