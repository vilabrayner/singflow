import { test, expect } from '@playwright/test';
const session = '11111111-1111-4111-8111-111111111111';
const first = {
  id: 'a',
  participantId: 'self',
  title: 'Música A',
  artist: 'Artista A',
  status: 'PENDING',
  createdAt: new Date().toISOString(),
};
const second = { ...first, id: 'b', title: 'Música B', artist: 'Artista B' };

test('participant chooses catalog and Lastfm songs, continues choosing and falls back to free text', async ({
  page,
}, testInfo) => {
  let requests = [first];
  const posts: Record<string, unknown>[] = [];
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
    requests,
    active: null,
    history: [],
    suggested: false,
    queuePosition: 3,
    canReturn: false,
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/songs/catalog'))
      return route.fulfill({
        json: {
          items: [
            { id: 'catalog-a', title: 'Equalize', artist: 'Pitty' },
            { title: '  MÚSICA   A ', artist: 'ARTISTA A' },
            { title: 'Música A', artist: 'Outro artista' },
          ],
          total: 1,
          page: 0,
          size: 20,
        },
      });
    if (path.endsWith('/songs/search'))
      return route.fulfill({
        json:
          url.searchParams.get('q') === 'Sem resultado'
            ? []
            : [
                {
                  title: 'Giz',
                  artist: 'Legião Urbana',
                  source: 'LASTFM',
                  selectionToken: '11111111-2222-4333-8444-555555555555',
                },
              ],
      });
    if (path.endsWith('/requests')) {
      const input = route.request().postDataJSON();
      posts.push(input);
      requests = [
        ...requests,
        { ...first, id: 'new-' + posts.length, title: input.title, artist: input.artist },
      ];
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/me')) return route.fulfill({ json: own() });
    if (path.includes('/public/'))
      return route.fulfill({ json: { name: 'Café Tão', status: 'OPEN' } });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/participante/${session}/entry-code`);
  await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Adicionar música', exact: true });
  const alreadyAdded = modal.getByRole('img', { name: /Já adicionada:.*MÚSICA/ });
  await expect(alreadyAdded).toBeVisible();
  await expect(modal.getByRole('button', { name: /Adicionar.*MÚSICA/ })).toHaveCount(0);
  await expect(alreadyAdded.locator('.pi-check')).toBeVisible();
  await expect(
    modal.getByRole('button', { name: 'Adicionar Música A — Outro artista', exact: true }),
  ).toBeEnabled();
  const addButton = modal.getByRole('button', { name: 'Adicionar Equalize — Pitty', exact: true });
  await expect(addButton).toHaveClass(/sf-primary/);
  await expect(addButton.locator('.pi-plus')).toBeVisible();
  await expect(addButton).toHaveText('');

  await modal.getByRole('button', { name: 'Adicionar Equalize — Pitty', exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  await expect(
    modal.getByRole('img', { name: 'Já adicionada: Equalize — Pitty', exact: true }),
  ).toBeVisible();
  await expect(
    modal.getByRole('button', { name: 'Adicionar Equalize — Pitty', exact: true }),
  ).toHaveCount(0);
  await expect(modal).toBeVisible();
  await modal.getByLabel('Buscar música ou artista', { exact: true }).fill('Giz');
  await modal.getByRole('button', { name: 'Adicionar Giz — Legião Urbana', exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].selectionToken).toBe('11111111-2222-4333-8444-555555555555');
  await modal.getByLabel('Buscar música ou artista', { exact: true }).fill('Sem resultado');
  await expect(
    modal.getByText('Nenhuma música encontrada. Você pode informar o título manualmente.', {
      exact: true,
    }),
  ).toBeVisible();
  await modal.getByRole('button', { name: 'Não encontrei minha música', exact: true }).click();
  await modal.getByLabel('Música', { exact: true }).fill('Minha composição');
  await modal.getByRole('button', { name: 'Pedir música', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(posts[2].selectionToken).toBe('');
  await expect(page.getByText('Posição sugerida · 3º')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('participant-choices.png'), fullPage: true });
});

test('participant reorders only pending choices and reserved song has no reorder controls', async ({
  page,
}) => {
  let songs = [first, second];
  let active = false;
  let conflict = false;
  const reorder: Record<string, unknown>[] = [];
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
    requests: songs,
    active: active
      ? { id: 'call', title: 'Música B', artist: 'Artista B', acceptedAt: null }
      : null,
    history: [],
    suggested: false,
    queuePosition: 2,
    canReturn: false,
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/requests/reorder')) {
      const input = route.request().postDataJSON();
      reorder.push(input);
      if (conflict) {
        active = true;
        songs = [{ ...second, status: 'RESERVED' }, first];
        return route.fulfill({
          status: 409,
          json: { detail: 'As músicas mudaram ou uma já foi convocada. A lista será atualizada.' },
        });
      }
      songs = [second, first];
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/me')) return route.fulfill({ json: own() });
    if (path.includes('/public/'))
      return route.fulfill({ json: { name: 'Café Tão', status: 'OPEN' } });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/participante/${session}/entry-code`);
  await expect(page.locator('.pi-caret-up, .pi-caret-down')).toHaveCount(0);
  await page.getByRole('button', { name: /^Ordenar Música B/ }).press('ArrowUp');
  await expect.poll(() => reorder.length).toBe(1);
  expect(reorder[0]).toMatchObject({ expectedOrder: ['a', 'b'], order: ['b', 'a'] });
  await expect(page.getByRole('listitem').first()).toContainText('Música B');
  await expect(page.getByText('Ordem das músicas atualizada', { exact: true })).toBeVisible();
  conflict = true;
  await page.getByRole('button', { name: /^Ordenar Música A/ }).press('ArrowUp');
  await expect(page.getByRole('alert')).toContainText('As músicas mudaram');
  await expect(
    page.getByRole('button', { name: 'Trocar música Música B', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'É a sua vez!', exact: true })).toBeVisible();
});

