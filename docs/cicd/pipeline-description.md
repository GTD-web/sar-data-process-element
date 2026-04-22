# CI/CD 파이프라인 설명서

> SDPE 프로젝트의 CI/CD 파이프라인 구성 및 각 단계별 동작을 설명하는 문서.

---

## 1. 파이프라인 개요

코드가 GitLab에 push되면 자동으로 파이프라인이 실행되어, 코드 품질 검증 후 HTML 보고서를 생성하여 GitLab Pages에 배포한다.

| 항목 | 내용 |
|------|------|
| 설정 파일 | `.gitlab-ci.yml` (GitLab) / `.github/workflows/ci.yml` (GitHub) |
| 실행 환경 | Docker executor (GitLab Runner on 192.168.10.11) |
| 트리거 | `git push` 시 자동 실행 |
| 보고서 | `http://192.168.10.11:8888/sdpe/sar-data-process-element/` |

---

## 2. 스테이지 구성

파이프라인은 2개의 스테이지로 구성되며, 순차적으로 실행된다.

```
┌─────────────────────────────────┐     ┌──────────────────────┐
│         test (병렬 실행)          │ ──→ │    deploy (순차)      │
│  typescript | python             │     │  pages → pages:deploy │
└─────────────────────────────────┘     └──────────────────────┘
```

### test 스테이지

TypeScript와 Python job이 **병렬로 동시 실행**된다. 두 job 모두 `allow_failure: true`로 설정되어 있어, 하나가 실패해도 다른 job과 이후 deploy 스테이지에 영향을 주지 않는다.

### deploy 스테이지

test 스테이지의 결과(artifact)를 수집하여 HTML 보고서를 생성하고, GitLab Pages에 배포한다.

---

## 3. 글로벌 변수

```yaml
variables:
  POSTGRES_USER: sdpe
  POSTGRES_PASSWORD: sdpe
  POSTGRES_DB: sdpe
  DATABASE_URL: postgresql://sdpe:sdpe@postgres:5432/sdpe
```

- `POSTGRES_*`: pgmq-pg Docker service 컨테이너의 초기화에 사용
- `DATABASE_URL`: E2E 테스트에서 TypeORM이 DB에 접속할 때 사용
- `postgres` 호스트명은 Docker service의 alias

---

## 4. Job 상세

### 4.1 typescript

TypeScript/NestJS 코드의 빌드, 린트, 테스트, E2E 테스트를 수행한다.

| 항목 | 값 |
|------|-----|
| Docker 이미지 | `node:22` |
| DB Service | `quay.io/tembo/pgmq-pg:latest` (alias: `postgres`) |
| 태그 | `shared`, `ubuntu`, `linux` |
| Artifact | `ci-results/` (7일 보존) |
| 실패 허용 | `allow_failure: true` |

#### before_script (사전 준비)

1. **postgresql-client 설치** — `apt-get install -y postgresql-client`
2. **DB 준비 대기** — `pg_isready`로 최대 30초간 PostgreSQL이 준비될 때까지 폴링
3. **DB 초기화** — `deploy/local/init/01-init.sql` 실행
   - `sdpe` 스키마 생성
   - `uuid-ossp` 확장 설치
   - `pgmq` 확장 설치 (메시지 큐)
4. **의존성 설치** — `npm ci`

#### script (테스트 단계)

각 단계는 독립적으로 실행되며, 실패해도 다음 단계가 계속 진행된다. 각 단계의 결과(`success` 또는 `failure`)는 텍스트 파일로 기록된다.

**1) 빌드 (Build)**
```bash
npm run build  # nest build (webpack)
```
- 결과: `ci-results/build-result.txt`, `ci-results/build-output.txt`

**2) 린트 (Lint)**
```bash
npm run lint  # eslint --max-warnings 0
```
- `--max-warnings 0`: 경고도 실패로 처리
- 결과: `ci-results/lint-result.txt`, `ci-results/lint-output.txt`

**3) 단위 테스트 (Unit Test)**
```bash
npx jest --coverage --coverageReporters=json-summary --json --outputFile=ci-results/test-unit.json
```
- `--coverage`: 테스트 커버리지 수집
- `--coverageReporters=json-summary`: 커버리지 요약 JSON 생성
- `--json --outputFile`: 테스트 결과를 JSON으로 저장 (보고서에서 테스트 케이스별 상세 표시에 사용)
- 결과: `ci-results/test-result.txt`, `ci-results/test-unit.json`, `ci-results/coverage-summary.json`

