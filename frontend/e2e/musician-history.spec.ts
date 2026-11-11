import { test, expect } from '@playwright/test';

const past = {
  id: 'past-session',
  name: 'Café da semana passada',
  status: 'CLOSED',
  createdAt: '2026-11-04T12:00:00Z',
};
const current = {
  id: 'current-session',
  name: 'Café de hoje',
  status: 'OPEN',
  createdAt: '2026-11-11T12:00:00Z',
};
const emptyStage = { active: null, suggestions: [], waits: [], history: [] };
const oldView = {
  session: past,
  stage: {
    ...emptyStage,
    history: [
      {
        id: 'past-call',
        participantName: 'Ana da semana passada',
        title: 'Música antiga',
        artist: 'Artista anterior',
        status: 'COMPLETED',
        resolvedAt: '2026-11-05T00:00:00Z',
      },
    ],
    suggestions: [
      {
        participantId: 'person-old',
        name: 'Bruno da semana passada',
        title: 'Pedido anterior',
        completed: 0,
      },
    ],
  },
};

test('with only closed sessions the musician waits and reads past details within the selector modal', async ({
  page,
}) => {
  let oldReads = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (path === '/api/musicians/sessions') return route.fulfill({ json: [past] });
    if (path === '/api/musicians/sessions/' + past.id) {
      oldReads++;
      return route.fulfill({ json: oldView });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  const main = page.getByRole('region', { name: 'Painel do músico', exact: true });
  await expect(
    main.getByRole('heading', { name: 'Aguardando novas sessões', exact: true }),
  ).toBeVisible();
  await expect(main).not.toContainText(past.name);
  expect(oldReads).toBe(0);
  await main.getByRole('button', { name: 'Ver sessões anteriores' }).click();
  await page
    .getByRole('dialog', { name: 'Escolher sessão', exact: true })
    .getByRole('button', { name: new RegExp(past.name) })
    .click();
  const modal = page.getByRole('dialog', { name: past.name, exact: true });
  await expect(modal.getByRole('region', { name: 'Registros da sessão anterior' })).toContainText(
    'Música antiga',
  );
  await expect(modal.getByRole('region', { name: 'Fila ao encerrar' })).toContainText(
    'Pedido anterior',
  );
  await expect(main).not.toContainText('Música antiga');
  await modal.getByRole('button', { name: 'Voltar às sessões' }).click();
  await expect(page.getByRole('dialog', { name: 'Escolher sessão', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(main.getByRole('button', { name: 'Ver sessões anteriores' })).toBeFocused();
});

test('an open session stays on the main screen while history is consulted and closing returns to waiting', async ({
  page,
}) => {
  let closed = false;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (path === '/api/musicians/sessions')
      return route.fulfill({ json: [past, { ...current, status: closed ? 'CLOSED' : 'OPEN' }] });
    if (path === '/api/musicians/sessions/' + past.id) return route.fulfill({ json: oldView });
    if (path === '/api/musicians/sessions/' + current.id)
      return route.fulfill({
        json: {
          session: { ...current, status: closed ? 'CLOSED' : 'OPEN' },
          stage: {
            ...emptyStage,
            suggestions: [
              {
                participantId: 'now-person',
                name: 'Pessoa de hoje',
                title: 'Música de hoje',
                completed: 0,
              },
            ],
          },
        },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  const main = page.getByRole('region', { name: 'Painel do músico', exact: true });
  await expect(main.getByRole('heading', { name: current.name, exact: true })).toBeVisible();
  await expect(main).toContainText('Música de hoje');
  await page.getByRole('button', { name: 'Opções do músico' }).click();
  await page.getByRole('menuitem', { name: 'Trocar sessão', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(past.name) })
    .click();
  await expect(page.getByRole('dialog', { name: past.name, exact: true })).toContainText(
    'Música antiga',
  );
  await expect(main.getByRole('heading', { name: current.name, exact: true })).toBeVisible();
  await expect(main).not.toContainText('Música antiga');
  closed = true;
  await expect(
    main.getByRole('heading', { name: 'Aguardando novas sessões', exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(main.getByRole('heading', { name: 'Próximas músicas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: past.name, exact: true })).toContainText(
    'Música antiga',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
  await main.getByRole('button', { name: 'Ver sessões anteriores' }).click();
  await expect(page.getByRole('dialog')).toContainText(current.name);
});

test('history access revoked while its modal is open removes the old data', async ({ page }) => {
  let allowed = true;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (path === '/api/musicians/sessions') return route.fulfill({ json: allowed ? [past] : [] });
    if (path === '/api/musicians/sessions/' + past.id) return route.fulfill({ json: oldView });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  await page.getByRole('button', { name: 'Ver sessões anteriores' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(past.name) })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Música antiga');
  allowed = false;
  await expect(page.getByRole('dialog', { name: 'Escolher sessão', exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'não está mais disponível',
  );
  await expect(page.getByRole('dialog')).not.toContainText('Música antiga');
});

test('a session closed between list and detail never appears as the current session', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } });
    if (path === '/api/musicians/sessions') return route.fulfill({ json: [current] });
    if (path === '/api/musicians/sessions/' + current.id)
      return route.fulfill({
        json: { session: { ...current, status: 'CLOSED' }, stage: emptyStage },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/musico');
  const main = page.getByRole('region', { name: 'Painel do músico', exact: true });
  await expect(
    main.getByRole('heading', { name: 'Aguardando novas sessões', exact: true }),
  ).toBeVisible();
  await expect(main.getByRole('heading', { name: current.name, exact: true })).toHaveCount(0);
  await expect(main.getByRole('heading', { name: 'No palco', exact: true })).toHaveCount(0);
});
