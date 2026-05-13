import { test, expect } from '@playwright/test';

test.describe('Automatic Pipelines — tabs and swap flow', () => {
  test.beforeEach(async ({ context, page }) => {
    // 위성 스코프 모달이 진입 시 강제로 뜨므로, 기존 흐름 검증 spec 들은 LumirX-1 을 미리 세팅해
    // 모달을 우회한다 (위성 모달 자체의 검증은 automatic-pipelines-satellite-scope.spec.ts 가 담당).
    await context.addInitScript(() => {
      window.localStorage.setItem('sdpe.automatic-pipelines.satellite', 'LumirX-1');
    });
    await page.goto('/plan/deployed');
    // 카탈로그/규칙 로딩 대기 — 첫 번째 EventGroupCard 헤더가 떠야 페이지가 안정 상태.
    await expect(page.getByText(/^fan-out$/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('탭 라벨이 Automatic Pipelines / Manual Pipelines 로 표시된다', async ({ page }) => {
    const tabBar = page.locator('a:has-text("Automatic Pipelines")').locator('..');
    await expect(tabBar.getByText('Automatic Pipelines')).toBeVisible();
    await expect(tabBar.getByText('Manual Pipelines')).toBeVisible();
    await expect(page.getByText('Job Execution History')).toHaveCount(0);
  });

  test('룰을 선택하면 우측 패널에 3개 탭이 노출되고 각 탭이 phase 기반 묶음을 보여준다', async ({ page }) => {
    // 첫 번째 룰 행 클릭 (활성/비활성 무관) — 행 클릭 시 selectedRuleId 가 세팅된다.
    const firstRow = page.locator('div.group').first();
    await firstRow.locator('div').first().click();

    // 우측 패널이 열렸는지 — 탭 strip 의 history 탭이 보이면 panel ready.
    await expect(page.getByTestId('detail-tab-history')).toBeVisible({ timeout: 5_000 });

    // 3개 탭 버튼이 모두 보이고, 5탭 시절의 잔여 testid 는 더 이상 존재하지 않는다.
    const tabIds = ['history', 'execution', 'outputs'] as const;
    for (const id of tabIds) {
      await expect(page.getByTestId(`detail-tab-${id}`)).toBeVisible();
    }
    for (const removed of ['steps', 'products', 'errors']) {
      await expect(page.getByTestId(`detail-tab-${removed}`)).toHaveCount(0);
    }

    // 기본 탭은 Execution — Latest execution + Step progress · NAS outputs 헤딩이 동시에 보인다.
    await expect(page.getByRole('heading', { name: 'Latest execution', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Step progress · NAS outputs', exact: true })).toBeVisible();
    // 다른 탭 그룹의 헤딩(Job history, Output products, Recent error logs) 은 안 보인다.
    await expect(page.getByRole('heading', { name: 'Job history', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Output products', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent error logs', exact: true })).toHaveCount(0);

    // History 탭 — Job history 헤딩 노출.
    await page.getByTestId('detail-tab-history').click();
    await expect(page.getByRole('heading', { name: 'Job history', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Latest execution', exact: true })).toHaveCount(0);

    // Outputs 탭 — Output products + Recent error logs 헤딩 동시 노출.
    await page.getByTestId('detail-tab-outputs').click();
    await expect(page.getByRole('heading', { name: 'Output products', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent error logs', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Job history', exact: true })).toHaveCount(0);

    // Execution 탭 복귀 — Latest + Step 다시 같이 보임.
    await page.getByTestId('detail-tab-execution').click();
    await expect(page.getByRole('heading', { name: 'Latest execution', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Step progress · NAS outputs', exact: true })).toBeVisible();
  });

  test('History 탭에서 Job 행을 클릭하면 자동으로 Execution 탭으로 전환되고 그 잡의 jobId 가 보인다', async ({ page }) => {
    const firstRow = page.locator('div.group').first();
    await firstRow.locator('div').first().click();
    await expect(page.getByTestId('detail-tab-history')).toBeVisible({ timeout: 5_000 });

    // History 탭으로 이동.
    await page.getByTestId('detail-tab-history').click();
    await expect(page.getByRole('heading', { name: 'Job history', exact: true })).toBeVisible();

    // 잡 리스트에서 첫 번째 잡의 jobId 를 추출하고 클릭.
    const jobButtons = page.getByTitle(/Show details for .* in Execution tab/);
    const jobCount = await jobButtons.count();
    test.skip(jobCount === 0, 'Pipeline 에 트리거된 잡이 없어 검증 불가');
    const targetJobId = (await jobButtons.first().locator('.font-mono').first().textContent())?.trim();
    expect(targetJobId).toBeTruthy();
    await jobButtons.first().click();

    // 자동으로 Execution 탭으로 전환된다 — Latest execution 헤딩이 보임.
    await expect(page.getByRole('heading', { name: 'Latest execution', exact: true })).toBeVisible();
    // Execution 탭 안에 클릭한 잡의 jobId 가 노출.
    if (targetJobId) {
      await expect(page.getByText(targetJobId, { exact: true }).first()).toBeVisible();
    }
  });

  test('자동 파이프라인 detail 패널 어디에도 CANCELED 잡 상태가 노출되지 않는다', async ({ page }) => {
    // 모든 룰을 순차 클릭하면서 History/Outputs 탭에 CANCELED 잡이 나타나지 않는지 검증.
    const rows = page.locator('div.group');
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i += 1) {
      await rows.nth(i).locator('div').first().click();
      await page.waitForTimeout(80);
      // Job history 탭으로 이동.
      const historyTab = page.getByTestId('detail-tab-history');
      if (!(await historyTab.isVisible().catch(() => false))) continue;
      await historyTab.click();
      // History 탭 안의 잡 리스트에는 CANCELED status 배지가 없어야 한다.
      // JobStatusBadge 는 'Canceled' 라벨을 노출 — 이 텍스트가 panel 안에서 발견되면 안 된다.
      const panelRoot = historyTab.locator('xpath=ancestor::*[contains(@class,"border-l")][1]');
      await expect(panelRoot.getByText('Canceled', { exact: true })).toHaveCount(0);
    }
  });

  test('우측 패널 헤더에 파이프라인 이름 / Active 배지 / sourceQueue 가 함께 노출된다', async ({ page }) => {
    const firstRow = page.locator('div.group').first();
    // 행 안의 파이프라인 이름을 미리 캡처해 두고 (행과 panel header 의 일치 확인용)
    const expectedPipelineName = (await firstRow.locator('[data-tgt] .text-foreground').first().textContent())?.trim();
    expect(expectedPipelineName, '행에서 파이프라인 이름을 추출하지 못함').toBeTruthy();
    const expectedActive = await firstRow.locator('text=/^Active$|^Inactive$/').first().textContent();

    await firstRow.locator('div').first().click();
    await expect(page.getByTestId('detail-tab-history')).toBeVisible({ timeout: 5_000 });

    // panel header 영역(첫 detail-tab 의 부모를 거쳐 panel 컨테이너 잡기) 에서 파이프라인명/배지/큐 모두 보인다.
    const panelRoot = page.getByTestId('detail-tab-history').locator('xpath=ancestor::*[contains(@class,"border-l")][1]');
    await expect(panelRoot.getByText(expectedPipelineName!, { exact: false }).first()).toBeVisible();
    await expect(panelRoot.getByText(expectedActive ?? 'Active', { exact: true }).first()).toBeVisible();
    // sourceQueue — RAW_DATA_RECEIVED 룰이라면 sdpe.reception.events.
    await expect(panelRoot.locator('text=/sdpe\\.|TBD/').first()).toBeVisible();
  });

  test('우측 패널 텍스트는 영문이며 한글 라벨이 노출되지 않는다', async ({ page }) => {
    const firstRow = page.locator('div.group').first();
    await firstRow.locator('div').first().click();
    await expect(page.getByTestId('detail-tab-history')).toBeVisible({ timeout: 5_000 });

    // 이전에 한글로 노출되던 라벨/안내가 더 이상 없어야 한다.
    await expect(page.getByText('Job 이력', { exact: true })).toHaveCount(0);
    await expect(page.locator('aside, div').filter({ hasText: '실행된 단계 정보가 아직 없습니다.' })).toHaveCount(0);
  });

  test('산출물 카드의 툴팁은 Data Catalog 페이지로 이동한다는 영문 안내다', async ({ page }) => {
    // Outputs 탭(Output products + Recent error logs 묶음) 으로 이동한 뒤 카드 검증.
    const rows = page.locator('div.group');
    const total = await rows.count();
    let foundProducts = false;
    for (let i = 0; i < total; i += 1) {
      await rows.nth(i).locator('div').first().click();
      await page.waitForTimeout(120);
      const outputsTab = page.getByTestId('detail-tab-outputs');
      if (!(await outputsTab.isVisible().catch(() => false))) continue;
      await outputsTab.click();
      const productCards = page.locator('a[title*="Click to open"][title*="Data Catalog"]');
      if ((await productCards.count()) > 0) {
        foundProducts = true;
        const first = productCards.first();
        const title = await first.getAttribute('title');
        expect(title).toMatch(/Click to open .* on the Data Catalog page/);
        const href = await first.getAttribute('href');
        expect(href).toContain('/data-catalog?productId=');
        break;
      }
    }
    expect(foundProducts, 'Output products 탭에서 산출물 카드를 찾지 못함').toBe(true);
  });

  test('Execution 탭의 step 카드 NAS 경로는 scene_xxx.h5 placeholder 가 아닌 구체적 파일명이다', async ({ page }) => {
    // Step progress 는 Execution 탭에 묶여 있다 — 기본 활성 탭이라 별도 클릭 불필요하지만 명시적 클릭으로 안전.
    const rows = page.locator('div.group');
    const total = await rows.count();
    let foundConcretePath = false;
    for (let i = 0; i < total; i += 1) {
      await rows.nth(i).locator('div').first().click();
      await page.waitForTimeout(120);
      const executionTab = page.getByTestId('detail-tab-execution');
      if (!(await executionTab.isVisible().catch(() => false))) continue;
      await executionTab.click();
      const pathNodes = page.locator('.break-all').filter({ hasText: '/mnt/nas/sdpe/output/' });
      const count = await pathNodes.count();
      for (let j = 0; j < count; j += 1) {
        const text = (await pathNodes.nth(j).textContent())?.trim() ?? '';
        if (text.startsWith('/mnt/nas/sdpe/output/')) {
          // 절대 placeholder 가 보이면 안 된다.
          expect(text).not.toContain('scene_xxx');
          // LumirX 산출물 네이밍 컨벤션의 핵심 슬롯이 들어 있어야 한다.
          expect(text).toMatch(/LX\d_/);
          expect(text.endsWith('.h5')).toBe(true);
          foundConcretePath = true;
        }
      }
      if (foundConcretePath) break;
    }
    expect(foundConcretePath, 'COMPLETED 된 SAR 단계의 NAS outputPath 가 보이지 않음').toBe(true);
  });

  test('동일 이벤트·큐에 active 룰이 있을 때 swap 후 행 순서는 유지되고 라인/Active 만 갱신된다', async ({ page }) => {
    // 1. Inactive 룰을 찾아 펼친다 — 펼쳤을 때 hasActiveDuplicate 이면 Activate 버튼이 swap 모드로 동작.
    const inactiveRows = page.locator('div.group').filter({ hasText: 'Inactive' });
    const rowCount = await inactiveRows.count();
    expect(rowCount).toBeGreaterThan(0);

    let swapTriggered = false;
    let activatedPipelineName: string | null = null;
    let preSwapPipelineOrder: string[] = [];

    for (let i = 0; i < rowCount && !swapTriggered; i += 1) {
      const row = inactiveRows.nth(i);
      const pipelineName = (await row.locator('[data-tgt] .text-foreground').first().textContent())?.trim() ?? '';
      await row.locator('div').first().click(); // 행 클릭 → 펼침
      await page.waitForTimeout(150);

      const activateBtn = row.getByRole('button', { name: 'Activate' });
      if (!(await activateBtn.isVisible().catch(() => false))) continue;
      if (await activateBtn.isDisabled().catch(() => true)) continue;

      // Swap 시도 직전, 같은 EventGroupCard 안의 모든 파이프라인 행 순서 기록.
      const fanCard = row.locator('xpath=ancestor::div[contains(@class,"rounded-xl")]').first();
      preSwapPipelineOrder = await fanCard
        .locator('[data-tgt] .text-foreground')
        .allTextContents()
        .then((texts) => texts.map((t) => t.trim()));

      await activateBtn.click();
      const modal = page.getByRole('heading', { name: 'Swap the active automation rule?' });
      if (await modal.isVisible().catch(() => false)) {
        activatedPipelineName = pipelineName;
        await page.getByRole('button', { name: 'Yes, swap' }).click();
        await expect(modal).toBeHidden({ timeout: 5_000 });
        swapTriggered = true;
        break;
      }
      const cancelBtn = page.getByRole('button', { name: 'Cancel' });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      }
    }

    expect(swapTriggered, '같은 event·queue 키에 active 가 있는 inactive 룰을 찾지 못함').toBe(true);

    // 2. 토스트 확인.
    await expect(page.getByText('Active automation rule swapped.')).toBeVisible({ timeout: 5_000 });

    // 3. Active 상태 반영 확인 — 새로 활성화된 파이프라인의 행이 Active 배지를 갖는다.
    const activatedRow = page
      .locator('div.group')
      .filter({ has: page.locator('[data-tgt]', { hasText: activatedPipelineName ?? '' }) })
      .first();
    await expect(activatedRow.getByText('Active', { exact: true })).toBeVisible({ timeout: 5_000 });

    // 4. SVG 라인의 active 스타일 갱신 확인 — fan-out 영역에 stroke-dasharray="0" (solid) 인 path 가 존재한다.
    const fanCard = activatedRow.locator('xpath=ancestor::div[contains(@class,"rounded-xl")]').first();
    const solidPaths = fanCard.locator('svg path[stroke-dasharray="0"]');
    await expect(solidPaths.first()).toBeVisible({ timeout: 5_000 });
    expect(await solidPaths.count()).toBeGreaterThanOrEqual(1);

    // 5. data-tgt[data-active="1"] 가 새 활성 행이다.
    await expect(activatedRow.locator('[data-tgt][data-active="1"]')).toHaveCount(1);

    // 6. 행 순서가 swap 전과 동일한지 확인 — 사용자 요구: 파이프라인 순서는 그대로, 선만 바뀐다.
    const postSwapPipelineOrder = await fanCard
      .locator('[data-tgt] .text-foreground')
      .allTextContents()
      .then((texts) => texts.map((t) => t.trim()));
    expect(postSwapPipelineOrder).toEqual(preSwapPipelineOrder);
  });
});
