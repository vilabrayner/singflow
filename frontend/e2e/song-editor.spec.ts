import { songDetails } from './helpers/song-details';
import { test, expect, Page } from '@playwright/test';
const original = {
  id: 'song',
  title: 'Giz',
  artist: 'Legião Urbana',
  originalKey: 'C',
  version: 4,
  status: 'APPROVED',
  source: 'ADMIN',
};
const initial = {
  cifra: 'https://www.cifraclub.com.br/legiao-urbana/giz/',
  spotify: 'https://open.spotify.com/track/0123456789abcdefghijkl',
  youtube: 'https://www.youtube.com/watch?v=Abcde_12-XY',
};
async function fixture(page: Page, conflict = false, open = true) {
  let song = { ...original };
  const refs = { ...initial };
  const writes: any[] = [];
  const searches: string[] = [];
  const reads: string[] = [];
  const providers = [
    { type: 'spotify', label: 'Spotify', icon: 'fa-spotify' },
    { type: 'youtube', label: 'YouTube', icon: 'fa-youtube' },
  ];
  await page.route('**/api/**', async (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/me'))
      return r.fulfill({
        json: {
          email: 'admin@example.test',
          role: 'HOST',
          administrator: true,
          emailVerified: true,
          status: 'APPROVED',
        },
      });
    if (path.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/streaming/providers'))
      return r.fulfill({
        json: [
          { type: 'spotify', label: 'Spotify', icon: 'fa-spotify' },
          { type: 'youtube', label: 'YouTube', icon: 'fa-youtube' },
        ],
      });
    if (path.includes('/enrichment/') || path.includes('/search')) {
      searches.push(path);
      return r.fulfill({ status: 500 });
    }
    if (req.method() === 'GET') reads.push(path);
    if (path.endsWith('/details') && req.method() === 'GET')
      return r.fulfill({ json: songDetails(song, refs, providers) });
    if (path.endsWith('/details')) {
      const body = req.postDataJSON();
      writes.push({ path, body });
      expect(req.headers()['x-csrf-token']).toBe('csrf');
      if (conflict)
        return r.fulfill({
          status: 409,
          json: { detail: 'A música mudou. Atualize antes de salvar.' },
        });
      song = {
        ...song,
        title: body.title,
        artist: body.artist,
        originalKey: body.originalKey,
        version: song.version + 1,
      };
      Object.assign(refs, body.references);
      return r.fulfill({ json: song });
    }
    if (path.endsWith('/chords'))
      return r.fulfill({
        json: {
          songId: 'song',
          officialUrl: refs.cifra,
          effectiveUrl: refs.cifra,
          version: song.version,
          personalUrl: null,
          personalVersion: 0,
          alternatives: [],
        },
      });
    if (path.includes('/streaming/')) {
      const type = path.endsWith('/spotify') ? 'spotify' : 'youtube';
      return r.fulfill({
        json: {
          songId: 'song',
          type,
          label: type,
          icon: 'fa-' + type,
          url: refs[type],
          version: song.version,
        },
      });
    }
    return r.fulfill({
      json: { items: path.includes('/catalog/songs') ? [song] : [], total: 1, page: 0, size: 10 },
    });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  if (open)
    await page
      .getByRole('button', { name: 'Informações de Giz — Legião Urbana', exact: true })
      .click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  return { modal, writes, searches, refs, reads, providers };
}
test('one Save retains all tab drafts, clears links and writes every change in one request @release', async ({
  page,
}, info) => {
  const { modal, writes, searches, refs } = await fixture(page);
  const footer = modal.locator('[dialog-footer]');
  await expect(footer.getByRole('button')).toHaveCount(2);
  await expect(modal.getByRole('tab')).toHaveCount(4);
  await footer.getByRole('button', { name: 'Salvar', exact: true }).click({ trial: true });
  for (const label of ['Dados', 'Cifra', 'Spotify', 'YouTube']) {
    const tab = modal.getByRole('tab', { name: label, exact: true });
    await expect(tab).toHaveText('');
    const geometry = await tab.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        i = el.querySelector('i, .sf-cifra-icon')!,
        b = i.getBoundingClientRect();
      return {
        offset: Math.abs(b.x + b.width / 2 - (r.x + r.width / 2)),
        width: b.width,
        height: b.height,
      };
    });
    expect(geometry.width).toBe(20);
    expect(geometry.height).toBe(20);
    expect(geometry.offset).toBeLessThan(1);
  }
  const cifra = modal.getByRole('tab', { name: 'Cifra', exact: true });
  await expect(cifra.locator('.sf-cifra-icon')).toHaveCount(1);
  expect(
    await cifra.locator('.sf-cifra-icon').evaluate((el) => getComputedStyle(el).maskImage),
  ).toContain('cifra-club-icon.png');
  const area = modal.locator('.sf-editor-scrollarea'),
    viewport = area.locator('.p-scrollarea-viewport');
  await footer.getByRole('button', { name: 'Salvar', exact: true }).click({ trial: true });
  const before = await footer.boundingBox();
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const after = await footer.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(await area.evaluate((el) => getComputedStyle(el, '::after').boxShadow)).not.toBe('none');
  await viewport.evaluate((el) => {
    el.scrollTop = 0;
  });
  await modal.getByLabel('Tom original', { exact: true }).fill('D');
  await cifra.click();
  await modal
    .getByLabel('Link da cifra', { exact: true })
    .fill(initial.cifra + 'simplificada.html');
  await expect(
    modal.getByRole('link', { name: 'Abrir link da cifra', exact: true }),
  ).toHaveAttribute('href', initial.cifra + 'simplificada.html');
  await expect(
    modal.getByRole('link', { name: 'Abrir link da cifra', exact: true }).locator('i'),
  ).toHaveClass('fa-solid fa-up-right-from-square');
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await modal
    .getByRole('tabpanel')
    .getByLabel('Link da música', { exact: true })
    .fill('https://open.spotify.com/track/abcdefghijkl0123456789');
  await modal.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue(initial.youtube);
  await modal.getByRole('button', { name: 'Limpar link da música', exact: true }).click();
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue('');
  await expect(modal.getByRole('link', { name: 'Abrir link da música', exact: true })).toHaveCount(
    0,
  );
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue('https://open.spotify.com/track/abcdefghijkl0123456789');
  await cifra.click();
  await expect(modal.getByLabel('Link da cifra', { exact: true })).toHaveValue(
    initial.cifra + 'simplificada.html',
  );
  await modal.getByRole('tab', { name: 'Dados', exact: true }).click();
  await expect(modal.getByLabel('Tom original', { exact: true })).toHaveValue('D');
  expect(writes).toHaveLength(0);
  expect(searches).toHaveLength(0);
  await page.screenshot({
    path: info.outputPath('song-editor-unified.png'),
    animations: 'disabled',
  });
  await footer.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes).toEqual([
    {
      path: '/api/admin/catalog/songs/song/details',
      body: {
        version: 4,
        title: 'Giz',
        artist: 'Legião Urbana',
        originalKey: 'D',
        references: {
          cifra: initial.cifra + 'simplificada.html',
          spotify: 'https://open.spotify.com/track/abcdefghijkl0123456789',
          youtube: '',
        },
      },
    },
  ]);
  expect(refs.youtube).toBe('');
});
test('invalid drafts disable Save across tabs and conflicts retain the full draft', async ({
  page,
}) => {
  const { modal, writes } = await fixture(page, true);
  const save = modal.getByRole('button', { name: 'Salvar', exact: true });
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await modal
    .getByRole('tabpanel')
    .getByLabel('Link da música', { exact: true })
    .fill('https://evil.test/track/123');
  await expect(save).toBeDisabled();
  await modal.getByRole('tab', { name: 'Dados', exact: true }).click();
  await expect(save).toBeDisabled();
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await modal.getByRole('button', { name: 'Limpar link da música', exact: true }).click();
  await expect(save).toBeEnabled();
  await modal.getByRole('tab', { name: 'Dados', exact: true }).click();
  await modal.getByLabel('Tom original', { exact: true }).fill('Am');
  await save.click();
  await expect(modal.getByRole('alert')).toContainText('A música mudou');
  await expect(modal.getByLabel('Tom original', { exact: true })).toHaveValue('Am');
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue('');
  expect(writes).toHaveLength(1);
});
test('saving Data without visiting resources preserves existing references', async ({ page }) => {
  const { modal, writes, refs, searches } = await fixture(page);
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes[0].body.references).toEqual({});
  expect(refs).toEqual(initial);
  expect(searches).toHaveLength(0);
});

