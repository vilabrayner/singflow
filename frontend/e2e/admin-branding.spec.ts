import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const image = readFileSync(new URL('../public/brand/singflow-icon-192.png', import.meta.url));
test('admin registers the venue with exactly name, logo and background, and projects separately @release', async ({
  page,
}) => {
  let rows: any[] = [];
  const uploads: boolean[] = [];
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          email: 'admin@example.test',
          administrator: true,
          role: 'HOST',
          status: 'APPROVED',
          emailVerified: true,
        },
      });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'csrf' } });
    if (path.endsWith('/admin/accounts'))
      return route.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    if (path.includes('/public/branding/assets/'))
      return route.fulfill({ contentType: 'image/png', body: image });
    if (path.endsWith('/admin/branding/assets')) {
      expect(route.request().headers()['x-csrf-token']).toBe('csrf');
      expect(route.request().headers()['content-type']).toBe('image/png');
      expect(route.request().postDataBuffer()!.length).toBeGreaterThan(0);
      const background = url.searchParams.get('background') === 'true';
      uploads.push(background);
      const id = background ? 'background' : 'logo';
      return route.fulfill({ json: { id, url: '/api/public/branding/assets/' + id } });
    }
    if (path.endsWith('/admin/branding')) {
      if (route.request().method() === 'GET') return route.fulfill({ json: rows });
      const input = route.request().postDataJSON();
      expect(input.version).toBe(0);
      if (input.kind === 'VENUE')
        expect(input).toMatchObject({
          name: 'Café Tão',
          logoId: 'logo',
          backgroundId: 'background',
          instagram: '',
        });
      const entry = {
        ...input,
        version: 1,
        logoUrl: input.logoId ? '/api/public/branding/assets/' + input.logoId : null,
        backgroundUrl: input.backgroundId
          ? '/api/public/branding/assets/' + input.backgroundId
          : null,
      };
      rows.push(entry);
      return route.fulfill({ json: entry });
    }
    return route.fulfill({ status: 500 });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Locais e projetos', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar local', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.locator('form input')).toHaveCount(3);
  await page.getByLabel('Nome do local', { exact: true }).fill('Café Tão');
  await page
    .getByLabel('Marca', { exact: true })
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByAltText('Prévia da marca')).toBeVisible();
  await page
    .getByLabel('Fundo para TV', { exact: true })
    .setInputFiles({ name: 'fundo.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByAltText('Prévia do fundo para TV')).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar Café Tão', exact: true })).toBeVisible();
  expect(uploads).toEqual([false, true]);
  await page.getByRole('tab', { name: 'Projetos de karaokê', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar projeto', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Fundo para TV', { exact: true })).toHaveCount(0);
  await page.getByLabel('Nome do projeto', { exact: true }).fill('Som Na Caixa');
  await page.getByLabel('Instagram (opcional)', { exact: true }).fill('karaoke.somnacaixa');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Editar Som Na Caixa', exact: true }),
  ).toBeVisible();
  expect(rows.map((row) => row.kind)).toEqual(['VENUE', 'PROJECT']);
});
