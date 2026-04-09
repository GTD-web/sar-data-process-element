#!/usr/bin/env node

/**
 * CI/CD HTML 보고서 생성 스크립트.
 *
 * 환경변수로 전달된 CI 파이프라인 결과와 git 정보를 수집하여
 * reports/YYYY-MM-DD/ 경로에 HTML 보고서를 생성한다.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── 한국 시간 ──

function toKST(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function kstDateStr(kst) {
  return kst.toISOString().split('T')[0];
}

function kstTimeStr(kst) {
  return kst.toISOString().split('T')[1].split('.')[0];
}

// ── 유틸리티 ──

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readFileOrNull(path) {
  try {
    if (existsSync(path)) return readFileSync(path, 'utf-8');
  } catch {
    /* ignore */
  }
  return null;
}

function readJsonOrNull(path) {
  const content = readFileOrNull(path);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ── 1. Git 정보 수집 ──

function collectGitInfo() {
  const sha = exec('git rev-parse HEAD');
  const shortSha = exec('git rev-parse --short HEAD');
  const branch = exec('git rev-parse --abbrev-ref HEAD');
  const author = exec('git log -1 --format=%an');
  const authorEmail = exec('git log -1 --format=%ae');
  const commitDate = exec('git log -1 --format=%ci');
  const commitMessage = exec('git log -1 --format=%B');
  const parentCount = exec('git rev-list --parents -n 1 HEAD').split(' ').length - 1;
  const isMerge = parentCount > 1;

  // 변경 파일 목록 (부모 커밋 대비)
  const diffStat = exec('git diff HEAD~1 --stat 2>/dev/null') || exec('git diff --stat 2>/dev/null');
  const changedFilesRaw = exec('git diff HEAD~1 --name-status 2>/dev/null') || '';
  const diffNumstat = exec('git diff HEAD~1 --numstat 2>/dev/null') || '';

  const changedFiles = changedFilesRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');
      // 파일별 diff (최대 3000자)
      const rawDiff = exec(`git diff HEAD~1 -- "${filePath}" 2>/dev/null`);
      const diff = rawDiff.length > 3000 ? rawDiff.slice(0, 3000) + '\n... (truncated)' : rawDiff;
      return { status, path: filePath, diff, desc: describeFileChange(status, filePath) };
    });

  return {
    sha,
    shortSha,
    branch,
    author,
    authorEmail,
    commitDate,
    commitMessage,
    isMerge,
    diffStat,
    changedFiles,
    diffNumstat: diffNumstat
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [added, deleted, file] = line.split('\t');
        return { added: parseInt(added) || 0, deleted: parseInt(deleted) || 0, file };
      }),
  };
}

