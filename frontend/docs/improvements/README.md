# SDPE Console — 개선 작업 목록

> DESIGN.md 기준 현재 구현 대비 누락·개선 항목을 카테고리별로 정리합니다.
> 각 파일에 구체적인 구현 지침과 완료 기준이 있습니다.

---

## 파일 구성

| 파일 | 카테고리 | 항목 수 |
|---|---|---|
| [01-domain-accuracy.md](./01-domain-accuracy.md) | 도메인 정확도 — SDPE 특화 | 4개 |
| [02-operation-safety.md](./02-operation-safety.md) | 운영 안전성 — 위험 액션 보호 | 3개 |
| [03-operation-visibility.md](./03-operation-visibility.md) | 운영 가시성 — 실시간 모니터링 | 3개 |
| [04-info-display.md](./04-info-display.md) | 정보 표시 품질 | 3개 |
| [05-layout-ux.md](./05-layout-ux.md) | 레이아웃·UX | 3개 |

---

## 우선순위 매트릭스

| ID | 항목 | 카테고리 | 우선순위 | DESIGN.md 근거 |
|---|---|---|---|---|
| D-01 | RAW_DATA_RECEIVED 트리거 노드 추가 | 도메인 | 🟧 High | §4.1, §6 |
| D-02 | 부분 재처리 target_level 선택 다이얼로그 | 도메인 | 🟧 High | OPS-06 |
| D-03 | CSC-07 미확정 상태 grey 처리 | 도메인 | 🟨 Med | R-2 |
| D-04 | TargetCsc 범위 주석 명시 | 도메인 | 🟩 Low | interfaces/csc-8 |
| S-01 | confirm/prompt → shadcn 다이얼로그 | 안전성 | 🟥 Critical | §14.1 |
| S-02 | 재처리 2단계 확인 (Job ID 타이핑) | 안전성 | 🟥 Critical | §14.1 |
| S-03 | Alert ack 낙관적 동시성 처리 | 안전성 | 🟧 High | §14.1 |
| V-01 | VT 카운트다운 (단계별 재출현 예정) | 가시성 | 🟥 Critical | §14.3 |
| V-02 | SLA 바 실시간화 (RUNNING 경과 시간) | 가시성 | 🟧 High | §4.1, §14.3 |
| V-03 | SSE stale 배너 | 가시성 | 🟧 High | §14.1 |
| I-01 | NAS 경로 마스킹 토글 | 정보 표시 | 🟧 High | §14.2 |
| I-02 | 타임스탬프 UTC 툴팁 | 정보 표시 | 🟨 Med | §14.2 |
| I-03 | 에러 코드 raw 보기 | 정보 표시 | 🟨 Med | R-3 |
| L-01 | 파이프라인 뷰 ↔ Job 실행 뷰 시각적 구분 | 레이아웃 | 🟧 High | §4.1 |
| L-02 | 그래프 초기 중앙 정렬 (fitView) | 레이아웃 | 🟨 Med | §4.3 |
| L-03 | 파이프라인 생성 폼 (위성/모드 선택) | 레이아웃 | 🟨 Med | §2, §6 |

---

## 작업 순서 권장안

```
Phase 1 (즉시)
  S-01  confirm/prompt 제거
  S-02  재처리 2단계 확인
  V-01  VT 카운트다운

Phase 2 (단기)
  D-01  RAW_DATA_RECEIVED 노드
  D-02  부분 재처리 다이얼로그
  V-02  SLA 바 실시간화
  L-01  뷰 모드 구분 배너
  I-01  NAS 경로 마스킹

Phase 3 (중기)
  S-03  Alert ack 동시성
  V-03  SSE stale 배너
  I-02  UTC 툴팁
  I-03  에러 코드 raw
  D-03  CSC-07 grey
  L-02  fitView 중앙 정렬
  L-03  파이프라인 생성 폼
```
