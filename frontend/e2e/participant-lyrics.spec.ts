import { installRealtime } from './helpers/realtime';
import { test, expect, Page } from '@playwright/test';
import { refreshParticipant } from './participant-ui-helpers';
const session = '11111111-1111-4111-8111-111111111111';
const result = {
  status: 'FOUND',
  provider: 'LRCLIB',
  title: 'Giz',
  artist: 'Legião Urbana',
  text: 'Linha de teste um\nLinha de teste dois\n<b>Texto literal, sem marcação</b>',
  sourceUrl: 'https://lrclib.net/tracks/123',
};
async function fixture(page: Page, accepted = false, reply: any = result, status = 200) {
  const state = {
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
    requests: [],
    history: [],
    queuePosition: 3,
    canReturn: false,
    active: {
      id: 'call',
      title: 'Giz',
      artist: 'Legião Urbana',
      acceptedAt: accepted ? new Date().toISOString() : null,
    } as any,
  };
  let reads = 0;
  await page.route('**/api/**', async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/lyrics')) {
      reads++;
      return r.fulfill({ status, json: reply });
    }
    if (path.endsWith('/accept')) {
      state.active.acceptedAt = new Date().toISOString();
      return r.fulfill({ json: state });
    }
    if (path.endsWith('/me')) return r.fulfill({ json: state });
    if (path.endsWith('/prepare')) return r.fulfill({ status: 204 });
    return r.fulfill({ json: { items: [], total: 0 } });
  });
  const realtime = await installRealtime(page, 'self');
  await page.goto(`/participante/${session}/entry-code`);
  await realtime.ready();
  return { state, realtime, reads: () => reads };
}
test('lyrics appear only after acceptance, remain plain text and disappear after host completion @release', async ({
  page,
}, info) => {
  const api = await fixture(page);
  await expect(page.getByRole('heading', { name: 'É a sua vez!', exact: true })).toBeVisible();
  expect(api.reads()).toBe(0);
  await page.getByRole('button', { name: 'Confirmar ida', exact: true }).click();
  const section = page.getByRole('region', { name: 'Letra da música', exact: true });
  await expect(section).toContainText(result.text);
  await expect(section.locator('pre')).toHaveCSS('white-space', 'pre-wrap');
  await expect(section.locator('b')).toHaveCount(0);
  await expect(section.getByRole('link', { name: 'LRCLIB', exact: true })).toHaveAttribute(
    'href',
    result.sourceUrl,
  );
  await refreshParticipant(page);
  await expect(section).toBeVisible();
  expect(api.reads()).toBe(1);
  await page.screenshot({ path: info.outputPath('participant-lyrics.png') });
  api.state.active = null;
  api.realtime.changed();
  await expect(section).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole('heading', { name: 'Você está na fila', exact: true })).toBeVisible();
});
test('lyrics provider failure supports explicit retry without changing participation', async ({
  page,
}) => {
  await fixture(page, true, { detail: 'Serviço de letras indisponível.' }, 503);
  await expect(page.getByRole('alert')).toContainText('Serviço de letras indisponível');
  await page.route('**/api/participation/**/lyrics', (r) => r.fulfill({ json: result }));
  await page.getByRole('button', { name: 'Tentar carregar novamente', exact: true }).click();
  await expect(page.locator('.lyrics-text')).toHaveText(result.text);
  await expect(page.getByRole('heading', { name: 'Ida confirmada', exact: true })).toBeVisible();
});
for (const [status, message] of [
  ['NOT_FOUND', 'Não encontramos a letra desta música.'],
  ['MISSING_ARTIST', 'Precisamos do artista cadastrado para encontrar a letra.'],
  ['INSTRUMENTAL', 'Esta versão está identificada como instrumental.'],
]) {
  test(`lyrics ${status} has an explicit empty state`, async ({ page }) => {
    await fixture(page, true, { ...result, status, text: null, sourceUrl: null });
    await expect(page.getByRole('region', { name: 'Letra da música', exact: true })).toContainText(
      message,
    );
    await expect(page.locator('.lyrics-text')).toHaveCount(0);
  });
}
test('late lyrics response is ignored when the host has already completed the presentation', async ({
  page,
}) => {
  let requested = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const api = await fixture(page);
  await page.route('**/api/participation/**/lyrics', async (r) => {
    requested = true;
    await gate;
    await r.fulfill({ json: result }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Confirmar ida', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await expect(
    page.getByRole('progressbar', { name: 'Carregando dados', exact: true }),
  ).toBeVisible();
  api.state.active = null;
  api.realtime.changed();
  await expect(page.getByRole('region', { name: 'Letra da música', exact: true })).toHaveCount(0);
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Você está na fila', exact: true })).toBeVisible();
  await expect(page.locator('.lyrics-text')).toHaveCount(0);
});
