import { expect, test } from '@playwright/test';
const id = '11111111-1111-4111-8111-111111111111';
const another = '22222222-2222-4222-8222-222222222222';
test('TV reserves the L-shaped information bands and switches draft, queue, call and closure by its own socket @release', async ({
  page,
}) => {
  let current: any = {
    sessionId: id,
    sessionName: 'Quarta',
    status: 'DRAFT',
    venueName: 'Café Tão',
    venueLogo: null,
    brandLogo: null,
    projectName: 'Som Na Caixa',
    backgroundUrl: null,
    instagram: 'karaoke.somnacaixa',
    entryUrl: null,
    cue: null,
  };
  let socket: any;
  const reads: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'csrf' } });
    if (path === `/api/public/tv/${id}/realtime/tickets`)
      return route.fulfill({ json: { ticket: 'tv-only-ticket', socketPath: '/realtime/ws' } });
    if (path === `/api/public/tv/${id}`) {
      reads.push(path);
      return route.fulfill({ json: current });
    }
    return route.fulfill({ status: 500 });
  });
  await page.routeWebSocket('**/api/realtime/ws', (wire) => {
    socket = wire;
    wire.onMessage((value) => {
      expect(JSON.parse(String(value))).toEqual({ type: 'authenticate', ticket: 'tv-only-ticket' });
      wire.send(JSON.stringify({ type: 'ready' }));
    });
  });
  await page.goto('/tv/' + id);
  await expect(page.getByRole('heading', { name: 'Karaokê Som Na Caixa!' })).toBeVisible();
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toHaveCount(0);
  await expect(page.locator('.site-header,.site-footer,app-panel-header')).toHaveCount(0);
  const stage = await page.locator('.tv-screen').boundingBox();
  const top = await page.locator('.tv-top').boundingBox();
  const sidebar = await page.locator('.tv-sidebar').boundingBox();
  expect(Math.abs(stage!.width / stage!.height - 16 / 9)).toBeLessThan(0.01);
  expect(Math.abs(top!.width / stage!.width - 1600 / 1920)).toBeLessThan(0.01);
  expect(Math.abs(top!.height / stage!.height - 300 / 1080)).toBeLessThan(0.01);
  expect(Math.abs(sidebar!.width / stage!.width - 400 / 1920)).toBeLessThan(0.01);
  expect(Math.abs(sidebar!.y - top!.y - top!.height)).toBeLessThan(2);
  await expect(page.locator('.tv-sidebar app-brand-logo')).toBeVisible();
  await expect(page.locator('.tv-top app-brand-logo')).toHaveCount(0);
  current = {
    ...current,
    status: 'OPEN',
    entryUrl: 'https://app.example.test/participante/' + id + '/entry',
    cue: { name: 'Ana', title: 'Giz', artist: 'Legião Urbana', called: false, accepted: false },
  };
  socket.send(JSON.stringify({ type: 'changed' }));
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeVisible();
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toBeVisible();
  await expect(page.getByAltText('Próximo no palco', { exact: true })).toBeVisible();
  await expect(page.getByText('Próximo no palco', { exact: true })).toHaveCount(0);
  current = { ...current, cue: { ...current.cue, called: true } };
  socket.send(JSON.stringify({ type: 'changed' }));
  await expect(page.getByText('É a sua vez!', { exact: true })).toBeVisible();
  current = { ...current, status: 'CLOSED', entryUrl: null, cue: null };
  socket.send(JSON.stringify({ type: 'ended' }));
  await expect(page.getByText('Sessão encerrada.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toHaveCount(0);
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toHaveCount(0);
  expect(reads.every((path) => path === `/api/public/tv/${id}`)).toBe(true);
  expect(reads.join()).not.toContain(another);
});
test('unpublished or invalid TV never shows a guessed session or private panels', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'csrf' } });
    if (path.endsWith('/realtime/tickets')) return route.fulfill({ status: 403 });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/tv/not-a-session');
  await expect(page.getByText('Sessão não encontrada.', { exact: true })).toBeVisible();
  await page.goto('/tv/' + id);
  await expect(
    page.getByText('A TV não está liberada para esta sessão.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toHaveCount(0);
});
