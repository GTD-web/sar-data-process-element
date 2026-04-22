# SDPE (SAR Data Process Element)

SAR 데이터 처리 파이프라인을 구성하는 NestJS 모노레포 프로젝트.

## 프로젝트 구조

```
apps/
  pipeline-workflow-subsystem/   # 메인 앱 (nest-cli root), 파이프라인 워크플로우
  data-collecting-subsystem/     # 데이터 수집
  sar-processing-subsystem/      # SAR 처리
  post-processing-tool/          # 후처리 도구
  data-service-subsystem/        # 데이터 서비스
libs/
  sdpe-shared/    # 공유 모듈 (@sdpe/shared)
  sdpe-database/  # DB 모듈 (@sdpe/database) - TypeORM + PostgreSQL
algorithms/
  csc03_range_compression/       # Python SAR 알고리즘 (mypy + ruff)
frontend/                        # Next.js 프론트엔드 (별도 CLAUDE.md 참고)
```

## 주요 명령어

- `npm run build` — 빌드
- `npm run lint` — ESLint (TS, `--max-warnings 0`)
- `npm run lint:py` — Python 린트 (ruff + mypy)
- `npm test` — Jest 단위 테스트
- `npm run test:e2e` — E2E 테스트
- `npm run format` — Prettier 포맷팅
- `npm run migration:run` — TypeORM 마이그레이션 실행

## 코드 규칙

### TypeScript
- strict 모드 (`strict`, `noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`)
- ESLint: `@typescript-eslint/strict` + prettier, `no-explicit-any: error`, `no-console: warn`
- Prettier: 세미콜론, 싱글쿼트, trailing comma all, printWidth 120
- 라이브러리 import 경로: `@sdpe/shared`, `@sdpe/database`

### Python
- ruff (lint + format), mypy 타입 체크
- Python 3.11

### 네이밍 컨벤션
- 앱/파일명: kebab-case (`data-collecting-subsystem.controller.ts`)
- 클래스명: PascalCase, 파일명과 일치 (`DataCollectingSubsystemController`)
- 각 앱은 `{앱이름}.module.ts`, `{앱이름}.controller.ts`, `{앱이름}.service.ts` 패턴

## CI

GitHub Actions (`ci.yml`): Node 20 + Python 3.11
- TS: build → lint → test → test:e2e
- Python: ruff check → ruff format --check → mypy

## 작업 종료 규칙

- `frontend/` 아래 변경이 포함된 작업을 마치면, 최종 응답 전에 아래 명령으로 프론트엔드 Docker 이미지를 재빌드하고 컨테이너를 재배포한다. 사용자가 명시적으로 제외하라고 한 경우만 예외다.
- `docker rm -f sdpe-frontend 2>nul & docker build -t sdpe-frontend:latest "C:\Users\USER\dev\sar-data-process-element\frontend" && docker run -d --name sdpe-frontend -p 3010:3000 sdpe-frontend:latest`
