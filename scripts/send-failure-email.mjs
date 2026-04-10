#!/usr/bin/env node

/**
 * CI/CD 파이프라인 실패 시 HTML 이메일 발송 스크립트.
 *
 * 환경변수:
 *   SMTP_HOST       — SMTP 서버 호스트 (예: smtp.gmail.com)
 *   SMTP_PORT       — SMTP 포트 (기본: 587)
 *   SMTP_USER       — SMTP 인증 사용자
 *   SMTP_PASS       — SMTP 인증 비밀번호
 *   MAIL_FROM       — 발신자 (기본: ci-bot@sdpe.local)
 *   MAIL_TO         — 수신자, 쉼표 구분 (기본: dev-team@sdpe.local)
 *   CI_PROJECT_URL  — GitLab 프로젝트 URL (GitLab CI 자동 제공)
 *   CI_PIPELINE_URL — GitLab 파이프라인 URL (GitLab CI 자동 제공)
 *   CI_COMMIT_SHA   — 커밋 SHA (GitLab CI 자동 제공)
 *   CI_COMMIT_SHORT_SHA — 짧은 커밋 SHA
 *   CI_COMMIT_BRANCH    — 브랜치명
 *   CI_COMMIT_AUTHOR    — 커밋 작성자
 *   CI_COMMIT_MESSAGE   — 커밋 메시지
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createTransport } from 'nodemailer';

// ── 유틸리티 ──

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function readFileOr(path, fallback) {
  try {
    if (existsSync(path)) return readFileSync(path, 'utf-8').trim();
  } catch {
    /* ignore */
  }
  return fallback;
}

