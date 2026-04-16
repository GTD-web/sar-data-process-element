# UI 스펙 — 실행 작업(Job) 관리

> [USECASE.md](./USECASE.md)의 **UC21–UC26**을 담당합니다.

## 라우트

`/plan/jobs` · `/current/jobs`

## 목적

파이프라인의 1회 실행 인스턴스인 **Job**을 목록·상세·재처리·취소 관점에서 통합 관리한다.
기존에는 파이프라인 콘솔(`/console`) 사이드바에 얹혀 있어 DAG 뷰와 시각적으로 겹치던 것을,
별도 페이지로 분리하여 어느 위치에서든 일관된 방식으로 접근할 수 있도록 한다.

---

## 페이지 레이아웃

### 1. 헤더

| 요소 | 설명 |
| --- | --- |
| 페이지 타이틀 | "실행 작업" |
| 총 건수 | 현재 필터 기준 Job 총 개수 |

### 2. 필터 영역

| 요소 | 타입 | 설명 |
| --- | --- | --- |
| 검색 | 텍스트 | Job ID / Scene ID 부분 일치 검색 |
| 상태 필터 | 드롭다운 | CREATED / ASSIGNED / COMPLETED / FAILED / CANCELED |
| 기간 필터 | 날짜 범위 | `from` / `to` (시작 시각 기준) |

### 3. Job 목록 테이블 (UC21)

| 컬럼 | 설명 |
| --- | --- |
| Job ID | 고유 식별자 — 행 클릭 시 우측 상세 패널 오픈 |
| Scene ID | 원본 씬 식별자 |
| 파이프라인 | 링크 — 콘솔로 이동하여 해당 DAG 열기 (`/console?pipelineId=...`) |
| 현재 레벨 | 현재 처리 중·완료된 ProductLevel (L0~L3) |
| 상태 | JobStatusBadge — 재시도 중일 때 `재시도 N/3` 표시 |
| 재시도 | `retryCount / MAX_RETRY_COUNT(3)` |
| 시작 | 최초 시작 시각(KST) |
| 업데이트 | 마지막 상태 변경 시각(상대 시간) |

- 기본 정렬: `updatedAt` 내림차순
- 페이지 크기: 100건 (커서 기반, 추후 서버 측 페이지네이션 확장)
- 빈 상태: "조건에 맞는 실행 작업이 없습니다"

### 4. Job 상세 패널 (UC22)

**트리거**: Job 행 클릭 → 우측 Slide-over 패널

기존 `JobDetailPanel` 컴포넌트를 재사용한다 (콘솔 페이지와 동일한 뷰):

| 섹션 | 설명 |
| --- | --- |
| 헤더 | Job ID, Scene ID, JobStatusBadge |
| 액션 바 | 상태별 조건부 버튼 (재처리/부분 재처리/취소) |
| SLA 게이지 | 총 소요 시간 vs 14,400초 (REQ-PERF-001, UC26) |
| 기본 정보 | 위성, 모드, 촬영 시작·종료, 수신 시각, Raw 경로 |
| 단계별 상세 | Step 리스트 — 스테이지 라벨, 레벨, 소요 시간, VT 초과 표시 |

### 5. 전체 재처리 (UC23)

**트리거**: 상세 패널 → "재처리" 버튼 (FAILED / CANCELED 상태에서만 활성)

- ICD SI-04 `trigger_source: MANUAL_REQUEST` 로 요청
- `retry_count` 초기화 (`is_retry_reset: true`)
- L0부터 전체 파이프라인 재실행
- 성공 시 토스트: "재처리 요청 완료 — {Job ID}"

### 6. 부분 재처리 다이얼로그 (UC24)

**트리거**: 상세 패널 → 재처리 드롭다운 → "부분 재처리"

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| 시작 스테이지 | 드롭다운 | 해당 Job의 SAR 스테이지 중 선택 (L0~L3) |
| Job ID 확인 | 텍스트 | L0 선택 시에만 표시. 전체 파이프라인 재실행 경고와 함께 입력 일치 확인 |

- ICD OPS-06 / SI-07 `trigger_source: PARTIAL_REPROCESS` 로 요청
- 선택한 `sarStage`부터 이후 단계를 재실행
- 재처리 완료 후 카탈로그가 신규 버전을 등록하고 기존 산출물은 아카이빙

### 7. Job 취소 (UC25)

**트리거**: 상세 패널 → "취소" 버튼 (CREATED / ASSIGNED 상태에서만 활성)

- 큐에서 할당된 작업을 비활성화하여 이후 단계 실행 방지
- 성공 시 토스트: "Job 취소 완료 — {Job ID}"

### 8. SLA 확인 (UC26)

- 상세 패널 상단의 SLA 게이지로 표시
- 임계치: 14,400초 (REQ-PERF-001)
- 80% 초과 시 경고 색상(warning), 초과 시에는 각 Step의 VT 초과가 함께 강조됨

---

## 역할별 가시성

| 요소 | Admin | Operator |
| --- | --- | --- |
| Job 목록 조회 | O | O |
| Job 상세 조회 | O | O |
| 전체 재처리 | O | O |
| 부분 재처리 | O | O |
| Job 취소 | O | O |

> Job 관리 전 기능은 Operator 이상에서 모두 사용 가능 (USECASE.md 2절).

## 예상 API 엔드포인트

| 동작 | 메서드 | 경로 |
| --- | --- | --- |
| Job 목록 조회 | GET | `/v1/jobs?status=&from=&to=&cursor=&limit=` |
| Job 상세 조회 | GET | `/v1/jobs/{id}` |
| 전체 재처리 | POST | `/v1/jobs/{id}/reprocess` |
| 부분 재처리 | POST | `/v1/jobs/{id}/partial-reprocess` (ICD OPS-06) |
| Job 취소 | POST | `/v1/jobs/{id}/cancel` |

## 관련 유즈케이스

- UC21: Job 목록 조회 → Job 목록 테이블
- UC22: Job 상세 조회 → Job 상세 패널
- UC23: Job 전체 재처리 → 재처리 버튼
- UC24: Job 부분 재처리 → 부분 재처리 다이얼로그
- UC25: Job 취소 → 취소 버튼
- UC26: Job SLA 확인 → SLA 게이지
