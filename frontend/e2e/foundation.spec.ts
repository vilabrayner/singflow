import { test, expect } from '@playwright/test';

test('navigates all experiences and supports direct URLs without overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => route.fulfill({ status: 401 }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sua voz no palco');
  for (const [label, path, heading] of [
    ['Participante', '/participante', 'Sua próxima música começa aqui.'],
    ['Anfitrião', '/anfitriao', 'Entrar como anfitrião'],
    ['Músico', '/musico', 'Em sintonia com cada voz.'],
  ]) {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Experiências' })
      .getByRole('link', { name: label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test('reports backend health and offers retry after network failure', async ({ page }) => {
  await page.route('**/actuator/health', (route) => route.fulfill({ json: { status: 'UP' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Verificar conexão' }).click();
  await expect(
    page.getByRole('status', { exact: true }).filter({ hasText: 'Servidor conectado.' }),
  ).toBeVisible();
  await page.route('**/actuator/health', (route) => route.abort());
  await page.getByRole('button', { name: 'Verificar conexão' }).click();
  await expect(page.getByText('Servidor indisponível. Tente novamente.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar conexão' })).toBeEnabled();
});

test('handles unknown routes and provides keyboard skip link', async ({ page }) => {
  await page.goto('/nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page).toHaveURL('/');
  await page.reload();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
});