function readJsonOr(path, fallback) {
  const content = readFileOr(path, null);
  if (!content) return fallback;
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function toKST(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

// ── 1. CI 결과 수집 ──

const ciDir = 'ci-results';

const steps = {
  build: readFileOr(`${ciDir}/build-result.txt`, 'skipped'),
  lint: readFileOr(`${ciDir}/lint-result.txt`, 'skipped'),
  test: readFileOr(`${ciDir}/test-result.txt`, 'skipped'),
  e2e: readFileOr(`${ciDir}/e2e-result.txt`, 'skipped'),
  ruffCheck: readFileOr(`${ciDir}/ruff-check-result.txt`, 'skipped'),
  ruffFormat: readFileOr(`${ciDir}/ruff-format-result.txt`, 'skipped'),
  mypy: readFileOr(`${ciDir}/mypy-result.txt`, 'skipped'),
};

const hasFail = Object.values(steps).some((v) => v === 'failure');
if (!hasFail) {
  console.log('All steps passed — no failure email needed.');
  process.exit(0);
}

// ── 2. 테스트 결과 파싱 ──

const testJson = readJsonOr(`${ciDir}/test-unit.json`, null);
const e2eJson = readJsonOr(`${ciDir}/test-e2e.json`, null);

function parseJestResults(json) {
  if (!json) return null;
  const { numPassedTests = 0, numFailedTests = 0, numTotalTests = 0, testResults = [] } = json;
  const totalDuration = ((json.testResults || []).reduce((sum, s) => sum + (s.endTime - s.startTime), 0) / 1000).toFixed(1);
  const allSuites = testResults.map((suite) => {
    const name = suite.name.split('/').pop();
    const passedTests = suite.testResults.filter((t) => t.status === 'passed');
    const failedTests = suite.testResults.filter((t) => t.status === 'failed');
    return {
      name,
      status: suite.status,
      passed: passedTests.length,
      failedCount: failedTests.length,
      duration: ((suite.endTime - suite.startTime) / 1000).toFixed(1),
      tests: suite.testResults.map((t) => ({
        title: t.ancestorTitles.concat(t.title).join(' > '),
        status: t.status,
        duration: ((t.duration || 0) / 1000).toFixed(2),
        message: t.status === 'failed' ? (t.failureMessages || []).join('\n').slice(0, 500) : '',
      })),
    };
  });
  const failedSuites = allSuites.filter((s) => s.status === 'failed');
  return { numPassedTests, numFailedTests, numTotalTests, totalDuration, allSuites, failedSuites };
}

const unitResults = parseJestResults(testJson);
const e2eResults = parseJestResults(e2eJson);

// ── 3. Git / CI 정보 ──

const branch = process.env.CI_COMMIT_BRANCH || exec('git rev-parse --abbrev-ref HEAD') || 'unknown';
const shortSha = process.env.CI_COMMIT_SHORT_SHA || exec('git rev-parse --short HEAD') || 'unknown';
const author = process.env.CI_COMMIT_AUTHOR || exec('git log -1 --format=%an') || 'unknown';
const commitMessage = process.env.CI_COMMIT_MESSAGE || exec('git log -1 --format=%s') || '';
const pipelineUrl = process.env.CI_PIPELINE_URL || '#';
const projectUrl = process.env.CI_PROJECT_URL || '#';
const commitUrl = `${projectUrl}/-/commit/${process.env.CI_COMMIT_SHA || exec('git rev-parse HEAD')}`;

const kst = toKST(new Date());
const dateStr = kst.toISOString().slice(0, 16).replace('T', ' ') + ' KST';

// ── 4. 실패 개수 집계 ──

const totalFailed = (unitResults?.numFailedTests || 0) + (e2eResults?.numFailedTests || 0);
const totalPassed = (unitResults?.numPassedTests || 0) + (e2eResults?.numPassedTests || 0);
const totalTests = (unitResults?.numTotalTests || 0) + (e2eResults?.numTotalTests || 0);
const failedSuiteCount =
  (unitResults?.failedSuites?.length || 0) + (e2eResults?.failedSuites?.length || 0);

// ── 5. HTML 이메일 생성 ──

function stepBadge(result) {
  if (result === 'success')
    return '<span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700">PASS</span>';
  if (result === 'failure')
    return '<span style="background:#fecaca;color:#b91c1c;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700">FAIL</span>';
  return '<span style="background:#f3f4f6;color:#9ca3af;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700">SKIP</span>';
}

function stepIcon(result) {
  if (result === 'success') return '<span style="color:#22c55e;font-weight:700">&#10003;</span>';
  if (result === 'failure') return '<span style="color:#ef4444;font-weight:700">&#10007;</span>';
  return '<span style="color:#9ca3af">&#8212;</span>';
}

function stepRow(icon, label, detail, result) {
  const bg = result === 'failure' ? '#fef2f2' : '#f0fdf4';
  const textColor = result === 'failure' ? '#b91c1c' : '#374151';
  const weight = result === 'failure' ? '600' : '400';
  return `
    <tr>
      <td style="background:${bg};padding:8px 12px;border-radius:5px">
        ${stepIcon(result)}
        <span style="color:${textColor};font-weight:${weight};margin-left:6px">${label}</span>
        ${detail ? `<span style="color:#6b7280;font-size:12px;margin-left:4px">${detail}</span>` : ''}
      </td>
      <td style="background:${bg};padding:8px 12px;text-align:right;border-radius:5px">${stepBadge(result)}</td>
    </tr>`;
}

function buildUnitDetail() {
  if (!unitResults) return '';
  if (steps.test === 'failure') return `(${unitResults.numPassedTests} passed / ${unitResults.numFailedTests} failed)`;
  return `(${unitResults.numTotalTests} passed)`;
}

function buildE2eDetail() {
  if (!e2eResults) return '';
  if (steps.e2e === 'failure') return `(${e2eResults.numPassedTests} passed / ${e2eResults.numFailedTests} failed)`;
  return `(${e2eResults.numTotalTests} passed)`;
}

function testDetailSection(results) {
  if (!results?.allSuites?.length) return '';
  let html = '';
  for (const suite of results.allSuites) {
    const isFailed = suite.status === 'failed';
    const headerBg = isFailed ? '#fef2f2' : '#f0fdf4';
    const icon = isFailed ? '<span style="color:#ef4444;font-weight:700">&#10007;</span>' : '<span style="color:#22c55e;font-weight:700">&#10003;</span>';
    const nameColor = isFailed ? '#b91c1c' : '#374151';

    // 스위트 헤더
    html += `
      <div style="margin-bottom:16px">
        <div style="background:${headerBg};padding:8px 12px;border-radius:5px;margin-bottom:4px">
          ${icon}
          <span style="color:${nameColor};font-weight:600;margin-left:6px">${escapeHtml(suite.name)}</span>
          <span style="color:#22c55e;font-size:12px;margin-left:12px">${suite.passed} passed</span>
          ${isFailed ? `<span style="color:#ef4444;font-size:12px;margin-left:8px">${suite.failedCount} failed</span>` : ''}
          <span style="color:#9ca3af;font-size:12px;margin-left:8px">${suite.duration}s</span>
        </div>`;
    // 개별 테스트 케이스
    for (let i = 0; i < suite.tests.length; i++) {
      const t = suite.tests[i];
      const rowBg = t.status === 'failed' ? '#fef2f2' : i % 2 === 0 ? '#fff' : '#f9fafb';
      if (t.status === 'passed') {
        html += `
          <div style="background:${rowBg};padding:6px 10px 6px 28px;border-radius:3px">
            <span style="color:#22c55e;font-weight:700">&#10003;</span>
            <span style="color:#374151;font-size:12px;margin-left:4px">${escapeHtml(t.title)}</span>
            <span style="color:#9ca3af;font-size:11px;margin-left:8px">${t.duration}s</span>
          </div>`;
      } else {
        html += `
          <div style="background:#fef2f2;padding:6px 10px 6px 28px;border-radius:3px">
            <span style="color:#ef4444;font-weight:700">&#10007;</span>
            <span style="color:#b91c1c;font-weight:600;font-size:12px;margin-left:4px">${escapeHtml(t.title)}</span>
            <span style="color:#9ca3af;font-size:11px;margin-left:8px">${t.duration}s</span>
          </div>
          <pre style="background:#1e1e2e;color:#e5e7eb;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;margin:4px 28px 8px 28px;line-height:1.5">${escapeHtml(t.message)}</pre>`;
      }
    }
    html += '</div>';
  }
  return html;
}

// 실패한 단계 텍스트 (빌드/린트 실패 시에도 표시)
function buildFailSummaryText() {
  const failedSteps = [];
  if (steps.build === 'failure') failedSteps.push('빌드');
  if (steps.lint === 'failure') failedSteps.push('린트');
  if (steps.test === 'failure') failedSteps.push('단위 테스트');
  if (steps.e2e === 'failure') failedSteps.push('E2E 테스트');
  if (steps.ruffCheck === 'failure') failedSteps.push('Python Ruff Check');
  if (steps.ruffFormat === 'failure') failedSteps.push('Python Ruff Format');
  if (steps.mypy === 'failure') failedSteps.push('Python Mypy');
  return failedSteps.join(', ');
}

function buildNonTestFailSection() {
  let html = '';
  const outputMap = {
    build: { label: '빌드 출력', file: `${ciDir}/build-output.txt` },
    lint: { label: '린트 출력', file: `${ciDir}/lint-output.txt` },
    ruffCheck: { label: 'Ruff Check 출력', file: `${ciDir}/python-output.txt` },
    ruffFormat: { label: 'Ruff Format 출력', file: `${ciDir}/python-output.txt` },
    mypy: { label: 'Mypy 출력', file: `${ciDir}/python-output.txt` },
  };
  for (const [key, { label, file }] of Object.entries(outputMap)) {
    if (steps[key] !== 'failure') continue;
    const output = readFileOr(file, '(출력 없음)');
    const tail = output.split('\n').slice(-30).join('\n');
    html += `
      <div style="margin-bottom:16px">
        <div style="background:#fef2f2;padding:8px 12px;border-radius:5px;margin-bottom:4px">
          <span style="color:#ef4444;font-weight:700">&#10007;</span>
          <span style="color:#b91c1c;font-weight:600;margin-left:6px">${label}</span>
        </div>
        <pre style="background:#1e1e2e;color:#e5e7eb;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;margin:4px 0 8px 12px;line-height:1.5;max-height:300px">${escapeHtml(tail)}</pre>
      </div>`;
  }
  return html;
}

const failSummaryText = buildFailSummaryText();
const subjectLine = `[FAILED] CI/CD 파이프라인 실패 - ${branch}@${shortSha}`;

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
</style>
</head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a2e">
<div style="max-width:880px;margin:0 auto;padding:24px">

  <!-- Alert Banner -->
  <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px 20px;margin-bottom:20px">
    <div style="font-size:18px;font-weight:700;color:#b91c1c">&#9888; CI/CD 파이프라인 테스트 실패</div>
    <div style="font-size:12px;color:#dc2626;margin-top:4px">${failSummaryText} 단계에서 실패가 감지되었습니다.</div>
  </div>

  <!-- Build Info -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">빌드 정보</div>
    <table style="font-size:12px;border-collapse:collapse;width:100%">
      <tr>
        <td style="color:#9ca3af;padding:2px 12px 2px 0">브랜치</td>
        <td style="font-weight:600;color:#374151;padding:2px 24px 2px 0">${escapeHtml(branch)}</td>
        <td style="color:#9ca3af;padding:2px 12px 2px 0">커밋</td>
        <td style="font-weight:600;color:#374151;padding:2px 24px 2px 0">${escapeHtml(shortSha)}</td>
        <td style="color:#9ca3af;padding:2px 12px 2px 0">작성자</td>
        <td style="font-weight:600;color:#374151;padding:2px 24px 2px 0">${escapeHtml(author)}</td>
        <td style="color:#9ca3af;padding:2px 12px 2px 0">일시</td>
        <td style="font-weight:600;color:#374151">${dateStr}</td>
      </tr>
    </table>
    <div style="font-size:12px;margin-top:6px">
      <span style="color:#9ca3af">메시지</span>
      <span style="color:#374151;margin-left:12px">${escapeHtml(commitMessage.split('\n')[0])}</span>
    </div>
  </div>

  <!-- Pipeline Summary -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">파이프라인 요약</div>
    <table style="width:100%;border-collapse:separate;border-spacing:0 4px">
      ${stepRow('', '빌드 (nest build)', '', steps.build)}
      ${stepRow('', '린트 (ESLint)', '', steps.lint)}
      ${stepRow('', '단위 테스트', buildUnitDetail(), steps.test)}
      ${stepRow('', 'E2E 테스트', buildE2eDetail(), steps.e2e)}
      ${stepRow('', 'Python 린트 (ruff check)', '', steps.ruffCheck)}
      ${stepRow('', 'Python 포맷 (ruff format)', '', steps.ruffFormat)}
      ${stepRow('', 'Python 타입 (mypy)', '', steps.mypy)}
    </table>
  </div>

  <!-- Test Details -->
  ${
    unitResults?.allSuites?.length || e2eResults?.allSuites?.length
      ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:#111827">테스트 상세</div>
      ${totalFailed > 0 ? `<span style="background:#fef2f2;color:#b91c1c;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:700">${failedSuiteCount} suites / ${totalFailed} failures</span>` : `<span style="background:#f0fdf4;color:#166534;padding:2px 12px;border-radius:10px;font-size:11px;font-weight:700">${unitResults?.allSuites?.length || 0} suites / all passed</span>`}
    </div>
    ${testDetailSection(unitResults)}
    ${testDetailSection(e2eResults)}
  </div>`
      : ''
  }

  <!-- Non-test failure details (build/lint/python) -->
  ${buildNonTestFailSection()}

  <!-- Test Summary Stats -->
  ${
    totalTests > 0
      ? `
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:20px">
    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px">테스트 결과 요약</div>
    <table style="width:100%;border-collapse:collapse;text-align:center">
      <tr>
        <td style="background:#f0fdf4;padding:10px;border-radius:8px;width:25%">
          <div style="color:#9ca3af;font-size:10px;letter-spacing:1px">TOTAL</div>
          <div style="font-size:18px;font-weight:700;color:#374151">${totalTests}</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#f0fdf4;padding:10px;border-radius:8px;width:25%">
          <div style="color:#9ca3af;font-size:10px;letter-spacing:1px">PASSED</div>
          <div style="font-size:18px;font-weight:700;color:#22c55e">${totalPassed}</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#fef2f2;padding:10px;border-radius:8px;width:25%">
          <div style="color:#9ca3af;font-size:10px;letter-spacing:1px">FAILED</div>
          <div style="font-size:18px;font-weight:700;color:#ef4444">${totalFailed}</div>
        </td>
        <td style="width:8px"></td>
        <td style="background:#f9fafb;padding:10px;border-radius:8px;width:25%">
          <div style="color:#9ca3af;font-size:10px;letter-spacing:1px">DURATION</div>
          <div style="font-size:18px;font-weight:700;color:#374151">${unitResults?.totalDuration || e2eResults?.totalDuration || '-'}s</div>
        </td>
      </tr>
    </table>
  </div>`
      : ''
  }

  <!-- Action Links -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:20px;text-align:center">
    <a href="${pipelineUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:8px 24px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;margin:0 6px">파이프라인 보기</a>
    <a href="${commitUrl}" style="display:inline-block;background:#fff;color:#374151;padding:8px 24px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;border:1px solid #e5e7eb;margin:0 6px">커밋 상세 보기</a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding-top:16px;border-top:1px solid #e5e7eb">
    <div style="color:#9ca3af;font-size:11px">이 메일은 SDPE CI/CD 파이프라인에서 자동 발송되었습니다.</div>
    <div style="color:#d1d5db;font-size:10px;margin-top:4px">SDPE CI Bot | 테스트 성공 시에는 메일이 발송되지 않습니다.</div>
  </div>

</div>
</body>
</html>`;

// ── 6. 이메일 발송 ──

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM || 'ci-bot@sdpe.local';
const mailTo = (process.env.MAIL_TO || 'dev-team@sdpe.local').split(',').map((s) => s.trim());

if (!smtpHost) {
  console.error('SMTP_HOST is not set. Skipping email.');
  console.log('--- Generated email subject ---');
  console.log(subjectLine);
  console.log('--- Generated email saved to ci-results/failure-email.html ---');
  // SMTP 미설정 시에도 HTML 파일은 저장
  const { writeFileSync: wf } = await import('node:fs');
  wf('ci-results/failure-email.html', html);
  process.exit(0);
}

const transporter = createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
  tls: { rejectUnauthorized: false },
});

try {
  const info = await transporter.sendMail({
    from: mailFrom,
    to: mailTo,
    subject: subjectLine,
    html,
  });
  console.log(`Failure email sent: ${info.messageId}`);
} catch (err) {
  console.error('Failed to send email:', err.message);
  process.exit(1);
}
