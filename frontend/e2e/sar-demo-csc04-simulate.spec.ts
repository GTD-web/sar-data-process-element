import { test, expect } from '@playwright/test';

/**
 * CSC-04 데모 — H5 업로드 없이 cascade 흐름만 프론트엔드에서 시뮬레이션.
 *
 * 검증:
 *   1) /plan/console?pipelineId=PL-CSC04-DEMO 에 진입
 *   2) Pipeline Input(L0) 노드에 hover → "Simulate" 보조 버튼 노출
 *   3) Simulate 클릭 → 업로드 없이 cascade 가 시작
 *   4) L1A(step-3) → Multilook(step-4) → 5개 Speckle 노드(step-5..9) 가 모두 COMPLETED 로 전환
 *   5) 토스트 "Pipeline simulation finished."
 *   6) 임의 SAR 노드 더블클릭 시 모달에 simulate 로그가 hydrate
 *
 * 외부 의존: 컨테이너가 localhost:3010 에 떠 있고 /plan/console 이 동작 — H5 불필요.
 */

test.describe('CSC-04 데모 — 업로드 없이 simulate cascade', () => {
  test('Simulate 버튼 → 모든 SAR 노드 COMPLETED', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/plan/console?pipelineId=PL-CSC04-DEMO');

    const fileInputNode = page.locator('.react-flow__node[data-id="step-1"]');
    const l1aNode = page.locator('.react-flow__node[data-id="step-3"]');
    const multilookNode = page.locator('.react-flow__node[data-id="step-4"]');
    const speckleLeeNode = page.locator('.react-flow__node[data-id="step-5"]');
    const speckleMedianNode = page.locator('.react-flow__node[data-id="step-9"]');

    await expect(fileInputNode).toBeVisible({ timeout: 15_000 });
    await expect(l1aNode).toBeVisible();
    await expect(speckleMedianNode).toBeVisible();

    // entry 노드 hover → simulate 버튼이 보이고 활성 (업로드 불필요)
    await fileInputNode.hover();
    const simulateBtn = page.getByTestId('entry-simulate-1');
    await expect(simulateBtn).toBeVisible({ timeout: 5_000 });
    await simulateBtn.click();

    // cascade 진행: 마지막 speckle 노드까지 모두 COMPLETED. SIM_TOTAL_MS 합 = 약 6초.
    await expect(page.getByTestId('node-status-3')).toHaveAttribute('data-status', 'COMPLETED', { timeout: 20_000 });
    await expect(page.getByTestId('node-status-4')).toHaveAttribute('data-status', 'COMPLETED', { timeout: 20_000 });
    await expect(page.getByTestId('node-status-5')).toHaveAttribute('data-status', 'COMPLETED', { timeout: 20_000 });
    await expect(page.getByTestId('node-status-9')).toHaveAttribute('data-status', 'COMPLETED', { timeout: 20_000 });

    // 토스트 — simulate 모드 메시지
    await expect(page.getByText('Pipeline simulation finished.')).toBeVisible({ timeout: 5_000 });

    // 노드 더블클릭 시 simulate 로그가 hydrate 된다.
    await speckleLeeNode.dblclick();
    await expect(page.getByText('[simulate]', { exact: false }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('sar-result')).toContainText(/exit 0/);
    await expect(page.getByTestId('sar-result')).toContainText(/runId\s+demo-/);
  });

  test('SAR Focusing(L1A) 모달은 upstream/upload 토글을 제공한다', async ({ page }) => {
    await page.goto('/plan/console?pipelineId=PL-CSC04-DEMO');

    const fileInputNode = page.locator('.react-flow__node[data-id="step-1"]');
    const l1aNode = page.locator('.react-flow__node[data-id="step-3"]');
    await expect(fileInputNode).toBeVisible({ timeout: 15_000 });

    // 1) L0 (FILE_INPUT) 노드에 아직 업로드가 없는 상태에서 L1A 모달을 열면
    //    upstream 탭은 disabled, 자동으로 upload 탭이 활성.
    await l1aNode.dblclick();
    const upstreamTab = page.getByTestId('l1a-mode-upstream');
    const uploadTab = page.getByTestId('l1a-mode-upload');
    await expect(upstreamTab).toBeVisible({ timeout: 5_000 });
    await expect(uploadTab).toBeVisible();
    await expect(upstreamTab).toBeDisabled();
    await expect(uploadTab).toHaveAttribute('aria-selected', 'true');
    // upload 패널이 렌더되어 사용자가 직접 H5 를 선택할 수 있음.
    await expect(page.getByTestId('sar-upload-panel')).toBeVisible();
    await expect(page.getByTestId('sar-h5-input')).toBeAttached();
    // 업로드 없이는 Execute 가 비활성.
    await expect(page.getByTestId('sar-execute')).toBeDisabled();
    await page.keyboard.press('Escape');
  });
});
