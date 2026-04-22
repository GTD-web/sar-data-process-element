# SDPE 문서 인덱스

본 폴더는 SDPE(SAR Data Processing Element) 프로젝트의 설계·운영·기획 문서를 모은다. 각 문서는 주제별 하위 폴더에 정리되어 있다.

## 구조

```
docs/
├── README.md                  # (본 문서) 인덱스
├── SDPE-PROJECT-PURPOSE.md    # 프로젝트 전체 목적·범위 개요
├── specifications/            # 공식 설계 문서 (원본 docx)
├── usecases/                  # 유즈케이스 및 화면 매핑
├── screens/                   # 화면 기획서 및 설계 근거
├── design-system/             # 프론트엔드 디자인 시스템 핸드오프
└── cicd/                      # CI/CD 파이프라인 관련 문서
```

## 카테고리별 문서

### 📘 최상위 개요
- [SDPE-PROJECT-PURPOSE.md](./SDPE-PROJECT-PURPOSE.md) — SDPE가 해결하는 문제와 설계 원칙 개요

### 📐 공식 설계 문서 (`specifications/`)
프로젝트 공식 설계 산출물. 원본 Word 문서이며 개정 시 버전 번호를 올린다.

- [SDPE-SAD-001_v1.0.docx](./specifications/SDPE-SAD-001_v1.0.docx) — 시스템 아키텍처 설계서 (서브시스템 구조, CSC 정의)
- [SDPE-ICD-001_v1.0.docx](./specifications/SDPE-ICD-001_v1.0.docx) — 인터페이스 제어 문서 (EI/SI 상세 명세)
- 관련: 루트의 [ICD-CHANGELOG.md](../ICD-CHANGELOG.md)

### 🧩 유즈케이스 (`usecases/`)
운영자 콘솔의 기능 범위를 사용자 관점에서 정의하고, 실제 구현과의 매핑을 관리한다.

- [USECASE.md](./usecases/USECASE.md) — 유즈케이스 정의서 (UC01~UC52, 실무용 상세판)
- [USECASE-REPORT.md](./usecases/USECASE-REPORT.md) — 유즈케이스 보고서 (대외 제출 포맷)
- [USECASE-UI-MAPPING.md](./usecases/USECASE-UI-MAPPING.md) — 유즈케이스 ↔ 화면/컴포넌트 매핑 및 커버리지 분석

### 🖼️ 화면 기획서 (`screens/`)
개별 화면·UX 구성의 상세 기획 및 설계 근거.

- [SCREEN-AUTH-USERS.md](./screens/SCREEN-AUTH-USERS.md) — 인증·사용자 관리 화면 기획서 (UC40, UC43~UC50)
- [DAG-RATIONALE.md](./screens/DAG-RATIONALE.md) — 파이프라인에 DAG가 필요한 이유 (설계 근거)

### 🎨 디자인 시스템 (`design-system/`)
프론트엔드 테마·토큰·스타일 핸드오프.

- [README.md](./design-system/README.md) — 디자인 시스템 사용 가이드
- `globals.css`, `tailwind.config.js`, `theme.ts`, `utils.ts` — 핵심 스타일 자산
- `StatusBadge.example.tsx`, `_document.example.tsx` — 예시 구현
- `design-system-handoff.zip` — 배포용 아카이브

### 🔧 CI/CD (`cicd/`)
파이프라인·빌드·배포 관련 문서.

- [pipeline-description.md](./cicd/pipeline-description.md) — CI/CD 파이프라인 동작 설명
- [workflow-diagram.html](./cicd/workflow-diagram.html) — CI 워크플로우 다이어그램 (+ 테스트 케이스 목록)
- [gitlab-setup-guide.md](./cicd/gitlab-setup-guide.md) — GitLab CI/CD 세팅 가이드
- [test-failure-email-preview.html](./cicd/test-failure-email-preview.html) — 실패 알림 이메일 미리보기

---

## 문서 추가 규칙

새 문서를 추가할 때는 아래 기준에 따라 적절한 폴더에 배치하고 본 인덱스를 갱신한다.

| 문서 성격 | 폴더 | 네이밍 예시 |
| -------- | ---- | ---------- |
| 공식 설계 산출물 (SAD, ICD, SRS 등) | `specifications/` | `SDPE-XXX-001_v1.0.docx` |
| 유즈케이스 정의·리포트·매핑 | `usecases/` | `USECASE-*.md` |
| 개별 화면 기획서·UX 근거 | `screens/` | `SCREEN-<영역>.md` |
| 디자인 시스템 자산 | `design-system/` | 파일명 자유 |
| CI/CD·빌드·릴리스 | `cicd/` | 자유 |
| 프로젝트 전체 개요 | `docs/` 루트 | 눈에 띄는 상위 문서만 |

폴더 배치가 애매한 문서는 `docs/` 루트보다는 가장 가까운 카테고리 폴더를 우선한다.
