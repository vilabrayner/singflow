import { test, expect } from '@playwright/test';

test('host registers and adds songs without duplicating participation', async ({ page }) => {
  let loggedIn = false;
  let current: { id: string; name: string; status: string; createdAt: string } | null = null;
  const participants: Record<string, unknown>[] = [];
  const songs: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/songs/catalog'))
      return route.fulfill({
        json: {
          items: [
            { title: 'Evidências', artist: '' },
            { title: 'Equalize', artist: 'Pitty' },
          ],
          total: 2,
        },
      });
    if (path.endsWith('/entry-link'))
      return route.fulfill({ json: { url: 'https://singflow.example/participante/test/entry' } });
    if (path.endsWith('/stage'))
      return route.fulfill({ json: { suggestions: [], active: null, history: [], waits: [] } });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'test-csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/auth/login')) {
      expect(request.headers()['content-type']).toContain('application/x-www-form-urlencoded');
      expect(new URLSearchParams(request.postData() ?? '').get('email')).toBe('host@example.test');
      loggedIn = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/me'))
      return loggedIn
        ? route.fulfill({ json: { email: 'host@example.test' } })
        : route.fulfill({ status: 401 });
    if (request.method() === 'POST') expect(request.headers()['x-csrf-token']).toBe('test-csrf');
    if (path === '/api/sessions' && request.method() === 'GET')
      return route.fulfill({ json: current ? [current] : [] });
    if (path === '/api/sessions') {
      const data = request.postDataJSON();
      current = {
        id: data.operationId,
        name: data.name,
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
      };
      return route.fulfill({ json: current });
    }
    if (path.endsWith('/open')) {
      current!.status = 'OPEN';
      return route.fulfill({ json: current });
    }
    if (path.endsWith('/participants') && request.method() === 'GET')
      return route.fulfill({ json: participants });
    if (path.endsWith('/requests') && request.method() === 'GET')
      return route.fulfill({ json: songs });
    if (path.endsWith('/participants')) {
      const data = request.postDataJSON();
      participants.push({
        id: data.operationId,
        name: data.name,
        tableLabel: data.tableLabel,
        status: 'ACTIVE',
        origin: 'ASSISTED',
        checkedInAt: new Date().toISOString(),
        checkInOrder: 1,
        completedPerformances: 0,
      });
      songs.push({
        id: data.operationId,
        participantId: data.operationId,
        title: data.title,
        artist: data.artist,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      return route.fulfill({ json: { participant: participants[0], request: songs[0] } });
    }
    if (path.endsWith('/requests')) {
      const data = request.postDataJSON();
      songs.push({
        id: data.operationId,
        participantId: participants[0]['id'],
        title: data.title,
        artist: data.artist,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      });
      return route.fulfill({ json: songs[1] });
    }
    if (path.endsWith('/leave')) {
      participants[0]['status'] = 'LEFT';
      songs.forEach((s) => (s['status'] = 'CANCELLED'));
      return route.fulfill({ json: participants[0] });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/anfitriao');
  await page.getByLabel('E-mail', { exact: true }).fill('host@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  await page.getByLabel('Nome da sessão').fill('Ensaio assistido');
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir sessão', exact: true }).click();
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await page.getByRole('button', { name: 'Criar participante', exact: true }).click();
  await page.getByLabel('Nome do participante', { exact: true }).fill('Ana');
  await page.getByText('Informações opcionais', { exact: true }).click();
  await page.getByLabel('Mesa (opcional)', { exact: true }).fill('3');
  await page.getByLabel('Primeira música', { exact: true }).fill('Evidências');
  await page.getByRole('button', { name: 'Inscrever com música', exact: true }).click();
  const enrollmentNotice = page
    .getByRole('status')
    .filter({ hasText: 'Participante inscrito com a primeira música.' });
  await expect(enrollmentNotice).toBeVisible();
  const headerHeight = await page
    .locator('.sf-panel-header')
    .evaluate((header) => header.offsetHeight);
  await expect(page.locator('p-toast')).toHaveCSS('top', `${headerHeight + 12}px`);
  await expect(enrollmentNotice).toHaveCount(0, { timeout: 6500 });
  await page.getByRole('button', { name: /Ana.*apresentações/ }).click();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: 'Ana - Adicionar música', exact: true });
  await expect(
    chooser.getByRole('img', {
      name: 'Já adicionada: Evidências — Artista não informado',
      exact: true,
    }),
  ).toBeVisible();
  await chooser.getByRole('button', { name: 'Adicionar Equalize — Pitty', exact: true }).click();
  await expect(chooser).toHaveCount(0);
  await expect(page.getByText('Equalize', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  const manualChooser = page.getByRole('dialog', { name: 'Ana - Adicionar música', exact: true });
  await manualChooser
    .getByRole('textbox', { name: 'Buscar música ou artista', exact: true })
    .fill('Outra canção');
  await manualChooser
    .getByRole('button', { name: 'Adicionar “Outra canção” manualmente', exact: true })
    .click();
  await manualChooser.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  await expect(page.getByText('Outra canção', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await page.getByRole('menuitem', { name: 'Registrar saída', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Ana', exact: true }).getByText('Saiu', { exact: true }),
  ).toBeVisible();
  expect(participants).toHaveLength(1);
  expect(songs).toHaveLength(3);
});
