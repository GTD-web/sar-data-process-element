import { test, expect } from '@playwright/test';

test.describe('Data Catalog — Reprocess confirm dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plan/data-catalog');
    // RawDataList 의 첫 번째 항목이 렌더될 때까지 대기.
    await expect(page.getByText(/^Pipeline Execution Matrix$/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Reprocess 버튼 클릭 시 바로 실행되지 않고 모달이 뜬다', async ({ page }) => {
    // Pipeline Execution Matrix 의 첫 product cell (group cursor-pointer) 클릭 → 우측 패널 오픈.
    const productCell = page.locator('td.group.cursor-pointer').first();
    await expect(productCell).toBeVisible({ timeout: 10_000 });
    await productCell.click();

    // 우측 패널의 Reprocess 버튼이 보임.
    const reprocessBtn = page.getByRole('button', { name: /^Reprocess$/ });
    await expect(reprocessBtn).toBeVisible();

    // 클릭하면 확인 모달이 뜬다.
    await reprocessBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Reprocess Product/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Request Reprocess/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Cancel$/ })).toBeVisible();
  });

  test('Cancel 클릭 시 모달이 닫히고 재처리 요청이 발생하지 않는다', async ({ page }) => {
    const productCell = page.locator('td.group.cursor-pointer').first();
    await productCell.click();
    await page.getByRole('button', { name: /^Reprocess$/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(dialog).toHaveCount(0);

    // Cancel 직후엔 toast 가 뜨지 않는다 — Reprocess requested 텍스트가 보이지 않아야 함.
    await expect(page.getByText(/Reprocess requested/)).toHaveCount(0);
  });

  test('Request Reprocess 클릭 시 모달이 닫히고 toast 가 노출된다', async ({ page }) => {
    const productCell = page.locator('td.group.cursor-pointer').first();
    await productCell.click();
    await page.getByRole('button', { name: /^Reprocess$/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Request Reprocess/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/Reprocess requested/)).toBeVisible({ timeout: 5_000 });
  });
});