test('one initial read serves every reference tab without rebuilding editors or showing loading again', async ({
  page,
}) => {
  const { modal, reads, searches } = await fixture(page);
  await expect(modal).toBeVisible();
  await expect(page.locator('.sf-application-loading')).toBeHidden();
  const firstReads = [...reads];
  for (const label of ['Cifra', 'Spotify', 'YouTube', 'Dados', 'Spotify', 'Cifra', 'YouTube']) {
    await modal.getByRole('tab', { name: label, exact: true }).click();
    await expect(page.locator('p-progress-spinner')).toHaveCount(0);
    if (label === 'Cifra')
      await expect(modal.getByLabel('Link da cifra', { exact: true })).toHaveValue(initial.cifra);
    if (label === 'Spotify')
      await expect(
        modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
      ).toHaveValue(initial.spotify);
    if (label === 'YouTube')
      await expect(
        modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
      ).toHaveValue(initial.youtube);
  }
  expect(reads).toEqual(firstReads);
  expect(reads.filter((path) => path.endsWith('/details'))).toHaveLength(1);
  expect(reads.some((path) => path.includes('/streaming/') || path.endsWith('/chords'))).toBe(
    false,
  );
  expect(searches).toEqual([]);
  await expect(modal.locator('app-streaming-search')).toHaveCount(2);
  await expect(modal.locator('app-chord-link-dialog')).toHaveCount(1);
});

test('opening loads one complete snapshot, releases loading on error and reloads fresh data on reopening', async ({
  page,
}) => {
  const { modal, providers } = await fixture(page, false, false);
  let release!: () => void;
  let failed = false;
  let originalKey = 'D';
  let count = 0;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/admin/catalog/songs/song/details', async (r) => {
    count++;
    if (count === 1) await pending;
    return failed
      ? r.fulfill({ status: 503 })
      : r.fulfill({ json: songDetails({ ...original, originalKey }, initial, providers) });
  });
  const open = page.getByRole('button', {
    name: 'Informações de Giz — Legião Urbana',
    exact: true,
  });
  await open.click();
  const spinner = page.getByRole('progressbar', { name: 'Carregando dados', exact: true });
  await expect(spinner).toBeVisible();
  await expect(modal).toHaveCount(0);
  const mask = await page.locator('.sf-application-loading').boundingBox();
  expect(mask!.width).toBeCloseTo(page.viewportSize()!.width, 0);
  expect(mask!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  release();
  await expect(modal.getByLabel('Tom original', { exact: true })).toHaveValue('D');
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  failed = true;
  await open.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(spinner).toHaveCount(0);
  await expect(modal).toHaveCount(0);
  failed = false;
  originalKey = 'Bm';
  await open.click();
  await expect(modal.getByLabel('Tom original', { exact: true })).toHaveValue('Bm');
  expect(count).toBe(3);
});