/** 파일 경로와 변경 유형으로부터 사람이 읽을 수 있는 변경 설명 생성 */
function describeFileChange(status, filePath) {
  const actionMap = { M: '수정', A: '신규 추가', D: '삭제', R: '이름 변경', C: '복사' };
  const action = actionMap[status] || '변경';

  const name = filePath.split('/').pop();

  // 파일 유형별 설명
  if (name.endsWith('.e2e-spec.ts')) return `E2E 테스트 ${action} — 통합 시나리오 검증 코드`;
  if (name.endsWith('.spec.ts')) return `단위 테스트 ${action} — 개별 컴포넌트 검증 코드`;
  if (name.endsWith('.module.ts')) return `NestJS 모듈 ${action} — DI 구성 및 모듈 의존성`;
  if (name.endsWith('.service.ts')) return `서비스 ${action} — 비즈니스 로직`;
  if (name.endsWith('.controller.ts')) return `컨트롤러 ${action} — API 엔드포인트`;
  if (name.endsWith('.handler.ts')) return `핸들러 ${action} — CQRS 커맨드/쿼리/이벤트 처리`;
  if (name.endsWith('.use-case.ts')) return `유스케이스 ${action} — 도메인 워크플로우 로직`;
  if (name.endsWith('.entity.ts')) return `엔티티 ${action} — 데이터베이스 모델 정의`;
  if (name.endsWith('.model.ts')) return `도메인 모델 ${action} — 핵심 도메인 객체`;
  if (name.endsWith('.type.ts') || name.endsWith('.types.ts')) return `타입 정의 ${action} — 인터페이스 및 타입`;
  if (name.endsWith('.constant.ts') || name.endsWith('.constants.ts')) return `상수 ${action} — 설정값 및 상수 정의`;
  if (name.endsWith('.interface.ts')) return `인터페이스 ${action} — 포트/어댑터 계약`;
  if (name.endsWith('.repository.ts')) return `리포지토리 ${action} — 데이터 영속성 계층`;
  if (name.endsWith('.message-handler.ts')) return `메시지 핸들러 ${action} — PGMQ 메시지 처리`;
  if (name.endsWith('.migration.ts')) return `DB 마이그레이션 ${action} — 스키마 변경`;
  if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) return `설정 파일 ${action} — CI/CD 또는 배포 구성`;
  if (filePath.endsWith('.json')) return `설정/메타 파일 ${action}`;
  if (filePath.endsWith('.mjs') || filePath.endsWith('.js')) return `스크립트 ${action}`;
  if (filePath.endsWith('.md')) return `문서 ${action}`;
  if (filePath.endsWith('.py')) return `Python 코드 ${action} — SAR 알고리즘`;
  if (filePath.endsWith('.sql')) return `SQL 스크립트 ${action} — 데이터베이스 초기화/마이그레이션`;
  if (filePath.endsWith('.ts')) return `TypeScript 소스 ${action}`;

  return `${action}`;
}

// ── 2. 영향 분석 ──

const MODULE_MAP = {
  'apps/pipeline-workflow-subsystem': {
    name: 'Pipeline Workflow Subsystem',
    desc: '파이프라인 워크플로우 (메인 앱)',
    impact: '파이프라인 오케스트레이션 흐름에 직접 영향',
  },
  'apps/data-collecting-subsystem': {
    name: 'Data Collecting Subsystem',
    desc: '데이터 수집',
    impact: '데이터 수집 로직 영향',
  },
  'apps/sar-processing-subsystem': {
    name: 'SAR Processing Subsystem',
    desc: 'SAR 처리',
    impact: 'SAR 데이터 처리 로직 영향',
  },
  'apps/post-processing-tool': {
    name: 'Post-Processing Tool',
    desc: '후처리 도구',
    impact: '후처리 로직 영향',
  },
  'apps/data-service-subsystem': {
    name: 'Data Service Subsystem',
    desc: '데이터 서비스',
    impact: '데이터 서비스 API 영향',
  },
  'libs/sdpe-shared': {
    name: 'SDPE Shared',
    desc: '공유 라이브러리 (@sdpe/shared)',
    impact: '공유 모델/타입 변경으로 모든 앱에 영향 가능',
  },
  'libs/sdpe-database': {
    name: 'SDPE Database',
    desc: 'DB 모듈 (@sdpe/database)',
    impact: '데이터베이스 계층 변경으로 데이터 모델 영향 가능',
  },
  'libs/sdpe-infrastructure': {
    name: 'SDPE Infrastructure',
    desc: '인프라 모듈 (PGMQ 등)',
    impact: '메시징/인프라 계층 변경으로 통신 흐름 영향 가능',
  },
  'libs/csu-08.03-pipeline-scheduler': {
    name: 'Pipeline Scheduler (CSU-08.03)',
    desc: 'DAG 기반 파이프라인 스케줄러',
    impact: '파이프라인 스케줄링 로직 영향',
  },
  'libs/csu-08.04-task-queue': {
    name: 'Task Queue (CSU-08.04)',
    desc: '작업 큐 관리',
    impact: '작업 할당/해결 로직 영향',
  },
  'libs/csu-08.05-processing-monitor': {
    name: 'Processing Monitor (CSU-08.05)',
    desc: '처리 모니터링',
    impact: '재시도/메트릭 로직 영향',
  },
  'libs/csu-08.06-audit-log': {
    name: 'Audit Log (CSU-08.06)',
    desc: '감사 로그',
    impact: '감사 로그 기록 로직 영향',
  },
  'libs/csu-08.07-alert': {
    name: 'Alert (CSU-08.07)',
    desc: '경고/알림',
    impact: '알림 발행 로직 영향',
  },
  'libs/csu-08.08-processing-profile': {
    name: 'Processing Profile (CSU-08.08)',
    desc: '처리 프로파일',
    impact: '프로파일 선택 로직 영향',
  },
  'libs/csu-08.09-performance-analyzer': {
    name: 'Performance Analyzer (CSU-08.09)',
    desc: '성능 분석',
    impact: '성능 분석 로직 영향',
  },
  'libs/csu-02.01-reception-event': {
    name: 'Reception Event (CSU-02.01)',
    desc: '수신 이벤트 처리',
    impact: '수신 이벤트 흐름 영향',
  },
  'algorithms/': {
    name: 'Python Algorithms',
    desc: 'SAR 알고리즘 (Python)',
    impact: 'SAR 처리 알고리즘 영향',
  },
  '.github/': {
    name: 'CI/CD',
    desc: 'GitHub Actions 워크플로우',
    impact: 'CI/CD 파이프라인 자체에 영향',
  },
  'deploy/': {
    name: 'Deployment',
    desc: '배포 설정 (K8s, Docker)',
    impact: '배포 환경 설정 영향',
  },
};

