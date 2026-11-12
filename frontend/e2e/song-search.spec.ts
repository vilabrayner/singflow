import { test, expect } from '@playwright/test';

test('song search selects title and artist, supports free text and provider failure', async ({
  page,
}) => {
  const queries: string[] = [];
  const joins: Record<string, string>[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/songs/search')) {
      const query = url.searchParams.get('q')!;
      queries.push(query);
      if (query === 'Falha') return route.fulfill({ status: 503 });
      return route.fulfill({ json: [{ title: 'Equalize', artist: 'Pitty' }] });
    }
    if (url.pathname.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (url.pathname.endsWith('/prepare')) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/join')) {
      joins.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, json: { detail: 'Teste: dados recebidos' } });
    }
    if (url.pathname.includes('/public/'))
      return route.fulfill({ json: { name: 'Sessão teste', status: 'OPEN' } });
    return route.fulfill({ status: 401 });
  });
  await page.goto('/participante/11111111-1111-4111-8111-111111111111/entry-code');
  await page.getByLabel('Seu nome', { exact: true }).fill('Ana');
  const song = page.getByRole('combobox', { name: 'Primeira música' });
  await song.fill('Eq');
  await page.waitForTimeout(600);
  expect(queries).toEqual([]);
  await song.fill('Equ');
  await page.getByRole('option', { name: 'Equalize — Pitty' }).click();
  await expect(song).toHaveValue('Equalize — Pitty');
  await page.getByRole('button', { name: 'Entrar com minha música', exact: true }).click();
  await expect.poll(() => joins.length).toBe(1);
  expect(joins[0]).toMatchObject({ title: 'Equalize', artist: 'Pitty' });
  await song.fill('Falha');
  await expect(
    page.getByText('Busca indisponível. Você pode usar a música digitada em texto livre.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Entrar com minha música', exact: true }).click();
  await expect.poll(() => joins.length).toBe(2);
  expect(joins[1]).toMatchObject({ title: 'Falha', artist: '' });
});

test('entry song search discards stale results and supports keyboard selection', async ({
  page,
}) => {
  let oldResponse: (() => Promise<void>) | undefined;
  let posted: Record<string, string> | undefined;
  const own = {
    session: { id: '11111111-1111-4111-8111-111111111111', name: 'Café Tão', status: 'OPEN' },
    participant: {
      id: 'self',
      name: 'Ana',
      status: 'ACTIVE',
      origin: 'SELF',
      completedPerformances: 0,
    },
    requests: [],
    active: null,
    history: [],
    suggested: false,
    canReturn: false,
    queuePosition: 2,
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/songs/search')) {
      if (url.searchParams.get('q') === 'Antiga') {
        oldResponse = () => route.fulfill({ json: [{ title: 'Antiga', artist: 'Antigo' }] });
        return;
      }
      return route.fulfill({
        json: Array.from({ length: 15 }, (_, i) => ({ title: `Nova ${i}`, artist: 'Artista' })),
      });
    }
    if (url.pathname.endsWith('/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (url.pathname.endsWith('/join')) {
      posted = route.request().postDataJSON();
      return route.fulfill({ json: own });
    }
    if (url.pathname.endsWith('/me')) return route.fulfill({ status: 401 });
    if (url.pathname.includes('/public/'))
      return route.fulfill({ json: { name: 'Café Tão', status: 'OPEN' } });
    return route.fulfill({ status: 204 });
  });
  await page.goto('/participante/11111111-1111-4111-8111-111111111111/entry-code');
  await page.getByLabel('Seu nome', { exact: true }).fill('Ana');
  const song = page.getByRole('combobox', { name: 'Primeira música', exact: true });
  await song.fill('Antiga');
  await expect.poll(() => Boolean(oldResponse)).toBe(true);
  await song.fill('Nova');
  await expect(page.getByRole('option')).toHaveCount(10);
  await oldResponse!();
  await expect(page.getByRole('option', { name: 'Antiga — Antigo' })).toHaveCount(0);
  await song.press('Escape');
  await expect(song).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(song).toBeVisible();
  await song.fill('Nova música');
  await expect(page.getByRole('option')).toHaveCount(10);
  await expect(song).toHaveAttribute('aria-expanded', 'true');
  await song.press('ArrowDown');
  await expect(song).toHaveAttribute('aria-activedescendant', /.+/);
  await song.press('Enter');
  await expect(song).toHaveValue('Nova 0 — Artista');
  await page.getByRole('button', { name: 'Entrar com minha música', exact: true }).click();
  await expect.poll(() => posted?.title).toBe('Nova 0');
  expect(posted?.artist).toBe('Artista');
});
