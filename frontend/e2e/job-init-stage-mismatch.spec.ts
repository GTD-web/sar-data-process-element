import { test, expect } from '@playwright/test';

/**
 * Job Initialization 노드 프로파일 변경 시 stage mismatch 경고/확인 다이얼로그 검증.
 *
 * 시나리오:
 *   1) CSC-04 데모 파이프라인 (FILE_INPUT L0 → JOB_INIT → L1A → …) 의 JOB_INIT 모달 열기
 *   2) 자동 선택된 프로파일은 L1A → PROF-L1A-RANGE-BASELINE
 *   3) L1B 또는 L0 등 다른 stage 의 프로파일로 바꾸면 inline 경고 배지 노출
 *   4) Apply 클릭 → mismatch 확인 다이얼로그 노출
 *   5) Cancel → 다이얼로그 닫힘, jobInitConfig 변경 안 됨
 *   6) Apply anyway → 변경 적용됨 (다이얼로그 닫힘)
 */

test.describe('Job Initialization — profile stage mismatch warning', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/plan/console?pipelineId=PL-CSC04-DEMO');
    // JOB_INIT = step 2
    const jobInitNode = page.locator('.react-flow__node[data-id="step-2"]');
    await expect(jobInitNode).toBeVisible({ timeout: 15_000 });
    await jobInitNode.dblclick();
    // 모달 안의 Parameters 탭으로 전환 — JobInitEditPanel 이 거기에 렌더됨.
    await page.getByRole('button', { name: 'Parameters' }).click();
    await expect(page.getByText('Processing Profile').first()).toBeVisible({ timeout: 5_000 });
  });

  test('동일 stage 프로파일이면 경고 없음', async ({ page }) => {
    // 초기 상태 — L1A 자동 선택. 경고/다이얼로그 모두 비표시.
    await expect(page.getByTestId('job-init-stage-mismatch')).toHaveCount(0);
  });

  test('다른 stage 프로파일을 고르면 inline 경고가 보인다', async ({ page }) => {
    await page.getByTestId('job-init-profile-select').locator('button').click();
    await page.getByRole('option').filter({ hasText: 'L1B Azimuth Processing Baseline' }).click();
    const warn = page.getByTestId('job-init-stage-mismatch');
    await expect(warn).toBeVisible({ timeout: 3_000 });
    await expect(warn).toContainText('L1B');
    await expect(warn).toContainText('L1A');
  });

  test('Apply → 확인 다이얼로그 → Cancel 시 적용 안 됨', async ({ page }) => {
    await page.getByTestId('job-init-profile-select').locator('button').click();
    await page.getByRole('option').filter({ hasText: 'L1B Azimuth Processing Baseline' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    const dialog = page.getByTestId('job-init-mismatch-dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await expect(dialog).toContainText('Pipeline expects');
    await expect(dialog).toContainText('L1A');
    await expect(dialog).toContainText('Profile targets');
    await expect(dialog).toContainText('L1B');
    await page.getByTestId('job-init-mismatch-cancel').click();
    await expect(dialog).toBeHidden();
    // Apply 버튼이 여전히 활성 — 변경이 commit 되지 않았으므로 hasChanges true.
    await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  test('Apply anyway → 변경 적용됨', async ({ page }) => {
    await page.getByTestId('job-init-profile-select').locator('button').click();
    await page.getByRole('option').filter({ hasText: 'L1B Azimuth Processing Baseline' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.getByTestId('job-init-mismatch-confirm').click();
    // 다이얼로그가 닫히고 Apply 가 disabled 상태로 — hasChanges false.
    await expect(page.getByTestId('job-init-mismatch-dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled({ timeout: 3_000 });
  });
});