function analyzeImpact(changedFiles) {
  const affected = new Map();
  let hasTestOnly = true;
  let hasConfigOnly = true;

  for (const { path } of changedFiles) {
    const isTest = path.includes('.spec.') || path.includes('.e2e-spec.') || path.includes('/test/');
    const isConfig =
      path.endsWith('.json') ||
      path.endsWith('.yml') ||
      path.endsWith('.yaml') ||
      path.endsWith('.mjs') ||
      path.endsWith('.md');

    if (!isTest) hasTestOnly = false;
    if (!isConfig) hasConfigOnly = false;

    for (const [prefix, info] of Object.entries(MODULE_MAP)) {
      if (path.startsWith(prefix)) {
        if (!affected.has(prefix)) {
          affected.set(prefix, { ...info, files: [], hasSourceChange: false });
        }
        affected.get(prefix).files.push(path);
        if (!isTest && !isConfig) {
          affected.get(prefix).hasSourceChange = true;
        }
        break;
      }
    }
  }

  return {
    modules: [...affected.values()],
    hasTestOnly,
    hasConfigOnly,
    summary: hasTestOnly
      ? '테스트 코드만 변경되어 프로덕션 코드에 직접적인 영향 없음'
      : hasConfigOnly
        ? '설정 파일만 변경됨'
        : `${affected.size}개 모듈에 영향`,
  };
}

// ── 3. CI 결과 수집 ──

function collectCIResults() {
  const env = process.env;

  const steps = [
    { id: 'build', name: 'Build (nest build)', result: env.STEP_BUILD || 'skipped' },
    { id: 'lint', name: 'Lint (ESLint)', result: env.STEP_LINT || 'skipped' },
    { id: 'test', name: 'Unit Test (Jest)', result: env.STEP_TEST || 'skipped' },
    { id: 'e2e', name: 'E2E Test (Jest)', result: env.STEP_E2E || 'skipped' },
    { id: 'ruff-check', name: 'Python Lint (ruff check)', result: env.STEP_RUFF_CHECK || 'skipped' },
    { id: 'ruff-format', name: 'Python Format (ruff format)', result: env.STEP_RUFF_FORMAT || 'skipped' },
    { id: 'mypy', name: 'Python Type Check (mypy)', result: env.STEP_MYPY || 'skipped' },
  ];

  const overallResult = steps.some((s) => s.result === 'failure')
    ? 'failure'
    : steps.every((s) => s.result === 'success' || s.result === 'skipped')
      ? 'success'
      : 'unknown';

  return { steps, overallResult };
}

// ── 4. 테스트 결과 파싱 ──