**4) E2E 테스트**
```bash
npx jest --config ./apps/pipeline-workflow-subsystem/test/jest-e2e.json --json --outputFile=ci-results/test-e2e.json
```
- pgmq 기반 메시지 큐 동작을 실제 DB와 연동하여 검증
- 결과: `ci-results/e2e-result.txt`, `ci-results/test-e2e.json`

**5) 최종 결과 확인**
```bash
if grep -q "failure" ci-results/*-result.txt; then exit 1; fi
```
- 하나라도 실패한 단계가 있으면 job을 실패로 표시
- `allow_failure: true`이므로 파이프라인 자체는 계속 진행

---

### 4.2 python

Python 알고리즘 코드(`algorithms/`)의 린트, 포맷, 타입 체크를 수행한다.

| 항목 | 값 |
|------|-----|
| Docker 이미지 | `python:3.11` |
| DB Service | 없음 |
| 태그 | `shared`, `ubuntu`, `linux` |
| Artifact | `ci-results/` (7일 보존) |
| 실패 허용 | `allow_failure: true` |

#### before_script

1. `pip install ruff mypy` — 린터/타입체커 설치

#### script

**1) ruff check** — Python 코드 린트
```bash
python -m ruff check algorithms
```

**2) ruff format** — 코드 포맷 준수 여부 확인
```bash
python -m ruff format algorithms --check
```
- `--check`: 실제 수정하지 않고 위반 여부만 확인

**3) mypy** — 정적 타입 체크
```bash
python -m mypy algorithms/csc03_range_compression
```

결과: `ci-results/ruff-check-result.txt`, `ci-results/ruff-format-result.txt`, `ci-results/mypy-result.txt`, `ci-results/python-output.txt`

---

### 4.3 pages

테스트 결과를 수집하여 HTML 보고서를 생성하고, GitLab Pages에 배포한다.

| 항목 | 값 |
|------|-----|
| Docker 이미지 | `node:22` |
| 의존 job | `typescript`, `python` (artifact 다운로드) |
| 실행 조건 | Merge Request 파이프라인 제외 |
| 실행 시점 | `when: always` (앞선 job 실패와 무관하게 항상 실행) |
| Artifact | `public/` (30일 보존) |

#### 실행 순서

**1) 결과 수집** — 각 job의 artifact에서 결과 파일을 읽어 환경변수로 설정
```bash
export STEP_BUILD=$(cat ci-results/build-result.txt 2>/dev/null || echo "skipped")
export STEP_LINT=$(cat ci-results/lint-result.txt 2>/dev/null || echo "skipped")
# ... 등
```

**2) HTML 보고서 생성**
```bash
node scripts/generate-ci-report.mjs
```
- 환경변수와 `ci-results/` 디렉토리의 JSON 파일을 읽어 HTML 생성
- 출력: `reports/YYYY-MM-DD/report-HHh_MMm_SSs-{commitSha}.html`

**3) GitLab Pages 준비**
```bash
mkdir -p public
cp -r reports/* public/
```
- `public/index.html` 자동 생성 (보고서 목록 페이지)
- 날짜/파일명 역순으로 보고서 링크를 삽입

**4) pages:deploy** (GitLab 자동 실행)
- `pages`라는 이름의 job이 `public/` artifact를 생성하면, GitLab이 자동으로 Pages에 배포

---

## 5. Artifact 흐름

```
typescript job                    python job
  ci-results/                       ci-results/
  ├── build-result.txt              ├── ruff-check-result.txt
  ├── build-output.txt              ├── ruff-format-result.txt
  ├── lint-result.txt               ├── mypy-result.txt
  ├── lint-output.txt               └── python-output.txt
  ├── test-result.txt
  ├── test-output.txt
  ├── test-unit.json           ──→  pages job
  ├── test-e2e.json                   ├── 결과 수집 (환경변수)
  ├── e2e-result.txt                  ├── generate-ci-report.mjs
  ├── test-e2e-output.txt             ├── reports/YYYY-MM-DD/report-*.html
  └── coverage-summary.json           └── public/ (GitLab Pages 배포)
```

---

## 6. HTML 보고서 구성

`scripts/generate-ci-report.mjs`가 생성하는 HTML 보고서에는 다음 섹션이 포함된다.