test('participant has three cards and drags pending choices without changing queue position', async ({
  page,
}, testInfo) => {
  let songs = [
    first,
    second,
    {
      ...first,
      id: 'c',
      title: 'Uma música com um nome muito longo para conferir a quebra no celular',
      artist: 'Artista com nome completo',
    },
  ];
  const changes: Record<string, unknown>[] = [];
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
    requests: songs,
    history: [],
    active: null,
    queuePosition: 3,
    canReturn: false,
    suggested: false,
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/requests/reorder')) {
      const body = route.request().postDataJSON();
      changes.push(body);
      songs = body.order.map((id: string) => songs.find((s) => s.id === id)!);
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/me')) return route.fulfill({ json: own() });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/participante/${session}/entry-code`);
  await expect(page.locator('.participant-page app-surface-card')).toHaveCount(3);
  await expect(page.getByText('Posição sugerida · 3º', { exact: true })).toBeVisible();
  const rows = page.getByRole('listitem');
  const handle = rows.nth(2).locator('.choice-grip');
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox(),
    to = await rows.first().boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2 - 8, { steps: 4 });
  await page.mouse.move(to!.x + 16, to!.y + 8, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => changes.length).toBe(1);
  expect(changes[0]).toMatchObject({ expectedOrder: ['a', 'b', 'c'], order: ['c', 'a', 'b'] });
  await expect(rows.first()).toContainText('Uma música com um nome muito longo');
  await expect(page.getByText('Posição sugerida · 3º', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('participant-three-cards.png'),
    fullPage: true,
  });
});