function parseTestResults(resultsDir) {
  const unit = readJsonOrNull(join(resultsDir, 'test-unit.json'));
  const e2e = readJsonOrNull(join(resultsDir, 'test-e2e.json'));

  const parsed = [];

  for (const [label, data] of [
    ['Unit Test', unit],
    ['E2E Test', e2e],
  ]) {
    if (!data) continue;

    const suites = (data.testResults || []).map((suite) => ({
      name: suite.name?.replace(/^.*[/\\]/, '') || 'unknown',
      status: suite.status,
      duration: ((suite.endTime || 0) - (suite.startTime || 0)) / 1000,
      failureMessages: suite.message || '',
      tests: (suite.assertionResults || []).map((t) => ({
        title: t.ancestorTitles?.join(' > ') + ' > ' + t.title,
        status: t.status,
        failureMessages: (t.failureMessages || []).join('\n'),
        duration: (t.duration || 0) / 1000,
      })),
    }));

    parsed.push({
      label,
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
      skipped: data.numPendingTests || 0,
      total: data.numTotalTests || 0,
      suites: data.numPassedTestSuites || 0,
      suitesTotal: data.numTotalTestSuites || 0,
      duration: ((data.testResults || []).reduce((a, s) => a + ((s.endTime || 0) - (s.startTime || 0)), 0) / 1000).toFixed(1),
      details: suites,
    });
  }

  return parsed;
}

// ── 5. 실패 로그 수집 ──

function collectFailureLogs(resultsDir) {
  const logs = [];
  const files = ['build-output.txt', 'lint-output.txt', 'test-output.txt', 'test-e2e-output.txt', 'python-output.txt'];

  for (const file of files) {
    const content = readFileOrNull(join(resultsDir, file));
    if (content && content.length > 0) {
      // 파일 이름에서 단계명 추출
      const stepName = file
        .replace('-output.txt', '')
        .replace('test-e2e', 'E2E Test')
        .replace('test', 'Unit Test')
        .replace('build', 'Build')
        .replace('lint', 'Lint')
        .replace('python', 'Python');
      logs.push({ step: stepName, content });
    }
  }

  return logs;
}

// ── 6. HTML 생성 ──

function statusBadge(result) {
  const colors = {
    success: { bg: '#d4edda', text: '#155724', label: 'PASS' },
    failure: { bg: '#f8d7da', text: '#721c24', label: 'FAIL' },
    skipped: { bg: '#e2e3e5', text: '#383d41', label: 'SKIP' },
    unknown: { bg: '#fff3cd', text: '#856404', label: '???' },
  };
  const c = colors[result] || colors.unknown;
  return `<span class="badge" style="background:${c.bg};color:${c.text}">${c.label}</span>`;
}

function statusIcon(result) {
  if (result === 'success') return '<span class="icon-pass">&#10003;</span>';
  if (result === 'failure') return '<span class="icon-fail">&#10007;</span>';
  return '<span class="icon-skip">&#8212;</span>';
}

function fileStatusLabel(status) {
  const map = { M: '수정', A: '추가', D: '삭제', R: '이름변경', C: '복사' };
  return map[status] || status;
}

function fileStatusClass(status) {
  const map = { M: 'file-modified', A: 'file-added', D: 'file-deleted' };
  return map[status] || '';
}

function colorizeDiff(diff) {
  if (!diff) return '';
  return escapeHtml(diff)
    .split('\n')
    .map((line) => {
      if (line.startsWith('@@')) return `<span class="diff-hunk">${line}</span>`;
      if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${line}</span>`;
      if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${line}</span>`;
      return line;
    })
    .join('\n');
}

