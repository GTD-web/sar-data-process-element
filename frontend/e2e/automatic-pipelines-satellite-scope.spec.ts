import { test, expect, type Page } from '@playwright/test';

const LS_KEY = 'sdpe.automatic-pipelines.satellite';

async function clearSatelliteScope(page: Page) {
  await page.context().clearCookies();
  await page.context().addInitScript((key) => {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }, LS_KEY);
}

async function preseedSatelliteScope(page: Page, satelliteId: string) {
  await page.context().addInitScript(([key, value]) => {
    window.localStorage.setItem(key, value);
  }, [LS_KEY, satelliteId] as const);
}

test.describe('Automatic Pipelines — satellite scope', () => {
  test('최초 진입 시 위성 선택 모달이 강제 노출되고 Cancel 이 없다', async ({ page }) => {
    await clearSatelliteScope(page);
    await page.goto('/plan/deployed');

    const dialog = page.getByRole('dialog', { name: 'Select Satellite' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // 강제 모드: Cancel 버튼·X 닫기 버튼·Esc 모두 노출되지 않는다.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);

    // Esc 눌러도 닫히지 않아야 한다.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    // Confirm 만이 출구다.
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('위성을 선택하면 헤더 chip 과 사이드바 배지가 그 위성으로 표시되고 localStorage 에 저장된다', async ({ page }) => {
    await clearSatelliteScope(page);
    await page.goto('/plan/deployed');
    const dialog = page.getByRole('dialog', { name: 'Select Satellite' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // LumirX-2 를 선택한다.
    await dialog.getByRole('button', { name: /LumirX-2/ }).click();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 헤더 chip 에 LumirX-2 가 보인다.
    const headerChip = page.getByRole('button', { name: 'Change satellite scope' });
    await expect(headerChip).toContainText('LumirX-2');

    // 사이드바 배지에도 LumirX-2 가 보인다.
    const sidebarBadge = page.getByTestId('sidebar-execution-satellite-badge');
    await expect(sidebarBadge).toBeVisible();
    await expect(sidebarBadge).toContainText('LumirX-2');

    // localStorage 에 저장됐는지 확인.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), LS_KEY);
    expect(stored).toBe('LumirX-2');
  });

  test('이미 선택된 상태로 재진입하면 모달이 뜨지 않는다', async ({ page }) => {
    await preseedSatelliteScope(page, 'LumirX-3');
    await page.goto('/plan/deployed');

    // EventGroupCard 가 떠야 페이지가 안정 상태 — 모달 없이 바로 컨텐츠.
    await expect(page.getByText(/^fan-out$/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: 'Select Satellite' })).toHaveCount(0);

    // 헤더 chip 에 저장된 LumirX-3 가 보여야 한다.
    await expect(page.getByRole('button', { name: 'Change satellite scope' })).toContainText('LumirX-3');
  });

  test('헤더 chip 클릭으로 모달을 다시 띄우면 Cancel 이 가능하다', async ({ page }) => {
    await preseedSatelliteScope(page, 'LumirX-1');
    await page.goto('/plan/deployed');
    await expect(page.getByText(/^fan-out$/).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Change satellite scope' }).click();
    const dialog = page.getByRole('dialog', { name: 'Select Satellite' });
    await expect(dialog).toBeVisible();

    // 재호출 시 Cancel 노출.
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 선택은 그대로 유지.
    await expect(page.getByRole('button', { name: 'Change satellite scope' })).toContainText('LumirX-1');
  });

  test('사이드바 배지 클릭으로도 모달이 다시 뜬다', async ({ page }) => {
    await preseedSatelliteScope(page, 'LumirX-1');
    await page.goto('/plan/deployed');
    await expect(page.getByText(/^fan-out$/).first()).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('sidebar-execution-satellite-badge').click();
    const dialog = page.getByRole('dialog', { name: 'Select Satellite' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('위성을 바꾸면 룰 카운트와 행 condition chip 이 그 위성으로 좁혀진다', async ({ page }) => {
    await preseedSatelliteScope(page, 'LumirX-1');
    await page.goto('/plan/deployed');
    await expect(page.getByText(/^fan-out$/).first()).toBeVisible({ timeout: 10_000 });

    // 처음에는 LumirX-2 condition chip 을 가진 룰 행이 보이면 안 된다 (LumirX-1 전용 + 전역 룰만 노출).
    // condition chip 영역에서 LumirX-2 텍스트가 등장하지 않는지 확인.
    const lumir2Chips = page.locator('div.group span').filter({ hasText: /^LumirX-2$/ });
    expect(await lumir2Chips.count()).toBe(0);

    // 위성을 LumirX-2 로 바꾼다.
    await page.getByRole('button', { name: 'Change satellite scope' }).click();
    const dialog = page.getByRole('dialog', { name: 'Select Satellite' });
    await dialog.getByRole('button', { name: /LumirX-2/ }).click();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // 이제 LumirX-1 condition chip 만 가진 (전역 아닌) 룰은 사라져야 한다.
    const lumir1Chips = page.locator('div.group span').filter({ hasText: /^LumirX-1$/ });
    expect(await lumir1Chips.count()).toBe(0);

    // 헤더 chip 도 갱신.
    await expect(page.getByRole('button', { name: 'Change satellite scope' })).toContainText('LumirX-2');
  });
});