| 섹션 | 내용 | 데이터 소스 |
|------|------|------------|
| 커밋 정보 | 해시, 브랜치, 작성자, 커밋 메시지 | `git log`, `git show` |
| 변경 사항 | 변경 파일 목록, diff, +/- 통계 | `git diff`, `git diff-tree` |
| 영향 분석 | 변경된 모듈별 영향도 | 파일 경로 기반 분석 |
| CI/CD 파이프라인 | 각 단계의 성공/실패 상태 | `*-result.txt` |
| 테스트 결과 | 테스트 suite/case별 상세 (pass/fail/skip) | `test-unit.json`, `test-e2e.json` |
| 테스트 커버리지 | Statements, Branches, Functions, Lines | `coverage-summary.json` |
| 실패 분석 | 실패한 단계의 로그, 에러 위치, Expected/Received | `*-output.txt`, Jest JSON |

### 커버리지 색상 기준

| 범위 | 색상 | 의미 |
|------|------|------|
| 80% 이상 | 초록 | 양호 |
| 50% ~ 79% | 노랑 | 주의 |
| 50% 미만 | 빨강 | 미달 |

---

## 7. 실행 조건 및 규칙

| 조건 | 동작 |
|------|------|
| `git push` (모든 브랜치) | 파이프라인 전체 실행 |
| Merge Request 생성/업데이트 | test 스테이지만 실행 (pages 배포 제외) |
| 수동 실행 (Run pipeline) | 파이프라인 전체 실행 |

### pages job이 MR에서 제외되는 이유

```yaml
rules:
  - if: $CI_PIPELINE_SOURCE != "merge_request_event"
```

MR 파이프라인마다 Pages를 덮어쓰면 메인 브랜치의 보고서가 사라지므로, MR에서는 보고서 배포를 건너뛴다.

---

## 8. Docker Service 구성

### pgmq-pg (E2E 테스트용)

```yaml
services:
  - name: quay.io/tembo/pgmq-pg:latest
    alias: postgres
    variables:
      POSTGRES_USER: sdpe
      POSTGRES_PASSWORD: sdpe
      POSTGRES_DB: sdpe
```

- **이미지**: PostgreSQL + pgmq 확장이 내장된 Tembo 이미지
- **alias**: `postgres` — CI 컨테이너에서 이 호스트명으로 DB에 접근
- **포트**: 5432 (Docker 내부 네트워크, 호스트 포트와 무관)
- **초기화**: 컨테이너 시작 시 `POSTGRES_USER`, `POSTGRES_DB`로 자동 생성

### 사전 Pull 필요

내부망 환경에서 외부 이미지 Pull이 느릴 수 있으므로, 서버에서 미리 Pull 해두는 것을 권장한다.

```bash
docker pull node:22
docker pull python:3.11
docker pull quay.io/tembo/pgmq-pg:latest
```

Runner config의 `pull_policy = ["if-not-present"]` 설정으로 로컬에 이미지가 있으면 Pull을 건너뛴다.

---

## 9. 결과 파일 형식

### *-result.txt

단일 줄로 `success` 또는 `failure`가 기록된다.

```
success
```

### test-unit.json / test-e2e.json

Jest의 `--json` 옵션이 생성하는 JSON. 보고서에서 테스트 케이스별 상세를 표시하는 데 사용된다.

```json
{
  "numPassedTests": 88,
  "numFailedTests": 0,
  "numTotalTests": 88,
  "testResults": [
    {
      "name": "libs/.../dag-builder.service.spec.ts",
      "status": "passed",
      "assertionResults": [
        { "title": "선형 의존성 그래프를 올바르게 생성한다", "status": "passed" }
      ]
    }
  ]
}
```

### coverage-summary.json

Jest `--coverage --coverageReporters=json-summary`가 생성하는 커버리지 요약.

```json
{
  "total": {
    "statements": { "total": 525, "covered": 412, "pct": 78.5 },
    "branches":   { "total": 122, "covered": 76,  "pct": 62.3 },
    "functions":  { "total": 115, "covered": 98,  "pct": 85.2 },
    "lines":      { "total": 503, "covered": 398, "pct": 79.1 }
  }
}
```

---

## 10. GitHub Actions와의 차이

현재 `.github/workflows/ci.yml`도 유지되고 있으며, GitHub에 push 시 GitHub Actions가 실행된다. 주요 차이점은 다음과 같다.

| 항목 | GitLab CI | GitHub Actions |
|------|-----------|----------------|
| DB 접속 호스트 | `postgres` (service alias) | `localhost` (포트 매핑) |
| Step 결과 전달 | 파일 기반 (`*-result.txt`) | `${{ steps.X.outcome }}` 자동 제공 |
| 보고서 배포 | GitLab Pages (artifact) | 레포에 커밋 & push |
| DB Health check | `pg_isready` 수동 폴링 | `options: --health-cmd` 자동 |
| Runner | Self-hosted (Docker executor) | GitHub-hosted (ubuntu-latest) |