test('participant replaces a pending song in place and handles an already called song', async ({
  page,
}) => {
  let song = { ...first };
  let reserved = false;
  const updates: Record<string, unknown>[] = [];
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
    requests: [song, second],
    history: [],
    active: reserved
      ? { id: 'call', title: song.title, artist: song.artist, acceptedAt: null }
      : null,
    queuePosition: 3,
    canReturn: false,
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/songs/catalog'))
      return route.fulfill({
        json: { items: [{ title: 'Giz', artist: 'Legião Urbana' }], total: 1 },
      });
    if (path.endsWith('/requests/a/edit')) {
      const input = route.request().postDataJSON();
      updates.push(input);
      if (reserved)
        return route.fulfill({
          status: 409,
          json: { detail: 'Somente pedidos pendentes podem ser alterados. Atualize a lista.' },
        });
      song = { ...song, title: input.title, artist: input.artist };
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/me')) return route.fulfill({ json: own() });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/participante/${session}/entry-code`);
  await page.getByRole('button', { name: 'Trocar música Música A', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Trocar música', exact: true });
  await expect(
    modal
      .getByRole('button', { name: 'Trocar por Giz — Legião Urbana', exact: true })
      .locator('.pi-arrow-right-arrow-left'),
  ).toBeVisible();
  await modal.getByRole('button', { name: 'Trocar por Giz — Legião Urbana', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('listitem').first()).toContainText('Giz');
  expect(updates[0]).toMatchObject({
    expectedTitle: 'Música A',
    expectedArtist: 'Artista A',
    title: 'Giz',
    artist: 'Legião Urbana',
  });
  await expect(page.getByText('Posição sugerida · 3º', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trocar música Giz', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Trocar música', exact: true });
  await modal.getByRole('button', { name: 'Não encontrei minha música', exact: true }).click();
  await modal.getByLabel('Música', { exact: true }).fill('Outra música');
  reserved = true;
  song = { ...song, status: 'RESERVED' };
  await modal.getByRole('button', { name: 'Salvar alteração', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Somente pedidos pendentes');
  await expect(modal.getByLabel('Música', { exact: true })).toHaveValue('Outra música');
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Trocar música Giz', exact: true })).toHaveCount(0);
});

test('song chooser has three tabs and keeps search and manual entry inside catalog', async ({
  page,
}, testInfo) => {
  let searches = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/songs/catalog'))
      return route.fulfill({
        json: {
          items: Array.from({ length: 20 }, (_, i) => ({
            title: 'Música ' + i,
            artist: 'Artista ' + i,
          })),
          total: 20,
        },
      });
    if (path.endsWith('/songs/search')) {
      searches++;
      return route.fulfill({ json: [{ title: 'Giz', artist: 'Legião Urbana', source: 'LASTFM' }] });
    }
    if (path.endsWith('/me'))
      return route.fulfill({
        json: {
          session: { id: session, name: 'Café Tão', status: 'OPEN' },
          participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
          requests: [first],
          history: [],
          active: null,
          queuePosition: 3,
          canReturn: false,
        },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/participante/${session}/entry-code`);
  await page.getByRole('button', { name: 'Trocar música Música A', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Trocar música', exact: true });
  await expect(modal.getByRole('tab')).toHaveCount(3);
  await expect(modal.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const box = await modal.boundingBox();
      const viewport = page.viewportSize()!;
      return (
        !!box &&
        Math.abs(box.x - (viewport.width >= 768 ? 24 : 12)) < 2 &&
        Math.abs(box.y - (viewport.width >= 768 ? 24 : 12)) < 2 &&
        Math.abs(box.width - (viewport.width - (viewport.width >= 768 ? 48 : 24))) < 2 &&
        Math.abs(box.height - (viewport.height - (viewport.width >= 768 ? 48 : 24))) < 2
      );
    })
    .toBe(true);
  const tabsBefore = await modal.getByRole('tablist').boundingBox();
  const footerBefore = await modal.locator('[dialog-footer]').boundingBox();
  await expect
    .poll(() => modal.locator('.p-tabpanels').evaluate((el) => el.scrollHeight > el.clientHeight))
    .toBe(true);
  await modal.locator('.p-tabpanels').evaluate((el) => (el.scrollTop = el.scrollHeight));
  const tabsAfter = await modal.getByRole('tablist').boundingBox();
  const footerAfter = await modal.locator('[dialog-footer]').boundingBox();
  expect(Math.abs(tabsAfter!.y - tabsBefore!.y)).toBeLessThan(2);
  expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThan(2);
  await expect(modal.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await modal.locator('.p-tabpanels').evaluate((el) => (el.scrollTop = 0));

  await expect(modal.getByRole('tab', { name: 'Catálogo', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await modal.getByLabel('Buscar música ou artista', { exact: true }).fill('Giz');
  await expect(
    modal.getByRole('button', { name: 'Trocar por Giz — Legião Urbana', exact: true }),
  ).toBeVisible();
  await modal.getByRole('tab', { name: 'Músicas favoritas', exact: true }).click();
  await expect(modal.getByLabel('Buscar nas favoritas', { exact: true })).toBeDisabled();
  await expect(
    modal.getByText('Favoritas disponíveis após o cadastro de participantes.'),
  ).toBeVisible();
  await modal.getByRole('tab', { name: 'Mais cantadas', exact: true }).click();
  await expect(modal.getByLabel('Buscar nas mais cantadas', { exact: true })).toBeDisabled();
  await expect(
    modal.getByText('Mais cantadas disponíveis após o cadastro de participantes.'),
  ).toBeVisible();
  await modal.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(modal.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue('Giz');
  expect(searches).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('song-tabs-catalog.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Não encontrei minha música', exact: true }).click();
  await modal.getByLabel('Música', { exact: true }).fill('Minha música');
  await modal.getByRole('tab', { name: 'Músicas favoritas', exact: true }).click();
  await modal.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(modal.getByLabel('Música', { exact: true })).toHaveValue('Minha música');
  await modal.getByRole('button', { name: 'Voltar à busca no catálogo', exact: true }).click();
  await expect(modal.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue('Giz');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await modal.getByRole('tab', { name: 'Catálogo', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(modal.getByRole('tab', { name: 'Catálogo', exact: true })).toBeFocused();
});
