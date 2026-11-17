import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const id = '11111111-1111-4111-8111-111111111111';
const session = { id, name: 'Ensaio', status: 'OPEN', createdAt: new Date().toISOString() };
const stage = { active: null, suggestions: [], history: [], waits: [], paused: [] };
async function fixture(page: Page, panel: string) {
  await page.route('**/api/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return r.fulfill({
        json: {
          email: 'tester@example.test',
          role: panel === 'musician' ? 'MUSICIAN' : 'HOST',
          administrator: panel === 'admin',
          emailVerified: true,
          status: 'APPROVED',
        },
      });
    if (path.endsWith('/entry-link'))
      return r.fulfill({ json: { url: `http://127.0.0.1:4200/participante/${id}/entry` } });
    if (path === '/api/sessions')
      return r.fulfill({
        json: Array.from({ length: 25 }, (_, i) => ({
          ...session,
          id: i ? 'session-' + i : id,
          name: 'Sessão ' + i,
        })),
      });
    if (path.endsWith('/musicians/sessions')) return r.fulfill({ json: [session] });
    if (path.endsWith('/participants') || path.endsWith('/requests'))
      return r.fulfill({ json: [] });
    if (path.endsWith('/stage')) return r.fulfill({ json: stage });
    if (path.includes('/musicians/sessions/')) return r.fulfill({ json: { session, stage } });
    if (path.includes('/participation/') && path.endsWith('/me'))
      return r.fulfill({
        json: {
          session,
          participant: {
            id: 'self',
            name: 'Ana',
            status: 'ACTIVE',
            origin: 'SELF',
            completedPerformances: 0,
          },
          requests: [],
          history: [],
          active: null,
          queuePosition: null,
          canReturn: false,
        },
      });
    if (path.startsWith('/api/admin/'))
      return r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    return r.fulfill({ status: 404 });
  });
}
for (const [panel, path, label] of [
  ['host', '/anfitriao', 'Opções da conta'],
  ['musician', '/musico', 'Opções do músico'],
  ['participant', `/participante/${id}/vinculado`, 'Opções da participação'],
  ['admin', '/admin', 'Opções da administração'],
]) {
  test(`${panel} header menu shows the shared app version without changing the header`, async ({
    page,
  }) => {
    if (panel === 'host')
      await page.setViewportSize({ width: page.viewportSize()!.width, height: 500 });
    await fixture(page, panel);
    await page.goto(path);
    const trigger = page.getByRole('button', { name: label, exact: true });
    await expect(trigger).toBeVisible();
    const before = await page.locator('.sf-panel-header').boundingBox();
    await trigger.click();
    const footer = page.locator('app-version-footer');
    await expect(footer).toHaveCount(1);
    await expect(footer).toHaveText(`Versão ${version}`);
    await expect(footer.getByRole('button')).toHaveCount(0);
    expect((await page.locator('.sf-panel-header').boundingBox())!.height).toBe(before!.height);
    if (panel === 'host') {
      await page.getByRole('button', { name: 'Trocar sessão', exact: true }).click();
      await expect(page.locator('.sf-header-menu .session-list button')).toHaveCount(25);
      const content = page.locator('.sf-header-menu > .sf-account-panel');
      const footerBefore = await footer.boundingBox();
      expect(await content.evaluate((el) => el.scrollHeight)).toBeGreaterThan(
        await content.evaluate((el) => el.clientHeight),
      );
      await content.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const footerAfter = await footer.boundingBox();
      expect(footerAfter!.y).toBeCloseTo(footerBefore!.y, 0);
      expect(footerAfter!.y + footerAfter!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height - 12,
      );
    }
    await page.keyboard.press('Escape');
    await expect(footer).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
