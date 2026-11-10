import { test, expect } from '@playwright/test';

test('host registers and adds songs without duplicating participation', async ({ page }) => {
  let loggedIn = false;
  let current: { id: string; name: string; status: string; createdAt: string } | null = null;
  const participants: Record<string, unknown>[] = [];
  const songs: Record<string, unknown>[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
  await page.getByLabel('Nome da sessão').fill('Ensaio assistido');
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir sessão', exact: true }).click();
  await page.getByLabel('Nome do participante', { exact: true }).fill('Ana');
  await page.getByLabel('Mesa (opcional)', { exact: true }).fill('3');
  await page.getByLabel('Primeira música', { exact: true }).fill('Evidências');
  await page.getByRole('button', { name: 'Inscrever com música', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  await page.getByLabel('Nova música', { exact: true }).fill('Outra canção');
  await page.getByRole('button', { name: 'Salvar música', exact: true }).click();
  await expect(page.getByText('Outra canção', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Registrar saída', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída', exact: true }).click();
  await expect(page.getByText('Saiu', { exact: false })).toBeVisible();
  expect(participants).toHaveLength(1);
  expect(songs).toHaveLength(2);
});
