# GitLab CI/CD 설정 가이드

> 2026-04-09 작성. 192.168.10.11 내부망 GitLab 서버 기준.

---

## 목차

1. [개요](#1-개요)
2. [서버 환경](#2-서버-환경-1921681011)
3. [GitLab Runner 설정](#3-gitlab-runner-설정)
4. [GitLab Pages 설정](#4-gitlab-pages-설정)
5. [CI/CD 파이프라인 구조](#5-cicd-파이프라인-구조-gitlab-ciyml)
6. [GitHub Actions → GitLab CI 마이그레이션 차이점](#6-github-actions--gitlab-ci-마이그레이션-차이점)
7. [보고서 시스템](#7-보고서-시스템)
8. [내부망 환경 주의사항](#8-내부망-환경-주의사항)
9. [트러블슈팅 기록](#9-트러블슈팅-기록)
10. [유용한 명령어 모음](#10-유용한-명령어-모음)
11. [향후 작업](#11-향후-작업)

---

## 1. 개요

GitHub Actions CI/CD를 GitLab CI/CD로 마이그레이션하고, GitLab Pages로 HTML 보고서를 서빙하는 과정을 정리한 문서.

### 최종 구성

| 항목 | 내용 |
|------|------|
| GitLab 서버 | `http://192.168.10.11` (내부망) |
| GitLab Runner | `T21017`, Docker executor, 버전 18.10.0 |
| CI 파이프라인 | TypeScript (build, lint, test, e2e) + Python (ruff, mypy) |
| 보고서 | GitLab Pages (`http://192.168.10.11:8888/sdpe/sar-data-process-element/`) |
| E2E DB | `quay.io/tembo/pgmq-pg:latest` Docker service (pgmq 확장 내장) |

### Git Remote 구성

| Remote 이름 | URL | 용도 |
|-------------|-----|------|
| `origin` | `http://192.168.10.11/sdpe/sar-data-process-element.git` | 메인 (GitLab) |
| `github` | `https://github.com/GTD-web/sar-data-process-element.git` | 백업 (GitHub) |

> **HTTP 경고**: origin이 HTTP(비암호화)로 연결되어 있음. 내부망이므로 허용하지만,
> Git Credential Manager가 자격 증명을 저장하므로 매번 로그인할 필요는 없음.

### 커밋 이력 (마이그레이션 과정)

```
607a2102 ci: GitLab Pages 배포 트리거
7fb19595 fix(ci): pgmq-pg Docker service 추가로 E2E 테스트 지원
17c95c8e fix(ci): Docker executor로 전환
5531a8b3 fix(ci): PostgreSQL 포트를 5433으로 변경
d8192d0d fix(ci): shell executor 환경에 맞게 GitLab CI 수정
c65b7c26 ci: GitLab CI/CD 파이프라인 추가 (GitLab Pages 보고서)
```

---

## 2. 서버 환경 (192.168.10.11)

### 설치된 소프트웨어

| 소프트웨어 | 버전 | 비고 |
|-----------|------|------|
| Node.js | v22.22.2 | nodesource로 시스템 전역 설치 |
| NPM | 10.9.7 | |
| Python | 3.10.12 | 시스템 기본 (`python3`) |
| PostgreSQL | 18 (포트 5433) | 온라인 상태 |
| PostgreSQL | 14 (포트 5434) | **꺼진 상태 (사용 안 함)** |
| Docker | 28.5.2 | |
| GitLab Runner | 18.10.0 | Docker executor |

### Node.js 설치 경로 (중요)

서버에 Node.js가 **두 군데** 설치되어 있음:

| 경로 | 버전 | 사용자 |
|------|------|--------|
| `/home/t21017/.nvm/versions/node/v22.22.1/bin/node` | v22.22.1 | `t21017` 계정 (nvm) |
| `/usr/bin/node` (nodesource) | v22.22.2 | 시스템 전역 (gitlab-runner 포함) |

> **핵심**: Docker executor를 사용하므로 서버의 Node.js는 CI에 영향 없음.
> CI는 Docker 이미지(`node:22`) 내부의 Node.js를 사용.

### PostgreSQL 포트 구성

```
포트 5432 → GitLab 내장 PostgreSQL (GitLab 전용, 절대 사용 금지)
포트 5433 → PostgreSQL 18 (서버 직접 사용 시)
포트 5434 → PostgreSQL 14 (꺼진 상태)
```

> **주의**: CI에서는 Docker service로 `quay.io/tembo/pgmq-pg`를 사용하므로 서버의 PostgreSQL과 무관.
> Docker service의 PostgreSQL은 기본 포트 5432를 사용하며, `postgres`라는 호스트명으로 접근.

### DB 설정 (서버 PostgreSQL 18, 포트 5433)

서버에서 직접 테스트할 때만 필요:

```bash
# sdpe 유저/DB 생성 (이미 완료)
sudo -u postgres psql -p 5433 -c "CREATE USER sdpe WITH PASSWORD 'sdpe' SUPERUSER;"
sudo -u postgres psql -p 5433 -c "CREATE DATABASE sdpe OWNER sdpe;"
```

> **주의**: `sudo -u postgres psql` 실행 시 반드시 `-p 5433`을 지정.
> `-p` 없이 실행하면 GitLab 내장 PostgreSQL(5432)에 접속 시도하여 소켓 오류 발생.

### DB 초기화 스크립트 (`deploy/local/init/01-init.sql`)

```sql
CREATE SCHEMA IF NOT EXISTS sdpe;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgmq;
```

> **pgmq 확장**: 서버 PostgreSQL 18에는 pgmq가 설치되어 있지 않음.
> CI에서는 `quay.io/tembo/pgmq-pg` 이미지에 pgmq가 내장되어 있어 문제없음.
> 서버에서 직접 E2E 테스트 시에는 pgmq 설치가 필요함 (`sudo apt-get install postgresql-18-pgmq`).

---

## 3. GitLab Runner 설정

### 설정 파일: `/etc/gitlab-runner/config.toml`

```toml
concurrent = 1
check_interval = 0
connection_max_age = "15m0s"
shutdown_timeout = 0

[session_server]
  session_timeout = 1800

[[runners]]
  name = "T21017"
  url = "http://192.168.10.11/"
  id = 2
  token = "<runner-token>"
  executor = "docker"
  [runners.docker]
    image = "node:22"
    privileged = false
    disable_entrypoint_overwrite = false
    oom_kill_disable = false
    disable_cache = false
    volumes = ["/cache"]
    pull_policy = ["if-not-present"]
  [runners.cache]
    MaxUploadedArchiveSize = 0
```

### 주요 설정 포인트

| 설정 | 값 | 이유 |
|------|-----|------|
| `executor` | `docker` | shell executor에서 전환. root 권한, 격리 환경 제공 |
| `pull_policy` | `if-not-present` | 내부망에서 외부 레지스트리 Pull 속도가 느리므로 로컬 캐시 우선 |
| `network_mode` | **설정 안 함** (기본 bridge) | `host`로 설정하면 service 컨테이너가 동작하지 않음 |
| `volumes` | `["/cache"]` | npm, pip 캐시 등 빌드 캐시 저장소 |

### config.toml 수정 시 주의사항

- TOML 파일에서 **섹션 순서가 중요**. `[runners.docker]`는 반드시 `[runners.cache]` 앞에 위치해야 함
- `sudo tee`로 전체 파일을 덮어쓰는 것이 부분 추가보다 안전
- 수정 후 반드시 `sudo gitlab-runner restart` 실행

### Runner 태그

`.gitlab-ci.yml`에서 `tags: [shared, ubuntu, linux]`를 사용.
GitLab UI(Settings → CI/CD → Runners)에서 runner에 해당 태그가 등록되어 있어야 job이 매칭됨.

> **팁**: 새 버전 GitLab Runner(18.x)에서는 `--tag-list` CLI 옵션이 제한됨.
> 태그는 GitLab 웹 UI에서 runner를 편집하여 추가해야 함.

### Runner 관리 명령어

```bash
sudo gitlab-runner list                    # 등록된 runner 확인
sudo gitlab-runner restart                 # runner 재시작
sudo gitlab-runner verify                  # runner 연결 상태 확인
sudo cat /etc/gitlab-runner/config.toml    # runner 설정 확인
```

---

## 4. GitLab Pages 설정

### `/etc/gitlab/gitlab.rb` 변경사항

```ruby
# Pages 활성화 (기본: 비활성)
pages_external_url "http://192.168.10.11:8888"

# 경로 기반 URL (IP에서는 서브도메인 불가하므로 필수)
gitlab_pages["namespace_in_path"] = true
```

### 적용 방법

```bash
sudo gitlab-ctl reconfigure   # 설정 적용 (1~2분 다운타임 발생 가능)
sudo gitlab-ctl restart        # 서비스 재시작
```

> **경고**: `reconfigure` 중 GitLab 웹(`:80`)이 502 상태가 됨.
> puma 워커가 재시작되면 자동 복구되지만 1~3분 소요될 수 있음.
> 급하면 `sudo gitlab-ctl restart puma && sudo gitlab-ctl restart nginx` 실행.

### Pages URL 구조

```
http://192.168.10.11:8888/{그룹경로}/{프로젝트이름}/
```

현재: `http://192.168.10.11:8888/sdpe/sar-data-process-element/`

> **그룹 경로 변경 완료**: 그룹 경로가 `ground-segment` → `sdpe`로 변경됨 (2026-04-09).
> 변경 후 git remote URL 업데이트 필요: `git remote set-url origin http://192.168.10.11/sdpe/sar-data-process-element.git`

### Pages 포트 선택 시 주의

- 8080, 8090 등은 GitLab 내부 서비스와 충돌 가능
- `listen_proxy` 설정을 추가하면 nginx와 gitlab-pages가 같은 포트에서 충돌 → 전체 502
- **Pages 전용 포트(예: 8888)를 사용하고, `listen_proxy`는 건드리지 않는 것이 안전**

### Pages 배포 확인

```bash
# 서비스 상태
sudo gitlab-ctl status gitlab-pages

# 리슨 포트 확인 (0.0.0.0으로 리슨해야 외부 접근 가능)
sudo ss -tlnp | grep 8888

# Pages 배포 상태 (rails console)
sudo gitlab-rails console
> Project.find_by_full_path('sdpe/sar-data-process-element').pages_deployed?
> puts Project.find_by_full_path('sdpe/sar-data-process-element').pages_url
```

### Pages 파일 저장 위치

```bash
# Pages 파일은 해시 경로에 저장됨 (프로젝트 경로로 직접 찾을 수 없음)
sudo ls -la /var/opt/gitlab/gitlab-rails/shared/pages/@hashed/
```

---

## 5. CI/CD 파이프라인 구조 (`.gitlab-ci.yml`)

### 파이프라인 흐름

```
test stage (병렬 실행)              deploy stage
┌──────────────────────┐
│  typescript           │──┐
│  image: node:22       │  │      ┌──────────────┐      ┌───────────────┐
│  service: pgmq-pg     │  ├─────→│  pages        │─────→│  pages:deploy  │
│  (build,lint,test,e2e)│  │      │  image: node:22│      │  (GitLab 자동) │
└──────────────────────┘  │      └──────────────┘      └───────────────┘
┌──────────────────────┐  │
│  python               │──┘
│  image: python:3.11   │
│  (ruff, mypy)         │
└──────────────────────┘
```

### 글로벌 변수

```yaml
variables:
  POSTGRES_USER: sdpe
  POSTGRES_PASSWORD: sdpe
  POSTGRES_DB: sdpe
  DATABASE_URL: postgresql://sdpe:sdpe@postgres:5432/sdpe
```

> **`postgres` 호스트명**: Docker service에 `alias: postgres`를 설정했으므로,
> CI 컨테이너에서 `postgres`라는 호스트명으로 DB에 접근.
> GitHub Actions에서는 `localhost`였지만, GitLab Docker executor에서는 service alias를 사용해야 함.

### typescript job 상세

```yaml
typescript:
  stage: test
  image: node:22
  services:
    - name: quay.io/tembo/pgmq-pg:latest
      alias: postgres
      variables:            # service 컨테이너의 환경변수
        POSTGRES_USER: sdpe
        POSTGRES_PASSWORD: sdpe
        POSTGRES_DB: sdpe
```

**실행 순서:**
1. `apt-get install postgresql-client` — psql 설치 (DB 초기화용)
2. PostgreSQL ready 대기 (최대 30초, `pg_isready` 폴링)
3. `01-init.sql` 실행 — 스키마, uuid-ossp, pgmq 확장 생성
4. `npm ci` — 의존성 설치
5. Build → Lint → Unit Test → E2E Test (각 단계 결과를 파일로 저장)

**결과 저장 패턴:**
```bash
# 각 단계에서 성공/실패를 파일로 기록
BUILD_RESULT="success"
npm run build 2>&1 | tee ci-results/build-output.txt || BUILD_RESULT="failure"
echo "$BUILD_RESULT" > ci-results/build-result.txt
```

> GitLab CI는 GitHub Actions의 `${{ steps.X.outcome }}`처럼 step 결과를 자동 전달하지 않으므로,
> 파일 기반으로 결과를 기록하고 artifact로 넘기는 패턴을 사용.

**`allow_failure: true` 설정 이유:**
- 이 설정이 없으면 typescript job 실패 시 pages job이 스킵됨
- 실패하더라도 보고서를 생성하려면 `allow_failure: true` 필요

### python job 상세

- Docker service 불필요 (DB 미사용)
- `python -m pip install ruff mypy` — 매번 설치 (캐싱 미적용 상태)
- 서버의 Python(3.10)과 CI의 Python(3.11)이 다르지만, ruff/mypy에는 영향 없음

### pages job 상세

```yaml
pages:             # 이름이 반드시 "pages"여야 GitLab이 Pages로 인식
  stage: deploy
  needs:           # typescript, python의 artifact를 다운로드
    - job: typescript
      artifacts: true
    - job: python
      artifacts: true
  when: always     # 앞선 job이 실패해도 실행
  rules:
    - if: $CI_PIPELINE_SOURCE != "merge_request_event"  # MR 파이프라인 제외
```

> **`pages` job 이름 규칙**: GitLab은 `pages`라는 이름의 job이 `public/` artifact를 생성하면
> 자동으로 `pages:deploy` 단계를 추가하여 Pages에 배포.
> job 이름을 `report`나 다른 이름으로 바꾸면 Pages 배포가 되지 않음.

> **MR 제외 규칙**: `$CI_PIPELINE_SOURCE != "merge_request_event"` 조건으로
> Merge Request 파이프라인에서는 Pages 배포를 건너뜀 (MR마다 덮어쓰면 안 되므로).

### Artifact 보존 기간

| Artifact | 보존 기간 | 용도 |
|----------|----------|------|
| `ci-results/` (typescript) | 7일 | 테스트 결과 원본, pages job에 전달 |
| `ci-results/` (python) | 7일 | 린트 결과, pages job에 전달 |
| `public/` (pages) | 30일 | GitLab Pages HTML 보고서 |

---

## 6. GitHub Actions → GitLab CI 마이그레이션 차이점

| 항목 | GitHub Actions | GitLab CI |
|------|---------------|-----------|
| 설정 파일 | `.github/workflows/ci.yml` | `.gitlab-ci.yml` |
| 실행 환경 | GitHub-hosted runner (ubuntu-latest) | Self-hosted runner (Docker executor) |
| Step outcome | `${{ steps.X.outcome }}` 자동 제공 | 직접 파일로 저장 (`echo "success" > result.txt`) |
| Artifact 전달 | `upload-artifact` / `download-artifact` action | `artifacts` + `needs` 키워드 |
| DB Service | `services:` + 자동 health check + `localhost` 접근 | `services:` + 수동 `pg_isready` 대기 + alias 접근 (`postgres`) |
| DB 호스트 | `localhost` | `postgres` (service alias) |
| 보고서 | GitHub Pages / Artifact 다운로드 | GitLab Pages (`public/` 디렉토리) |
| 보고서 커밋 | 레포에 커밋 & 푸시 | **커밋 안 함** — artifact로만 존재 |
| 보고서 트리거 | `github.event_name != 'pull_request'` | `$CI_PIPELINE_SOURCE != "merge_request_event"` |
| 파이프라인 재실행 | Actions 탭 → Re-run | CI/CD → Pipelines → Run pipeline |
| Job 병렬 실행 | 별도 job으로 정의하면 자동 병렬 | 같은 stage 내 job은 자동 병렬 |

### 양쪽 CI 동시 운영

현재 `.github/workflows/ci.yml`과 `.gitlab-ci.yml`이 모두 존재:
- GitHub에 push → GitHub Actions 실행
- GitLab에 push → GitLab CI 실행

양쪽에 동시에 push하면 두 CI가 모두 실행됨.
보고서 커밋 로직은 GitLab 쪽에서 제거되었으므로 충돌 없음.

---

## 7. 보고서 시스템

### 보고서 생성 스크립트: `scripts/generate-ci-report.mjs`

**입력 (환경변수):**

| 환경변수 | 값 | 설명 |
|---------|-----|------|
| `CI_RESULTS_DIR` | `ci-results` | 테스트 결과 디렉토리 |
| `STEP_BUILD` | `success` / `failure` / `skipped` | Build 결과 |
| `STEP_LINT` | `success` / `failure` / `skipped` | Lint 결과 |
| `STEP_TEST` | `success` / `failure` / `skipped` | Unit Test 결과 |
| `STEP_E2E` | `success` / `failure` / `skipped` | E2E Test 결과 |
| `STEP_RUFF_CHECK` | `success` / `failure` / `skipped` | Python ruff check 결과 |
| `STEP_RUFF_FORMAT` | `success` / `failure` / `skipped` | Python ruff format 결과 |
| `STEP_MYPY` | `success` / `failure` / `skipped` | Python mypy 결과 |

**출력:**
- `reports/YYYY-MM-DD/report-HHh_MMm_SSs-{shortSha}.html` (한국 시간 기준)

**참조 파일 (ci-results 디렉토리):**
- `build-output.txt`, `lint-output.txt` — 빌드/린트 로그
- `test-unit.json`, `test-e2e.json` — Jest JSON 결과 (테스트 케이스 상세)
- `test-output.txt`, `test-e2e-output.txt` — Jest 콘솔 출력
- `python-output.txt` — ruff/mypy 콘솔 출력
- `*-result.txt` — 각 단계 성공/실패 상태

> **GitHub 전용 코드**: 스크립트에 `GITHUB_OUTPUT` 환경변수 체크 로직이 있음.
> GitLab CI에서는 이 환경변수가 없으므로 무시됨 (호환성 유지).

### index.html 자동 생성

pages job에서 `public/index.html`을 생성하여 보고서 목록 페이지를 제공:
- 다크 테마 UI
- 날짜/파일명 기준 역순 정렬
- `public/YYYY-MM-DD/report-*.html` 파일을 자동 스캔하여 링크 생성

> **한계**: 현재 GitLab Pages는 마지막 파이프라인의 `public/` artifact만 서빙.
> 이전 파이프라인의 보고서는 덮어써짐. 과거 보고서를 누적하려면 별도 스토리지 필요.

---

## 8. 내부망 환경 주의사항

### Docker 이미지 관리

내부망에서 외부 레지스트리(docker.io, quay.io) 접근이 느리거나 불안정할 수 있음.

**사전 Pull 필수:**
```bash
# 서버에서 미리 실행 (CI에서 사용하는 모든 이미지)
docker pull node:22
docker pull python:3.11
docker pull quay.io/tembo/pgmq-pg:latest
```

**이미지 업데이트 시:**
```bash
# pull_policy가 if-not-present이므로 새 버전을 받으려면 명시적 pull 필요
docker pull node:22
# 또는 특정 버전 고정: node:22.22.2
```

> **`pull_policy: if-not-present`의 함정**: 이미지 태그가 `latest`이면
> 새 버전이 나와도 로컬 캐시를 계속 사용함.
> 보안 패치 등으로 이미지 업데이트가 필요하면 서버에서 수동으로 `docker pull` 실행.

### Git 인증

```bash
# 현재 저장된 자격 증명 확인
git credential-manager get <<EOF
protocol=http
host=192.168.10.11
EOF
```

- Git Credential Manager가 자격 증명을 저장하여 매번 로그인 불필요
- HTTP 사용 시 "unencrypted HTTP" 경고 발생 → 내부망이므로 무시 가능

### gitlab-ctl reconfigure 위험성

`sudo gitlab-ctl reconfigure`는 모든 GitLab 서비스 설정을 재적용:
- **1~3분간 502 발생 가능** (puma 재시작)
- nginx 설정이 재생성되므로 수동 nginx 수정은 덮어써짐
- 잘못된 설정 시 GitLab 전체가 다운될 수 있음

**안전한 작업 순서:**
1. 현재 설정 백업: `sudo cp /etc/gitlab/gitlab.rb /etc/gitlab/gitlab.rb.bak`
2. 설정 변경
3. `sudo gitlab-ctl reconfigure`
4. 문제 시 복원: `sudo cp /etc/gitlab/gitlab.rb.bak /etc/gitlab/gitlab.rb && sudo gitlab-ctl reconfigure`

---

## 9. 트러블슈팅 기록

### 9.1 Shell Executor에서 Node v12 사용 문제

**증상**: CI에서 `node --version`이 v12.22.9로 나옴. 서버에서 직접 확인하면 v22.

**원인**: `gitlab-runner` 유저의 PATH에는 시스템 Node(v12)만 포함. 사용자 계정(`t21017`)의 nvm Node(v22)와 다름.

**진단 방법:**
```bash
sudo -u gitlab-runner bash -c 'echo $PATH && which node && node --version'
```

**해결**: `nodesource`로 시스템 전역 Node 22 설치.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get remove -y libnode-dev   # 기존 libnode-dev 패키지와 충돌 해결
sudo apt-get install -y nodejs
```

> **교훈**: shell executor는 `gitlab-runner` 유저 환경에서 실행됨.
> nvm으로 설치한 Node는 해당 유저에게만 보이므로, 시스템 전역 설치가 필요.
> Docker executor를 쓰면 이 문제 자체가 발생하지 않음.

### 9.2 Shell Executor 권한 문제

**증상**: `apt-get` 실행 시 "허가 거부". `psql` 시 PostgreSQL 접속 불가.

**원인**: shell executor는 `gitlab-runner` 유저로 실행되므로 root 권한 없음.

**해결**: Docker executor로 전환. Docker 컨테이너 내에서는 root 권한 사용 가능.

### 9.3 Docker Executor에서 Service 컨테이너 미작동

**증상**: `network_mode: host` 설정 시 service 컨테이너(`postgres`)에 접근 불가.

**원인**: host 네트워크 모드에서는 Docker service 컨테이너가 별도 네트워크에서 실행되어,
메인 컨테이너에서 `postgres` 호스트명으로 접근할 수 없음.

**해결**: `config.toml`에서 `network_mode` 설정을 제거 (기본 bridge 네트워크 사용).
Service 컨테이너에 `alias`로 접근.

> **핵심 규칙**: GitLab CI에서 `services:`를 사용하려면 `network_mode: host`를 쓰면 안 됨.

### 9.4 pgmq 확장 미설치

**증상**: `CREATE EXTENSION pgmq` 실패 — "확장 모듈을 사용할 수 없습니다"

**원인**: 서버의 PostgreSQL 18에 pgmq 확장이 설치되어 있지 않음.
GitHub CI에서는 `quay.io/tembo/pgmq-pg` Docker 이미지에 pgmq가 내장.

**해결**: CI에서 `quay.io/tembo/pgmq-pg:latest`를 Docker service로 사용.

```yaml
services:
  - name: quay.io/tembo/pgmq-pg:latest
    alias: postgres
```

### 9.5 Docker 이미지 Pull 지연

**증상**: `quay.io/tembo/pgmq-pg:latest` Pull에 10분 이상 소요 (파이프라인 멈춤 상태).

**원인**: 내부망에서 외부 레지스트리 접근이 느림.

**해결**:
1. 서버에서 미리 `docker pull quay.io/tembo/pgmq-pg:latest` 실행
2. Runner config에 `pull_policy = ["if-not-present"]` 설정

### 9.6 nginx 포트 충돌 (8090) → GitLab 전체 502

**증상**: `bind() to 0.0.0.0:8090 failed (98: Address already in use)` → GitLab 웹 전체 502.

**원인**: `gitlab_pages["listen_proxy"] = "0.0.0.0:8090"` 설정으로 nginx와 gitlab-pages가
동일한 8090 포트에서 리슨 시도하여 충돌.

**해결**: Pages 포트를 8888로 변경, `listen_proxy` 설정 삭제.

```bash
sudo sed -i '/gitlab_pages\["listen_proxy"\]/d' /etc/gitlab/gitlab.rb
```

> **교훈**: `gitlab.rb`에서 `listen_proxy` 설정은 건드리지 않는 것이 안전.
> `pages_external_url`만 설정하면 GitLab이 자동으로 nginx/pages 리스너를 구성.

### 9.7 GitLab Pages 502 / 404

**증상**: Pages URL 접속 시 502, 이후 404.

**원인 (502)**: `gitlab-pages`가 `127.0.0.1`에서만 리슨하여 외부 접근 불가.

**원인 (404)**: IP 기반 GitLab에서 서브도메인 방식 URL 생성 (`ground-segment.192.168.10.11`).
IP 주소에는 서브도메인을 사용할 수 없으므로 접근 불가.

**해결**:
```ruby
# /etc/gitlab/gitlab.rb
gitlab_pages["namespace_in_path"] = true  # 경로 기반 URL 사용
```

> **핵심**: IP 기반 GitLab에서 Pages를 사용하려면 `namespace_in_path = true` 필수.
> 도메인이 있는 환경에서는 서브도메인 방식(`group.domain.com/project`)이 기본.

### 9.8 gitlab.rb 편집 시 heredoc/sed 주의사항

**증상**: `sudo tee -a ... << 'EOF'`에서 EOF 앞에 공백이 있으면 heredoc이 닫히지 않음.
`sed` 명령에서 줄바꿈이 포함되면 명령이 잘림.

**팁**:
- `tee`로 파일 전체를 덮어쓸 때: `sudo tee /path/to/file > /dev/null << 'EOF'`
- heredoc의 종료 태그(`EOF`)는 **줄 맨 앞에, 공백 없이** 위치해야 함
- `sed`로 한 줄 변경할 때: 작은따옴표 사용 (`'s|old|new|'`), 줄바꿈 금지
- 복잡한 편집은 `sudo nano /etc/gitlab/gitlab.rb`가 더 안전

### 9.9 GitLab Artifact HTML 렌더링 불가

**증상**: Job artifact에서 HTML 파일 클릭 시 "The source could not be displayed because it is stored as a job artifact. You can download it instead." 메시지.

**원인**: GitLab 기본 설정에서 artifact HTML의 인라인 렌더링이 비활성화되어 있음.

**해결**: GitLab Pages를 통해 HTML을 서빙하는 방식으로 우회.
(Admin 설정에서 artifact 렌더링을 활성화할 수도 있지만, Pages가 더 나은 방법)

---

## 10. 유용한 명령어 모음

### GitLab 관리

```bash
sudo gitlab-ctl status                   # 전체 서비스 상태
sudo gitlab-ctl reconfigure              # 설정 적용 (다운타임 주의!)
sudo gitlab-ctl restart                  # 전체 재시작
sudo gitlab-ctl restart puma             # 웹서버만 재시작 (502 복구)
sudo gitlab-ctl restart nginx            # nginx만 재시작
sudo gitlab-ctl restart gitlab-pages     # Pages만 재시작
sudo gitlab-ctl tail <서비스명>           # 로그 실시간 확인
sudo gitlab-ctl tail nginx               # nginx 로그 (에러 확인)
sudo gitlab-ctl tail gitlab-pages        # Pages 로그 (502/404 디버깅)
sudo gitlab-rails console               # Rails 콘솔 (디버깅용)

# 설정 파일
sudo cat /etc/gitlab/gitlab.rb           # GitLab 메인 설정
sudo cp /etc/gitlab/gitlab.rb /etc/gitlab/gitlab.rb.bak  # 백업
```

### GitLab Runner

```bash
sudo gitlab-runner list                    # 등록된 runner
sudo gitlab-runner restart                 # runner 재시작
sudo gitlab-runner verify                  # 연결 상태 확인
sudo cat /etc/gitlab-runner/config.toml    # runner 설정
```

### Docker

```bash
docker pull <이미지>                       # 이미지 다운로드 (내부망: 사전 Pull 필수)
docker images                              # 로컬 이미지 목록
docker system prune -f                     # 미사용 이미지/컨테이너 정리
docker image prune -a                      # 모든 미사용 이미지 삭제 (디스크 부족 시)
```

### PostgreSQL

```bash
pg_lsclusters                              # 클러스터 목록 (포트, 상태 확인)
sudo -u postgres psql -p 5433             # PostgreSQL 18 접속
pg_isready -h localhost -p 5433           # 접속 가능 확인
```

### 네트워크 디버깅

```bash
sudo ss -tlnp | grep <포트>               # 포트 리슨 상태 확인
sudo ss -tlnp | grep -E '80|8888'         # GitLab + Pages 포트 확인
sudo ufw status                            # 방화벽 상태 (현재 비활성)
```

### Git Remote

```bash
git remote -v                              # remote 목록
git push origin <branch>                   # GitLab에 push
git push github <branch>                   # GitHub에 push
```

---

## 11. 향후 작업

- [x] ~~`ground-segment` 그룹 경로를 `sdpe`로 변경~~ (2026-04-09 완료)
- [ ] Docker 이미지 캐싱 최적화 (`npm ci` 캐싱, pip 캐싱)
- [ ] GitHub CI와 GitLab CI 동시 운영 여부 결정
- [ ] Pages에 과거 보고서 누적 표시 (현재는 마지막 파이프라인 보고서만 표시)
- [ ] CI 이미지 버전 고정 검토 (`node:22` → `node:22.22.2` 등 pinning)
- [ ] GitLab Container Registry 활용하여 내부 이미지 레지스트리 구성 (외부 Pull 의존도 제거)
- [ ] `gitlab.rb` 설정 백업 자동화
- [ ] Runner 동시 실행 수(`concurrent`) 증가 검토 (현재 1)
