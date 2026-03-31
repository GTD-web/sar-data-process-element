# CSC-01 Common Function — 인터페이스 명세

> ICD v1.0 (2026-03-20) 기준으로 작성하였습니다.

---

## CSC-01 개요

CSC-01은 모든 서브시스템에 **공통 인프라 서비스**를 제공하는 TypeScript 공유 모듈입니다.

CSC-01은 네트워크 호출 없이 동일 프로세스 내 함수 호출로 동작합니다. 데이터베이스 접근, NAS 파일 입출력, 지리 데이터 연산 기능을 캡슐화하여 모든 CSC가 일관된 방식으로 인프라에 접근하도록 합니다.

직접 DB 접근은 금지되며, 반드시 CSC-01의 DbRepository를 경유해야 합니다.

---

## ICD에서 CSC-01이 관여하는 인터페이스

| ID    | 명칭                   | CSC-01 역할                                                     | ICD 절 |
| ----- | ---------------------- | --------------------------------------------------------------- | ------ |
| CI-03 | 공통 인프라 서비스     | **제공자** — 모든 CSC에 DB/NAS/Geo 서비스를 제공합니다          | 6.11   |

### 소비자 목록

| 소비자 | 서브시스템 |
|--------|-----------|
| CSC-02 Raw Data Collector | DCS |
| CSC-03 Level-0 Processor | SPS |
| CSC-04 Level-1 Processor | SPS |
| CSC-05 Level-2 Processor | PPS |
| CSC-06 Level-3 Processor | PPS |
| CSC-07 Product & Catalog Manager | PPS |
| CSC-08 Pipeline Orchestrator | PWS |
| CSC-09 Data API Provider | DSS |

---

## CSC-01이 주고받는 메시지 정리

CSC-01은 pgmq 메시지를 주고받지 않습니다. TypeScript 모듈 import로만 동작합니다.

---

## CSC-01 관련 TBD/TBC 항목 (ICD 8절 기준)

| 성숙도 | 항목                                   | 영향                  | 사유                  |
| ------ | -------------------------------------- | --------------------- | --------------------- |
| TBC    | `@sdpe/common` 패키지명               | npm 패키지 명명 규칙  | 내부 결정 대기        |
| TBD    | 각 메서드 상세 시그니처                | API 설계              | 상세 설계 착수 시 확정 |
| TBD    | NAS `buildPath()` 경로 생성 규칙       | 파일 저장 경로        | satellite_id 형식 의존 |
| TBD    | 트랜잭션 관리 패턴                     | DB 일관성             | 내부 설계 결정 필요   |
| TBD    | 오류 처리 및 예외 타입 전체 정의        | 에러 핸들링           | 내부 설계 결정 필요   |
