import {
  prepareManual,
  refreshParticipant,
  openParticipantCatalog,
} from './participant-ui-helpers';
import { test, expect, Page } from '@playwright/test';
async function openRequestSwap(page: Page, title: string) {
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const trigger = page.getByRole('button', { name: 'Opções de ' + title, exact: true });
  if (touch) await trigger.tap();
  else await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Configurar', exact: true })).toBeDisabled();
  const swap = page.getByRole('menuitem', { name: 'Trocar', exact: true });
  if (touch) await swap.tap();
  else await swap.click();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação do participante', exact: true })
      .getByRole('tab', { name: 'Catálogo', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog', { name: 'Trocar música', exact: true })).toHaveCount(0);
  return page.getByRole('region', { name: 'Catálogo', exact: true });
}

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
    if (path.endsWith('/songs/search-page'))
      return route.fulfill({
        json: {
          items:
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
          hasMore: false,
          nextSource: 'internet',
          nextPage: 1,
        },
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
  const modal = await openParticipantCatalog(page);
  const alreadyAdded = modal.getByRole('img', { name: /Já adicionada:.*MÚSICA/ });
  await expect(alreadyAdded).toBeVisible();
  await expect(modal.getByRole('button', { name: /Adicionar.*MÚSICA/ })).toHaveCount(0);
  await expect(alreadyAdded.locator('.fa-check')).toBeVisible();
  await expect(
    modal.getByRole('button', { name: 'Adicionar Música A — Outro artista', exact: true }),
  ).toBeEnabled();
  const addButton = modal.getByRole('button', { name: 'Adicionar Equalize — Pitty', exact: true });
  await expect(addButton).toHaveClass(/sf-primary/);
  await expect(addButton.locator('.fa-plus')).toBeVisible();
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
    modal.getByText('Nenhuma música encontrada. Você pode adicionar o título digitado.', {
      exact: true,
    }),
  ).toBeVisible();
  await prepareManual(modal, 'Minha composição');
  await modal.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  await expect(modal).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Navegação do participante', exact: true })
    .getByRole('tab', { name: 'Pedidos', exact: true })
    .click();
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
  await expect(page.locator('.fa-caret-up, .fa-caret-down')).toHaveCount(0);
  await page.getByRole('button', { name: /^Ordenar Música B/ }).press('ArrowUp');
  await expect.poll(() => reorder.length).toBe(1);
  expect(reorder[0]).toMatchObject({ expectedOrder: ['a', 'b'], order: ['b', 'a'] });
  await expect(page.getByRole('listitem').first()).toContainText('Música B');
  await expect(page.getByText('Ordem das músicas atualizada', { exact: true })).toBeVisible();
  conflict = true;
  await page.getByRole('button', { name: /^Ordenar Música A/ }).press('ArrowUp');
  await expect(page.getByRole('alert')).toContainText('As músicas mudaram');
  await expect(page.getByRole('button', { name: 'Opções de Música B', exact: true })).toHaveCount(
    0,
  );
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
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação do participante', exact: true })
      .getByRole('tab'),
  ).toHaveCount(3);
  await expect(
    page.getByRole('region', { name: 'Meu histórico de palco', exact: true }),
  ).toHaveCount(0);
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
  let modal = await openRequestSwap(page, 'Música A');
  await expect(
    modal
      .getByRole('button', { name: 'Trocar por Giz — Legião Urbana', exact: true })
      .locator('.fa-right-left'),
  ).toBeVisible();
  await modal.getByRole('button', { name: 'Trocar por Giz — Legião Urbana', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByRole('listitem').first()).toContainText('Giz');
  expect(updates[0]).toMatchObject({
    expectedTitle: 'Música A',
    expectedArtist: 'Artista A',
    title: 'Giz',
    artist: 'Legião Urbana',
  });
  await expect(page.getByText('Posição sugerida · 3º', { exact: true })).toBeVisible();
  modal = await openRequestSwap(page, 'Giz');
  await prepareManual(modal, 'Outra música');
  reserved = true;
  song = { ...song, status: 'RESERVED' };
  await modal.getByRole('button', { name: 'Trocar música', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Somente pedidos pendentes');
  await expect(modal.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue(
    'Outra música',
  );
  await modal.getByRole('button', { name: 'Cancelar troca', exact: true }).click();
  await refreshParticipant(page);
  await expect(page.getByRole('button', { name: 'Opções de Giz', exact: true })).toHaveCount(0);
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
    if (path.endsWith('/songs/search-page')) {
      searches++;
      return route.fulfill({
        json: {
          items: [{ title: 'Giz', artist: 'Legião Urbana', source: 'LASTFM' }],
          hasMore: false,
          nextSource: 'internet',
          nextPage: 1,
        },
      });
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
  const modal = await openRequestSwap(page, 'Música A');
  await expect(modal.getByRole('tab')).toHaveCount(3);
  await expect(modal.getByRole('button', { name: 'Cancelar troca', exact: true })).toBeVisible();
  const tabsBefore = await modal.getByRole('tablist').boundingBox();
  await modal.locator('.picker-results').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await modal.getByRole('tablist').boundingBox()).toEqual(tabsBefore);
  await modal.locator('.picker-results').evaluate((el) => (el.scrollTop = 0));
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
  await prepareManual(modal, 'Minha música');
  await modal.getByRole('tab', { name: 'Músicas favoritas', exact: true }).click();
  await modal.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(modal.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue(
    'Minha música',
  );
  await expect(modal.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue(
    'Minha música',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await modal.getByRole('tab', { name: 'Catálogo', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(modal.getByRole('tab', { name: 'Catálogo', exact: true })).toBeFocused();
});

async function workspaceFixture(page: import('@playwright/test').Page) {
  const requests = Array.from({ length: 18 }, (_, index) => ({
    ...first,
    id: 'choice-' + index,
    title: 'Escolha ' + index,
    artist: 'Artista ' + index,
  }));
  const state = {
    session: {
      id: session,
      name: 'Karaokê no Café Tão com um nome muito longo para o cabeçalho',
      status: 'OPEN',
    },
    participant: {
      id: 'self',
      name: 'Maria Clara de Souza',
      status: 'ACTIVE',
      completedPerformances: 1,
    },
    requests,
    active: null as null | { id: string; title: string; artist: string; acceptedAt: string | null },
    history: [
      {
        id: 'history-1',
        requestId: 'done',
        title: 'Canção concluída',
        artist: 'Artista',
        status: 'COMPLETED',
      },
    ],
    queuePosition: 4,
    canReturn: false,
  };
  let catalogReads = 0;
  const additions: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/songs/catalog')) {
      catalogReads++;
      return route.fulfill({
        json: {
          items: Array.from({ length: 10 }, (_, i) => ({
            title: 'Catálogo ' + i,
            artist: 'Artista',
          })),
          total: 10,
        },
      });
    }
    if (path.endsWith('/songs/search-page'))
      return route.fulfill({
        json: {
          items: [
            {
              title: 'Giz',
              artist: 'Legião Urbana',
              source: 'LASTFM',
              selectionToken: '11111111-2222-4333-8444-555555555555',
            },
          ],
          hasMore: false,
          nextSource: 'internet',
          nextPage: 1,
        },
      });
    if (path.endsWith('/requests') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      additions.push(body);
      expect(route.request().headers()['x-singflow-participant']).toBe('self');
      state.requests.push({
        ...first,
        id: 'added-' + additions.length,
        title: body.title,
        artist: body.artist,
      });
      return route.fulfill({ json: state });
    }
    if (path.endsWith('/requests/reorder')) {
      const body = route.request().postDataJSON();
      state.requests = body.order.map((id: string) =>
        state.requests.find((song) => song.id === id)!,
      );
      return route.fulfill({ json: state });
    }
    if (path.endsWith('/me')) return route.fulfill({ json: state });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/participante/${session}/entry-code`);
  await expect(page.getByRole('heading', { name: 'Meus pedidos', exact: true })).toBeVisible();
  return { state, additions, catalogReads: () => catalogReads };
}

test('participant workspace preserves tab scroll and catalogue state with fixed header and dock', async ({
  page,
}, testInfo) => {
  const api = await workspaceFixture(page);
  const nav = page.getByRole('navigation', { name: 'Navegação do participante', exact: true });
  const viewport = page.locator('.sf-participant-viewport'),
    header = page.locator('.sf-panel-header');
  const headerBox = await header.boundingBox(),
    dockBox = await nav.boundingBox();
  expect(headerBox!.height).toBeLessThanOrEqual(74);
  expect(api.catalogReads()).toBe(0);
  await viewport.evaluate((el) => (el.scrollTop = 420));
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(420);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await header.boundingBox()).toEqual(headerBox);
  expect(await nav.boundingBox()).toEqual(dockBox);
  await nav.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  const catalogue = page.getByRole('region', { name: 'Catálogo', exact: true });
  await expect(
    catalogue.getByRole('list', { name: 'Resultados de músicas' }).locator('li'),
  ).toHaveCount(10);
  await catalogue.getByLabel('Buscar música ou artista', { exact: true }).fill('Giz');
  await catalogue
    .getByRole('button', { name: 'Adicionar Giz — Legião Urbana', exact: true })
    .click();
  await expect.poll(() => api.additions.length).toBe(1);
  await expect(
    catalogue.getByRole('img', { name: 'Já adicionada: Giz — Legião Urbana', exact: true }),
  ).toBeVisible();
  await nav.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('app-participant-history-card .history-order')).toHaveText(['1']);
  await nav.getByRole('tab', { name: 'Pedidos', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(420);
  await nav.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(catalogue.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue(
    'Giz',
  );
  expect(api.catalogReads()).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath('participant-catalog-dock.png'),
    scale: 'css',
  });
  await nav.getByRole('tab', { name: 'Pedidos', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(420);
  await viewport.evaluate((el) => (el.scrollTop = 0));
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath('participant-requests-dock.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Opções da participação', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sua participação', exact: true })).toContainText(
    api.state.participant.name,
  );
  await expect(page.getByRole('button', { name: 'Sair da fila', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
  await page.setViewportSize({ width: 320, height: 460 });
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(74);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('participant call interrupts other tabs and returns to waiting after host completion without acceptance', async ({
  page,
}) => {
  const api = await workspaceFixture(page);
  const nav = page.getByRole('navigation', { name: 'Navegação do participante', exact: true });
  await nav.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  api.state.active = { id: 'call-1', title: 'Giz', artist: 'Legião Urbana', acceptedAt: null };
  await refreshParticipant(page);
  await expect(nav.getByRole('tab', { name: 'Pedidos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'É a sua vez!', exact: true })).toBeVisible();
  await nav.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Você foi chamado — ver convocação', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Você foi chamado — ver convocação', exact: true })
    .click();
  api.state.active = null;
  await refreshParticipant(page);
  await expect(page.getByRole('heading', { name: 'Você está na fila', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar ida', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Opções da participação', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da fila', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sair da fila?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar participando', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Opções da participação', exact: true }),
  ).toBeFocused();
});

test('participant drag keeps preview layout and scrolls the internal viewport at its edge', async ({
  page,
}) => {
  await workspaceFixture(page);
  const viewport = page.locator('.sf-participant-viewport');
  const handle = page.locator('.choice-grip').first();
  await handle.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const box = await handle.boundingBox(),
    viewportBox = await viewport.boundingBox();
  const before = await viewport.evaluate((el) => el.scrollTop);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 12, { steps: 5 });
  const preview = page.locator('.cdk-drag-preview');
  await expect(preview).toBeVisible();
  const previewBox = await preview.boundingBox(),
    gripBox = await preview.locator('.choice-grip').boundingBox();
  expect(gripBox!.height).toBeGreaterThan(previewBox!.height - 4);
  await page.mouse.move(box!.x + box!.width / 2, viewportBox!.y + viewportBox!.height - 8, {
    steps: 20,
  });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 30);
  await page.mouse.up();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('Font Awesome Free renders solid and regular icons locally throughout the participant', async ({
  page,
}) => {
  await workspaceFixture(page);
  const icon = await page.evaluate(async () => {
    const item = document.createElement('i');
    item.className = 'fa-solid fa-bullhorn';
    item.setAttribute('aria-hidden', 'true');
    document.body.append(item);
    await document.fonts.load('900 16px "Font Awesome 7 Free"');
    const style = getComputedStyle(item),
      glyph = getComputedStyle(item, '::before').content;
    const result = {
      family: style.fontFamily,
      glyph,
      loaded: document.fonts.check('900 16px "Font Awesome 7 Free"'),
    };
    item.remove();
    return result;
  });
  expect(icon.family).toContain('Font Awesome 7 Free');
  expect(icon.loaded).toBe(true);
  expect(icon.glyph).not.toBe('none');
  await expect(page.locator('.sf-bottom-navigation .pi')).toHaveCount(0);
  await expect(page.locator('.sf-bottom-navigation .fa-solid')).toHaveCount(3);
  await page
    .getByRole('navigation', { name: 'Navegação do participante', exact: true })
    .getByRole('tab', { name: 'Catálogo', exact: true })
    .click();
  await expect(page.locator('.fa-regular.fa-star')).toBeVisible();
  await expect(page.locator('.fa-solid.fa-ranking-star')).toBeVisible();
  expect(
    await page.locator('.fa-regular.fa-star').evaluate((el) => getComputedStyle(el).fontWeight),
  ).toBe('400');

  await expect(
    page
      .getByRole('navigation', { name: 'Navegação do participante', exact: true })
      .getByRole('tab', { name: 'Catálogo', exact: true })
      .locator('.fa-solid.fa-music'),
  ).toBeVisible();
});

test('participant catalogue card fills available height with tabs as its clipped header and only results scrolling', async ({
  page,
}, testInfo) => {
  await workspaceFixture(page);
  await page.route('**/api/public/songs/catalog*', (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get('page')) * 10;
    return route.fulfill({
      json: {
        total: 30,
        items: Array.from({ length: 10 }, (_, i) => ({
          title: 'Catálogo ' + (offset + i),
          artist: 'Artista',
        })),
      },
    });
  });
  await expect(page.getByRole('button', { name: 'Adicionar música', exact: true })).toHaveCount(0);
  const card = await openParticipantCatalog(page);
  await expect(card.getByRole('heading', { name: 'Catálogo', exact: true })).toHaveCount(0);
  await expect(card.locator('.picker-list li')).toHaveCount(10);
  const tabs = card.getByRole('tablist');
  const search = card.getByLabel('Buscar música ou artista', { exact: true });
  const area = card.locator('.picker-results');
  const bounds = await card.boundingBox(),
    tabsBefore = await tabs.boundingBox(),
    searchBefore = await search.boundingBox();
  const outer = page.locator('.sf-participant-viewport');
  const outerBounds = await outer.boundingBox();
  expect(bounds!.height).toBeGreaterThan(outerBounds!.height - 25);
  expect(Math.abs(tabsBefore!.y - bounds!.y)).toBeLessThan(3);
  expect(Math.abs(tabsBefore!.width - bounds!.width)).toBeLessThan(3);
  await expect(card).toHaveCSS('overflow', 'hidden');
  await expect(card.locator('.picker-hint')).toHaveCSS('margin-top', '0px');
  await expect(card.locator('.picker-content')).toHaveCSS('padding-left', '12px');
  await expect(card.getByRole('tab', { name: 'Músicas favoritas', exact: true })).toHaveCSS(
    'border-radius',
    '0px',
  );
  await expect(card.getByRole('tab', { name: 'Catálogo', exact: true })).toHaveCSS(
    'border-top-left-radius',
    '17px',
  );
  await expect(card.getByRole('tab', { name: 'Catálogo', exact: true })).toHaveCSS(
    'border-top-right-radius',
    '0px',
  );
  await expect(card.getByRole('tab', { name: 'Mais cantadas', exact: true })).toHaveCSS(
    'border-top-right-radius',
    '17px',
  );
  await expect(card.getByRole('tab', { name: 'Mais cantadas', exact: true })).toHaveCSS(
    'border-top-left-radius',
    '0px',
  );
  await area.evaluate((el) => (el.scrollTop = 400));
  await expect.poll(() => area.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  expect(await card.boundingBox()).toEqual(bounds);
  expect(await tabs.boundingBox()).toEqual(tabsBefore);
  expect(await search.boundingBox()).toEqual(searchBefore);
  expect(await outer.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await area
    .getByRole('button', { name: 'Carregar mais', exact: true })
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(card.locator('.picker-list li')).toHaveCount(20);
  expect(await card.boundingBox()).toEqual(bounds);
  await area.evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: testInfo.outputPath('participant-catalogue-card.png'),
    scale: 'css',
  });
  await card.getByRole('tab', { name: 'Músicas favoritas', exact: true }).click();
  await expect(card.getByLabel('Buscar nas favoritas', { exact: true })).toBeDisabled();
  expect(await card.boundingBox()).toEqual(bounds);
  await card.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(card.locator('.picker-list li')).toHaveCount(20);
  await expect(card.getByText('Para mais músicas use a busca', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(card.locator('.picker-list li')).toHaveCount(30);
  await expect(card.getByText('Para mais músicas use a busca', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Carregar mais', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Para mais músicas use a busca', exact: true }).click();
  await expect(search).toBeFocused();
  await search.fill('ab');
  await expect(card.getByText('Para mais músicas use a busca', { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Limpar busca', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(card.getByRole('button', { name: 'Limpar busca', exact: true })).toHaveCount(0);
  await expect(card.locator('.picker-list li')).toHaveCount(10);
  await expect(card.getByText('Para mais músicas use a busca', { exact: true })).toHaveCount(0);
});

test('request SpeedDial cancels swap mode on navigation and a new call', async ({
  page,
}, testInfo) => {
  const api = await workspaceFixture(page);
  let catalog = await openRequestSwap(page, 'Escolha 0');
  await expect(
    catalog
      .getByRole('button', { name: 'Trocar por Catálogo 0 — Artista', exact: true })
      .locator('.fa-right-left'),
  ).toBeVisible();
  await catalog.getByRole('button', { name: 'Cancelar troca', exact: true }).click();
  catalog = await openParticipantCatalog(page);
  await expect(
    catalog
      .getByRole('button', { name: 'Adicionar Catálogo 0 — Artista', exact: true })
      .locator('.fa-plus'),
  ).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegação do participante', exact: true });
  await nav.getByRole('tab', { name: 'Pedidos', exact: true }).click();
  catalog = await openRequestSwap(page, 'Escolha 0');
  await page.screenshot({
    path: testInfo.outputPath('participant-catalog-swap.png'),
    scale: 'css',
  });
  await nav.getByRole('tab', { name: 'Histórico', exact: true }).click();
  catalog = await openParticipantCatalog(page);
  await expect(
    catalog.getByRole('button', { name: 'Adicionar Catálogo 0 — Artista', exact: true }),
  ).toBeVisible();
  await nav.getByRole('tab', { name: 'Pedidos', exact: true }).click();
  await openRequestSwap(page, 'Escolha 0');
  api.state.active = { id: 'new-call', title: 'Escolha 0', artist: 'Artista 0', acceptedAt: null };
  api.state.requests[0].status = 'RESERVED';
  await refreshParticipant(page);
  await expect(nav.getByRole('tab', { name: 'Pedidos', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  catalog = await openParticipantCatalog(page);
  await expect(catalog.getByRole('button', { name: 'Cancelar troca', exact: true })).toHaveCount(0);
  await expect(
    catalog.getByRole('button', { name: 'Adicionar Catálogo 0 — Artista', exact: true }),
  ).toBeVisible();
  expect(api.additions).toHaveLength(0);
});
