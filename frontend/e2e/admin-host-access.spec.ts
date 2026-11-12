import { test, expect } from '@playwright/test';

const target = {
  id: 'target-session',
  name: 'Evento de outro anfitrião',
  status: 'OPEN',
  createdAt: new Date().toISOString(),
};
const first = { ...target, id: 'first-session', name: 'Outra sessão' };
const stage = { active: null, suggestions: [], history: [], waits: [] };

test('administrator opens the chosen session as host even with a musician profile', async ({
  page,
}) => {
  const reads: string[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    reads.push(path);
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          email: 'admin@example.test',
          role: 'MUSICIAN',
          administrator: true,
          emailVerified: true,
          status: 'APPROVED',
        },
      });
    if (path.endsWith('/admin/accounts'))
      return route.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    if (path === '/api/admin/sessions')
      return route.fulfill({
        json: [{ session: target, host: { name: 'Rita', email: 'rita@example.test' } }],
      });
    if (path === '/api/admin/sessions/target-session')
      return route.fulfill({
        json: {
          session: target,
          host: { name: 'Rita', email: 'rita@example.test' },
          musicians: [],
          stage,
        },
      });
    if (path === '/api/sessions') return route.fulfill({ json: [first, target] });
    if (path.endsWith('/participants') || path.endsWith('/requests'))
      return route.fulfill({ json: [] });
    if (path.endsWith('/stage')) return route.fulfill({ json: stage });
    if (path.endsWith('/entry-link'))
      return route.fulfill({
        json: { url: 'http://127.0.0.1:4200/participante/target-session/code' },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Sessões abertas', exact: true }).click();
  await page.getByRole('button', { name: /Evento de outro anfitrião/ }).click();
  const modal = page.getByRole('dialog', { name: target.name, exact: true });
  await modal.getByRole('button', { name: 'Opções da consulta', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gerenciar como anfitrião', exact: true }).click();
  await expect(page).toHaveURL(/anfitriao\?sessao=target-session/);
  await expect(page.getByRole('heading', { name: target.name, exact: true })).toBeVisible();
  expect(reads).toContain('/api/sessions/target-session/participants');
  expect(reads).not.toContain('/api/sessions/first-session/participants');
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await expect(page.getByRole('button', { name: /Outra sessão/ })).toBeVisible();
});

test('a session link outside account access never silently opens a different session', async ({
  page,
}) => {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          email: 'host@example.test',
          role: 'HOST',
          administrator: false,
          emailVerified: true,
          status: 'APPROVED',
        },
      });
    if (path === '/api/sessions') return route.fulfill({ json: [first] });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/anfitriao?sessao=target-session');
  await expect(page.getByRole('alert')).toContainText('Sessão indisponível para esta conta.');
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toHaveCount(0);
});
