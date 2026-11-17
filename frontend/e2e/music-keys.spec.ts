import { test, expect } from '@playwright/test';
const session = '11111111-1111-4111-8111-111111111111';
const song = {
  id: 'request',
  catalogSongId: 'music',
  participantId: 'self',
  title: 'Giz',
  artist: 'Legião Urbana',
  status: 'PENDING',
  originalKey: 'D',
  semitones: 0,
  settingsVersion: 0,
  keyLabel: 'D (Original)',
  createdAt: new Date().toISOString(),
};
test('participant configures semitones with buttons and typing, retaining input after conflict @release', async ({
  page,
}, info) => {
  let current = { ...song };
  let conflict = false;
  const writes: any[] = [];
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: { id: 'self', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 },
    requests: [current],
    active: null,
    history: [],
    suggested: false,
    queuePosition: 2,
    canReturn: false,
  });
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      p = new URL(req.url()).pathname;
    if (p.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (p.endsWith('/configure')) {
      const body = req.postDataJSON();
      writes.push(body);
      if (conflict)
        return r.fulfill({
          status: 409,
          json: { detail: 'A configuração mudou. Atualize o pedido.' },
        });
      current = {
        ...current,
        semitones: body.semitones,
        settingsVersion: current.settingsVersion + 1,
        keyLabel: body.semitones === -2 ? 'C' : String(body.semitones),
      };
      return r.fulfill({ json: own() });
    }
    if (p.endsWith('/me')) return r.fulfill({ json: own() });
    return r.fulfill({ json: {} });
  });
  await page.goto(`/participante/${session}/code`);
  const options = page.getByRole('button', { name: 'Opções de Giz', exact: true });
  await options.click();
  await page.getByRole('menuitem', { name: 'Configurar', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Configurar música', exact: true });
  await expect(modal).toContainText('Tom original: D');
  const input = modal.getByLabel('Mudar tom', { exact: true });
  await expect(input).toHaveValue('0');
  await modal.getByRole('button', { name: 'Diminuir um semitom' }).click();
  await modal.getByRole('button', { name: 'Diminuir um semitom' }).click();
  await expect(input).toHaveValue('-2');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes[0]).toEqual({ version: 0, catalogSongId: 'music', semitones: -2 });
  await expect(page.getByRole('listitem')).toContainText('Tom: C');
  conflict = true;
  await options.click();
  await page.getByRole('menuitem', { name: 'Configurar', exact: true }).click();
  await input.fill('1.5');
  await expect(modal.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await input.fill('3');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('A configuração mudou');
  await expect(input).toHaveValue('3');
  await page.screenshot({ path: info.outputPath('request-key.png') });
  await modal.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/p-overflow-hidden/);
});
test('musician sees calculated key and records actual key during and after a performance @release', async ({
  page,
}, info) => {
  let call = {
    id: 'call',
    participantId: 'self',
    participantName: 'Ana',
    requestId: 'request',
    title: 'Giz',
    artist: 'Legião Urbana',
    status: 'CALLED',
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    originalKey: 'D',
    semitones: -2,
    keyLabel: 'C',
    performedKey: null as string | null,
    keyVersion: 0,
  };
  let completed = false;
  let revoked = false;
  const writes: any[] = [];
  const context = {
    id: session,
    name: 'Café Tão',
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  const performance = () => ({
    session: context,
    stage: {
      active: completed ? null : call,
      suggestions: [
        { participantId: 'next', name: 'Bruno', title: 'Outra', artist: 'Artista', keyLabel: '+1' },
      ],
      history: completed ? [{ ...call, status: 'COMPLETED' }] : [],
      waits: [],
      paused: [],
    },
  });
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      p = new URL(req.url()).pathname;
    if (p.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (p.endsWith('/auth/me'))
      return r.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (p.endsWith('/musicians/sessions')) return r.fulfill({ json: [context] });
    if (p.endsWith('/key')) {
      writes.push(req.postDataJSON());
      if (revoked)
        return r.fulfill({
          status: 404,
          json: { detail: 'Sessão indisponível para este músico.' },
        });
      call = {
        ...call,
        performedKey: req.postDataJSON().performedKey,
        keyVersion: call.keyVersion + 1,
      };
      return r.fulfill({ json: performance() });
    }
    if (p.endsWith(`/musicians/sessions/${session}`)) return r.fulfill({ json: performance() });
    return r.fulfill({ json: {} });
  });
  await page.goto('/musico');
  await expect(page.getByText('Tom: C', { exact: true })).toBeVisible();
  await expect(page.getByText('Tom: +1', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Registrar tom cantado', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Tom cantado', exact: true });
  const input = modal.getByLabel('Tom cantado', { exact: true });
  await input.fill('Ré');
  await expect(modal.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await input.fill('Bb');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Tom cantado: Bb', { exact: true })).toBeVisible();
  expect(writes[0]).toEqual({ version: 0, performedKey: 'Bb' });
  completed = true;
  await page.getByRole('button', { name: 'Opções do músico', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Atualizar', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Navegação do músico' })
    .getByRole('tab', { name: 'Histórico', exact: true })
    .click();
  const historyAction = page.getByRole('button', {
    name: 'Registrar tom cantado por Ana',
    exact: true,
  });
  const historyItem = historyAction.locator('xpath=ancestor::app-history-item');
  const key = await historyItem.getByText('Tom cantado: Bb', { exact: true }).boundingBox();
  const badge = await historyItem.locator('app-status-badge').boundingBox();
  const button = await historyAction.boundingBox();
  const copy = await historyItem.locator('.choice-copy').boundingBox();
  expect(badge!.y).toBeGreaterThanOrEqual(key!.y + key!.height);
  expect(button!.x).toBeGreaterThanOrEqual(copy!.x + copy!.width);
  expect(button!.width).toBeGreaterThanOrEqual(44);
  await historyAction.click();
  await expect(input).toHaveValue('Bb');
  revoked = true;
  await input.fill('Am');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Sessão indisponível');
  await expect(input).toHaveValue('Am');
  await page.screenshot({ path: info.outputPath('performed-key.png') });
});

test('musician records actual key inside an archived session without an open session', async ({
  page,
}) => {
  const archived = {
    id: 'archived-session',
    name: 'Quarta anterior',
    status: 'CLOSED',
    createdAt: new Date().toISOString(),
  };
  let actual: string | null = null;
  const writes: any[] = [];
  const performance = () => ({
    session: archived,
    stage: {
      active: null,
      suggestions: [],
      waits: [],
      history: [
        {
          id: 'old-call',
          participantName: 'Ana',
          title: 'Giz',
          artist: 'Legião Urbana',
          status: 'COMPLETED',
          keyLabel: 'D (Original)',
          keyVersion: 0,
          performedKey: actual,
        },
      ],
    },
  });
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      p = new URL(req.url()).pathname;
    if (p.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (p.endsWith('/auth/me'))
      return r.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (p.endsWith('/musicians/sessions')) return r.fulfill({ json: [archived] });
    if (p.endsWith('/key')) {
      expect(p).toBe('/api/musicians/sessions/archived-session/calls/old-call/key');
      writes.push(req.postDataJSON());
      actual = req.postDataJSON().performedKey;
      return r.fulfill({ json: performance() });
    }
    if (p.endsWith('/musicians/sessions/archived-session'))
      return r.fulfill({ json: performance() });
    return r.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  await page.getByRole('button', { name: 'Ver sessões anteriores' }).click();
  await page
    .getByRole('dialog', { name: 'Escolher sessão', exact: true })
    .getByRole('button', { name: /Quarta anterior/ })
    .click();
  const archive = page.getByRole('dialog', { name: 'Quarta anterior', exact: true });
  await archive.getByRole('button', { name: 'Registrar tom cantado por Ana' }).click();
  const modal = page.getByRole('dialog', { name: 'Tom cantado', exact: true });
  await modal.getByLabel('Tom cantado', { exact: true }).fill('Am');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(archive).toContainText('Tom cantado: Am');
  expect(writes).toEqual([{ version: 0, performedKey: 'Am' }]);
});
