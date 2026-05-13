import { test, expect } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * CSC-04 (CSU-04.01/02/04 + Multi-look) 시연 통합 e2e.
 *
 * 검증 흐름:
 *   1) /plan/console 의 multi-level branch 파이프라인 → L1A 노드 모달
 *   2) H5 업로드 → "Uploaded" 표시
 *   3) Execute → exit 0 + QuickLook PNG <img> 표시
 *   4) 모달 닫고 L1B 노드 모달 열기 → "Chained from prev run" 표시
 *   5) Execute → exit 0 + 다른 QuickLook PNG (multilook 산출)
 *
 * 외부 의존:
 *   - 컨테이너가 localhost:3010 에 떠 있고 /api/sar/* 가 동작
 *   - 호스트에 ~1.6GB demo H5 존재 (16_resized 의 첫 5000 pulses 슬라이스).
 *     없으면 테스트 자동 skip.
 */

const DEMO_H5 = process.env.SDPE_E2E_H5 ?? 'C:/Users/USER/Downloads/16_resized_demo5000.h5';

test.describe('CSC-04 데모 — H5 업로드 → L1A → L1B 체이닝', () => {
  test.skip(!existsSync(DEMO_H5), `데모 H5 (${DEMO_H5}) 가 없어서 skip — SDPE_E2E_H5 환경변수로 경로 지정 가능`);

  test('L1A 업로드/실행 + L1B 체이닝 → QuickLook 확인', async ({ page }) => {
    test.setTimeout(5 * 60_000);

    // multi-level branch 파이프라인 ID — pipeline.mock.ts 에 정의
    await page.goto('/plan/console?pipelineId=PL-MULTI-LEVEL-BRANCHED');

    // 그래프가 렌더될 때까지 기다림 — react-flow 의 노드가 적어도 하나 보일 때.
    const l1aNode = page.locator('.react-flow__node[data-id="step-4"]');
    const l1bNode = page.locator('.react-flow__node[data-id="step-5"]');
    const speckleLeeNode = page.locator('.react-flow__node[data-id="step-6"]');
    const speckleGammaNode = page.locator('.react-flow__node[data-id="step-7"]');
    await expect(l1aNode).toBeVisible({ timeout: 15_000 });
    await expect(l1bNode).toBeVisible();

    // 그래프에서 sub-stage 라벨이 노드에 표시되는지 — 모달 열기 전 시점에서 검증.
    // (모달 작업 후 시점엔 reactflow 가 잠시 노드를 재렌더하면서 timing race 가 생김)
    await expect(l1bNode).toContainText('Multi-look 4×10', { timeout: 5_000 });
    await expect(speckleLeeNode).toContainText('Speckle Lee 5×5');
    await expect(speckleGammaNode).toContainText('Speckle Gamma-MAP 5×5');

    // ── L1A 모달 ─────────────────────────────────────────────────────────
    await l1aNode.dblclick();
    const uploadPanel = page.getByTestId('sar-upload-panel');
    await expect(uploadPanel).toBeVisible();

    // Parameters 탭 → CODE 섹션이 컨테이너 안 실제 csu_04_04 SLC formation 소스를
    // fetch 해서 보여줘야 한다. (range_compress + azimuth_compress + SLC 누적 orchestrator)
    await page.getByRole('button', { name: 'Parameters' }).click();
    const sourceBadge = page.getByTestId('code-source-badge');
    await expect(sourceBadge).toBeVisible({ timeout: 10_000 });
    await expect(sourceBadge).toContainText('Live source');
    // 파일명도 진짜 patterns
    await expect(page.getByText('csu_04_04_slc_formation.py')).toBeVisible();
    // Monaco 안의 첫 라인(docstring) — Monaco view-line 셀렉터 사용
    await expect(page.locator('.view-line').first()).toContainText('CSU-04.04 SLC formation');

    // Save changes 흐름: 1) confirm 띄움 2) accept 시 토스트
    // Monaco 에 키보드 입력으로 dirty 트리거.
    // editor 영역을 클릭해 포커스 → 끝으로 → 한 글자 입력.
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type('# e', { delay: 50 });
    const saveBtn = page.getByRole('button', { name: /Save changes/ });
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('production');
      await dialog.accept();
    });
    await saveBtn.click();
    // 토스트 노출 (영문)
    await expect(page.getByText(/take effect in the production/i)).toBeVisible({ timeout: 5_000 });
    // 저장 후 배지가 User edit 으로 전환
    await expect(sourceBadge).toContainText('User edit');

    // INFO 탭으로 돌아가서 업로드 / 실행 흐름 진행
    await page.getByRole('button', { name: 'Info' }).click();

    // 파일 첨부 (input 은 hidden 이라 setInputFiles 로 바로)
    // 새 흐름: 파일 선택 즉시 업로드 시작 → 업로드 끝나야 Execute 활성.
    await page.getByTestId('sar-h5-input').setInputFiles(path.resolve(DEMO_H5));
    await expect(page.getByTestId('sar-picked-name')).toContainText('demo');
    // 업로드 진행 표시 자동 노출
    await expect(page.getByTestId('sar-uploading')).toBeVisible({ timeout: 5_000 });
    // 진행률 텍스트가 % 단위로 노출돼야 한다.
    await expect(page.getByTestId('sar-progress-text')).toContainText(/%/);
    // 진행 막대 width 가 0 → > 0 으로 변하는 것을 확인.
    const bar = page.getByTestId('sar-progress-bar');
    await expect(bar).toBeVisible();
    await expect.poll(async () =>
      Number((await bar.evaluate((el: HTMLDivElement) => el.style.width.replace('%', ''))) || '0'),
      { timeout: 60_000 },
    ).toBeGreaterThan(0);
    await expect(page.getByTestId('sar-upload-done')).toBeVisible({ timeout: 60_000 });

    // 업로드 끝나면 Execute 가 활성화된다.
    const execBtn = page.getByTestId('sar-execute');
    await expect(execBtn).toBeEnabled();
    await execBtn.click();
    // SSE 로 라인이 실시간으로 흘러야 한다 — done 보다 먼저 일부 stdout 라인이 떠야 정상.
    // main.py 의 첫 print: "SAR RDA Processor v3.0 — Parameters" 줄이 나오는지로 검증.
    await expect(page.getByText(/SAR RDA Processor v3\.0/)).toBeVisible({ timeout: 90_000 });

    // 결과 패널 + QuickLook image
    const result = page.getByTestId('sar-result');
    await expect(result).toBeVisible({ timeout: 5 * 60_000 });
    const quicklook = page.getByTestId('sar-quicklook-img');
    await expect(quicklook).toBeVisible();

    // 이미지가 실제로 로드됐는지: naturalWidth > 0
    const naturalWidth = await quicklook.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    // exit 0 텍스트 확인
    await expect(result).toContainText(/exit 0/);

    // SLC TIF / metadata XML 도 outputs 에 노출됨
    const filesList = page.getByTestId('sar-files');
    await expect(filesList).toContainText('QuickLook.png');
    await expect(filesList).toContainText(/SLC_complex.*\.tif/);
    await expect(filesList).toContainText(/SLC_metadata.*\.xml/);

    const l1aRunIdText = await result.getByText(/runId/).innerText();
    expect(l1aRunIdText).toMatch(/runId\s+[a-f0-9-]{36}/);

    // 모달 닫기 (Esc)
    await page.keyboard.press('Escape');
    await expect(uploadPanel).toBeHidden();

    // L1A 노드(step-4) 의 canvas 상태 표시 — COMPLETED 체크 아이콘 + duration 텍스트
    await expect(page.getByTestId('node-status-4')).toHaveAttribute('data-status', 'COMPLETED');
    await expect(page.getByTestId('node-duration-4')).toBeVisible();

    // ── L1B[multilook] 모달 (체이닝) ─────────────────────────────────────
    await l1bNode.dblclick();
    // 시작 노드 아니므로 업로드 패널이 아니라 prev-run 표시가 떠야 한다.
    await expect(page.getByTestId('sar-upload-panel')).toHaveCount(0);
    await expect(page.getByTestId('sar-prev-run')).toBeVisible();

    // L1B Execute (multilook ~3~5초)
    await page.getByTestId('sar-execute').click();
    const l1bResult = page.getByTestId('sar-result');
    await expect(l1bResult).toBeVisible({ timeout: 60_000 });
    await expect(l1bResult).toContainText(/exit 0/);
    const l1bQuicklook = page.getByTestId('sar-quicklook-img');
    await expect(l1bQuicklook).toBeVisible();
    const l1bWidth = await l1bQuicklook.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(l1bWidth).toBeGreaterThan(0);

    // L1B outputs 는 MLD_*.tif / *.xml / *_ql.png 패턴
    await expect(page.getByTestId('sar-files')).toContainText(/MLD_.*\.tif/);
    await expect(page.getByTestId('sar-files')).toContainText(/MLD_.*\.xml/);

    // 캐시 verify 용으로 multilook 산출 QuickLook src 를 기억해둔다.
    const multilookQuicklookSrc = await l1bQuicklook.getAttribute('src');

    await page.keyboard.press('Escape');

    // ── 재오픈 시 캐시 hydration — 직전 OUTPUT (터미널 로그 + QuickLook) 이 그대로 ──
    await l1bNode.dblclick();
    const cachedQuicklook = page.getByTestId('sar-quicklook-img');
    await expect(cachedQuicklook).toBeVisible();
    await expect(cachedQuicklook).toHaveAttribute('src', multilookQuicklookSrc ?? '');
    await expect(page.getByTestId('sar-result')).toContainText(/exit 0/);
    await page.keyboard.press('Escape');

    // ── L1B[speckle lee] 모달 — multilook 결과를 입력으로 받아 lee 필터 적용 ──
    // (Save changes 후에도 step.sarSubStage 가 유지돼서 L1B_SPECKLE 로 라우팅되어야 함)
    await speckleLeeNode.dblclick();
    await expect(page.getByTestId('sar-prev-run')).toBeVisible();
    await page.getByTestId('sar-execute').click();
    const speckleResult = page.getByTestId('sar-result');
    await expect(speckleResult).toBeVisible({ timeout: 60_000 });
    await expect(speckleResult).toContainText(/exit 0/);
    // speckle 산출 파일명 패턴 (lee 필터)
    await expect(page.getByTestId('sar-files')).toContainText(/_lee.*\.tif/);
    // QuickLook PNG 도 함께 생성돼야 한다 (csu_04_06 의 matplotlib quicklook)
    await expect(page.getByTestId('sar-files')).toContainText(/_lee.*_ql\.png/);
    await expect(page.getByTestId('sar-quicklook-img')).toBeVisible();
  });
});