function generateHtml(git, impact, ci, testResults, failureLogs) {
  const now = toKST(new Date());
  const dateStr = kstDateStr(now);
  const timeStr = kstTimeStr(now);
  const overallClass = ci.overallResult === 'success' ? 'overall-pass' : 'overall-fail';
  const overallLabel = ci.overallResult === 'success' ? 'ALL PASSED' : 'FAILED';

  const totalAdded = git.diffNumstat.reduce((a, f) => a + f.added, 0);
  const totalDeleted = git.diffNumstat.reduce((a, f) => a + f.deleted, 0);

  const failedSteps = ci.steps.filter((s) => s.result === 'failure');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CI/CD Report - ${dateStr} - ${git.shortSha}</title>
<style>
:root {
  --pass: #28a745; --fail: #dc3545; --skip: #6c757d;
  --bg: #f8f9fa; --card: #fff; --border: #dee2e6;
  --text: #212529; --text-secondary: #6c757d;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.6; padding: 24px; }
.container { max-width: 1100px; margin: 0 auto; }

/* Header */
.header { background: var(--card); border-radius: 12px; padding: 32px; margin-bottom: 24px;
  border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.header h1 { font-size: 24px; margin-bottom: 8px; }
.header-meta { display: flex; gap: 24px; flex-wrap: wrap; color: var(--text-secondary); font-size: 14px; }
.overall-status { display: inline-block; padding: 6px 20px; border-radius: 20px; font-weight: 700;
  font-size: 14px; letter-spacing: 0.5px; margin-top: 12px; }
.overall-pass { background: #d4edda; color: #155724; }
.overall-fail { background: #f8d7da; color: #721c24; }

/* Section */
section { background: var(--card); border-radius: 12px; padding: 24px; margin-bottom: 20px;
  border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
section h2 { font-size: 18px; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--bg); }

/* Commit info */
.commit-hash { font-family: var(--mono); font-size: 13px; background: var(--bg); padding: 2px 8px;
  border-radius: 4px; }
.commit-message { background: var(--bg); padding: 12px 16px; border-radius: 8px; margin-top: 8px;
  font-size: 14px; white-space: pre-wrap; border-left: 4px solid var(--border); }
.commit-meta { display: grid; grid-template-columns: 120px 1fr; gap: 8px 16px; font-size: 14px; margin-top: 12px; }
.commit-meta dt { font-weight: 600; color: var(--text-secondary); }

/* Files */
.file-list { list-style: none; font-size: 13px; font-family: var(--mono); }
.file-list li { padding: 6px 12px; border-radius: 4px; display: flex; align-items: center; gap: 8px; }
.file-list li:nth-child(odd) { background: var(--bg); }
.file-status { display: inline-block; width: 44px; text-align: center; font-size: 11px; font-weight: 600;
  padding: 1px 6px; border-radius: 3px; font-family: var(--font); }
.file-modified .file-status { background: #fff3cd; color: #856404; }
.file-added .file-status { background: #d4edda; color: #155724; }
.file-deleted .file-status { background: #f8d7da; color: #721c24; }
.diff-stat { margin-left: auto; white-space: nowrap; font-size: 12px; }
.diff-stat .added { color: var(--pass); }
.diff-stat .deleted { color: var(--fail); }
.change-summary { font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
.file-entry { border-bottom: 1px solid var(--bg); padding-bottom: 4px; }
.file-entry:nth-child(odd) { background: #fafbfc; }
.file-desc { font-family: var(--font); font-size: 12px; color: var(--text-secondary); margin-left: 4px; }
.file-diff { margin: 8px 0 12px 0; }
.file-diff summary { cursor: pointer; font-size: 12px; color: var(--text-secondary); padding: 4px 8px; }
.file-diff summary:hover { color: var(--text); }
.diff-content { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px;
  font-family: var(--mono); font-size: 11px; line-height: 1.6; overflow-x: auto;
  white-space: pre; max-height: 400px; overflow-y: auto; margin-top: 4px; }
.diff-content .diff-add { color: #b5cea8; }
.diff-content .diff-del { color: #f48771; }
.diff-content .diff-hunk { color: #569cd6; font-weight: 600; }

/* Impact */
.impact-card { background: var(--bg); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px;
  border-left: 4px solid var(--border); }
.impact-card.source-changed { border-left-color: #ffc107; }
.impact-card h3 { font-size: 14px; margin-bottom: 4px; }
.impact-card p { font-size: 13px; color: var(--text-secondary); margin: 0; }
.impact-summary { background: #e8f4fd; padding: 12px 16px; border-radius: 8px; font-size: 14px;
  color: #0c5460; margin-bottom: 16px; }

/* Pipeline */
.pipeline { display: flex; flex-direction: column; gap: 8px; }
.pipeline-step { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px;
  background: var(--bg); font-size: 14px; }
.pipeline-step .step-name { flex: 1; }
.icon-pass { color: var(--pass); font-weight: 700; font-size: 16px; }
.icon-fail { color: var(--fail); font-weight: 700; font-size: 16px; }
.icon-skip { color: var(--skip); font-size: 16px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px;
  font-weight: 700; letter-spacing: 0.3px; }

/* Test results */
.test-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px; margin-bottom: 16px; }
.test-stat { text-align: center; padding: 16px; background: var(--bg); border-radius: 8px; }
.test-stat .number { font-size: 28px; font-weight: 700; }
.test-stat .label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; }
.test-stat.passed .number { color: var(--pass); }
.test-stat.failed .number { color: var(--fail); }
.test-stat.skipped .number { color: var(--skip); }

.test-suite { margin-top: 8px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.test-suite summary { cursor: pointer; font-size: 14px; padding: 10px 14px; display: flex;
  align-items: center; gap: 8px; background: var(--bg); }
.test-suite summary:hover { background: #e9ecef; }
.test-suite summary .suite-meta { margin-left: auto; font-size: 12px; color: var(--text-secondary); display: flex; gap: 12px; }
.test-suite summary .suite-counts span { margin-right: 6px; }
.test-suite[open] summary { border-bottom: 1px solid var(--border); }
.test-cases { padding: 4px 0; }
.test-case { font-size: 13px; padding: 5px 14px 5px 32px; display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid #f0f0f0; }
.test-case:last-child { border-bottom: none; }
.test-case.test-passed { color: var(--text); }
.test-case.test-failed { color: var(--fail); background: #fff5f5; }
.test-case.test-skipped { color: var(--skip); }
.test-case .test-duration { margin-left: auto; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
.test-failure-msg { margin: 0 14px 8px 32px; }
.suite-status-bar { display: flex; height: 3px; width: 100%; }
.suite-status-bar .bar-pass { background: var(--pass); }
.suite-status-bar .bar-fail { background: var(--fail); }
.suite-status-bar .bar-skip { background: var(--skip); }

/* Failure */
.failure-block { margin-bottom: 16px; }
.failure-block h3 { font-size: 14px; color: var(--fail); margin-bottom: 8px; }
.failure-output { background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 8px;
  font-family: var(--mono); font-size: 12px; line-height: 1.5; overflow-x: auto;
  white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; }
.no-failures { color: var(--pass); font-size: 14px; padding: 16px; text-align: center;
  background: #d4edda; border-radius: 8px; }

/* Footer */
.footer { text-align: center; padding: 24px; color: var(--text-secondary); font-size: 12px; }
</style>
</head>
<body>
<div class="container">

<!-- Header -->
<div class="header">
  <h1>CI/CD 보고서</h1>
  <div class="header-meta">
    <span>${dateStr} ${timeStr} (KST)</span>
    <span>Branch: <strong>${escapeHtml(git.branch)}</strong></span>
    <span>Commit: <code class="commit-hash">${git.shortSha}</code></span>
    <span>Author: ${escapeHtml(git.author)}</span>
  </div>
  <div class="overall-status ${overallClass}">${overallLabel}</div>
</div>

<!-- 1. 커밋 정보 -->
<section>
  <h2>1. 커밋 정보</h2>
  <dl class="commit-meta">
    <dt>커밋 해시</dt><dd><code class="commit-hash">${escapeHtml(git.sha)}</code></dd>
    <dt>브랜치</dt><dd>${escapeHtml(git.branch)}</dd>
    <dt>작성자</dt><dd>${escapeHtml(git.author)} &lt;${escapeHtml(git.authorEmail)}&gt;</dd>
    <dt>일시</dt><dd>${escapeHtml(git.commitDate)}</dd>
    <dt>유형</dt><dd>${git.isMerge ? 'Merge 커밋' : '일반 커밋'}</dd>
  </dl>
  <div class="commit-message">${escapeHtml(git.commitMessage)}</div>
</section>

<!-- 2. 변경 사항 -->
<section>
  <h2>2. 변경 사항</h2>
  ${
    git.changedFiles.length > 0
      ? `<div class="change-summary">
    ${git.changedFiles.length}개 파일 변경 |
    <span style="color:var(--pass)">+${totalAdded}</span>
    <span style="color:var(--fail)">-${totalDeleted}</span>
  </div>
  ${git.changedFiles
    .map((f) => {
      const numstat = git.diffNumstat.find((n) => n.file === f.path) || { added: 0, deleted: 0 };
      return `<div class="file-entry">
    <div class="${fileStatusClass(f.status)}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:13px;font-family:var(--mono)">
      <span class="file-status">${fileStatusLabel(f.status)}</span>
      <span>${escapeHtml(f.path)}</span>
      <span class="diff-stat"><span class="added">+${numstat.added}</span> <span class="deleted">-${numstat.deleted}</span></span>
    </div>
    <div style="padding:0 12px 2px 56px"><span class="file-desc">${escapeHtml(f.desc)}</span></div>
    ${f.diff ? `<details class="file-diff" style="padding-left:56px">
      <summary>diff 보기</summary>
      <div class="diff-content">${colorizeDiff(f.diff)}</div>
    </details>` : ''}
  </div>`;
    })
    .join('\n  ')}`
      : '<div class="no-failures">코드 변경 사항 없음 (수동 실행 또는 동일 커밋 재실행)</div>'
  }
</section>

<!-- 3. 영향 분석 -->
<section>
  <h2>3. 영향 분석</h2>
  ${
    impact.modules.length > 0
      ? `<div class="impact-summary">${escapeHtml(impact.summary)}</div>
  ${impact.modules
    .map(
      (m) => `<div class="impact-card ${m.hasSourceChange ? 'source-changed' : ''}">
    <h3>${escapeHtml(m.name)}</h3>
    <p>${escapeHtml(m.desc)} &mdash; ${escapeHtml(m.impact)}</p>
    <p style="font-size:12px;margin-top:4px;color:#888">${m.files.length}개 파일: ${m.files.map((f) => escapeHtml(f.split('/').pop())).join(', ')}</p>
  </div>`,
    )
    .join('\n  ')}`
      : '<div class="no-failures">변경된 모듈 없음 &mdash; 기존 코드에 대한 검증 실행</div>'
  }
</section>

<!-- 4. CI/CD 파이프라인 -->
<section>
  <h2>4. CI/CD 파이프라인</h2>
  <div class="pipeline">
    ${ci.steps
      .map(
        (s) => `<div class="pipeline-step">
      ${statusIcon(s.result)}
      <span class="step-name">${escapeHtml(s.name)}</span>
      ${statusBadge(s.result)}
    </div>`,
      )
      .join('\n    ')}
  </div>
</section>

<!-- 5. 테스트 결과 -->
${
  testResults.length > 0
    ? `<section>
  <h2>5. 테스트 결과</h2>
  ${testResults
    .map(
      (tr) => `
  <h3 style="font-size:15px;margin:16px 0 8px">${escapeHtml(tr.label)}</h3>
  <div class="test-summary">
    <div class="test-stat passed"><div class="number">${tr.passed}</div><div class="label">Passed</div></div>
    <div class="test-stat failed"><div class="number">${tr.failed}</div><div class="label">Failed</div></div>
    <div class="test-stat skipped"><div class="number">${tr.skipped}</div><div class="label">Skipped</div></div>
    <div class="test-stat"><div class="number">${tr.total}</div><div class="label">Total</div></div>
    <div class="test-stat"><div class="number">${tr.duration}s</div><div class="label">Duration</div></div>
  </div>
  ${tr.details
    .map((s) => {
      const suitePassed = s.tests.filter((t) => t.status === 'passed').length;
      const suiteFailed = s.tests.filter((t) => t.status === 'failed').length;
      const suiteSkipped = s.tests.filter((t) => t.status === 'pending').length;
      const suiteTotal = s.tests.length;
      const barTotal = suiteTotal || 1;
      const isFailed = s.status === 'failed';
      return `<details class="test-suite"${isFailed ? ' open' : ''}>
    <summary>
      ${statusIcon(s.status === 'passed' ? 'success' : s.status === 'failed' ? 'failure' : 'skipped')}
      <strong>${escapeHtml(s.name)}</strong>
      <span class="suite-meta">
        <span class="suite-counts"><span style="color:var(--pass)">${suitePassed} passed</span> <span style="color:var(--fail)">${suiteFailed} failed</span> <span style="color:var(--skip)">${suiteSkipped} skipped</span></span>
        <span>${s.duration.toFixed(1)}s</span>
      </span>
    </summary>
    <div class="suite-status-bar">
      <div class="bar-pass" style="width:${(suitePassed / barTotal) * 100}%"></div>
      <div class="bar-fail" style="width:${(suiteFailed / barTotal) * 100}%"></div>
      <div class="bar-skip" style="width:${(suiteSkipped / barTotal) * 100}%"></div>
    </div>
    <div class="test-cases">
      ${s.tests
        .map((t) => {
          const tStatus = t.status === 'passed' ? 'success' : t.status === 'failed' ? 'failure' : 'skipped';
          const tClass = t.status === 'passed' ? 'test-passed' : t.status === 'failed' ? 'test-failed' : 'test-skipped';
          return `<div class="test-case ${tClass}">
        ${statusIcon(tStatus)}
        <span>${escapeHtml(t.title)}</span>
        <span class="test-duration">${t.duration >= 0.01 ? t.duration.toFixed(2) + 's' : '<0.01s'}</span>
      </div>${t.status === 'failed' && t.failureMessages ? `\n      <pre class="failure-output test-failure-msg" style="max-height:200px">${escapeHtml(t.failureMessages)}</pre>` : ''}`;
        })
        .join('\n      ')}
    </div>
  </details>`;
    })
    .join('\n  ')}`,
    )
    .join('\n  ')}
</section>`
    : ''
}

<!-- 6. 실패 분석 -->
<section>
  <h2>${testResults.length > 0 ? '6' : '5'}. 실패 분석</h2>
  ${
    failedSteps.length === 0
      ? '<div class="no-failures">모든 CI/CD 단계가 성공적으로 통과했습니다.</div>'
      : `<div style="margin-bottom:16px;padding:12px 16px;background:#fff3cd;border-radius:8px;font-size:14px;color:#856404">
    ${failedSteps.length}개 단계에서 실패가 감지되었습니다: ${failedSteps.map((s) => `<strong>${escapeHtml(s.name)}</strong>`).join(', ')}
  </div>
  ${failureLogs
    .map(
      (log) => `<div class="failure-block">
    <h3>${escapeHtml(log.step)} 출력</h3>
    <pre class="failure-output">${escapeHtml(log.content.slice(-5000))}</pre>
  </div>`,
    )
    .join('\n  ')}`
  }
</section>

<div class="footer">
  Generated by SDPE CI/CD Report Generator
</div>

</div>
</body>
</html>`;
}

// ── Main ──

function main() {
  const resultsDir = process.env.CI_RESULTS_DIR || 'ci-results';

  const git = collectGitInfo();
  const impact = analyzeImpact(git.changedFiles);
  const ci = collectCIResults();
  const testResults = parseTestResults(resultsDir);
  const failureLogs = collectFailureLogs(resultsDir);

  const html = generateHtml(git, impact, ci, testResults, failureLogs);

  // reports/YYYY-MM-DD/ 구조로 저장 (한국 시간 기준)
  const now = toKST(new Date());
  const dateDir = kstDateStr(now);
  const outDir = join('reports', dateDir);
  mkdirSync(outDir, { recursive: true });

  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const filename = `report-${hh}h_${mm}m_${ss}s-${git.shortSha}.html`;
  const outPath = join(outDir, filename);
  writeFileSync(outPath, html, 'utf-8');

  // 최신 보고서 링크 (index.html)
  writeFileSync(join('reports', 'latest.html'), html, 'utf-8');

  console.log(`Report generated: ${outPath}`);
  console.log(`Latest report: reports/latest.html`);
}

main();
