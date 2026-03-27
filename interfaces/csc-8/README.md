# CSC-08 Product & Catalog Manager — 인터페이스 명세

> ICD v1.0 (2026-03-20) 기준으로 작성하였습니다.

---

## CSC-08 개요

CSC-08은 **Post Processing Subsystem (PPS)** 소속이며, ICD에서는 "Product & Catalog Manager"로 지칭합니다.

CSC-08은 **제품 등록과 카탈로그 관리**를 담당합니다.

CSC-07로부터 제품 등록 트리거(SI-05)를 수신하면, 메타데이터를 추출하고 품질을 검증한 뒤 STAC(SpatioTemporal Asset Catalog) 카탈로그에 등록합니다. 등록된 제품은 PostgreSQL/PostGIS에 저장되며, CSC-09이 이를 읽기 전용으로 조회하여 외부에 제공합니다.

CSC-08은 SAR 데이터를 처리하지 않습니다. **처리 결과물을 검증하고, 카탈로그화하여 서비스 가능한 상태로 만드는 컴포넌트**입니다.

내부적으로 메타데이터 추출, 품질 검증, STAC 등록, 공간 인덱스 갱신, 제품 수명주기 관리 등의 기능을 포함하지만, 내부 CSU 구성은 설계 단계에서 변경될 수 있으므로 본 문서에서는 CSC 수준의 인터페이스만 정의합니다.

---

## ICD에서 CSC-08이 관여하는 인터페이스

| ID    | 명칭                   | CSC-08 역할                                                             | ICD 절 |
| ----- | ---------------------- | ----------------------------------------------------------------------- | ------ |
| SI-05 | 제품 등록 트리거       | **소비자** — CSC-07이 발행하는 등록 트리거를 수신합니다                  | 6.6    |
| SI-06 | 카탈로그 데이터 조회   | **제공자** — PostgreSQL/PostGIS에 제품 데이터를 쓰고, CSC-09이 읽습니다 | 6.7    |
| CI-03 | 공통 인프라 서비스     | **소비자** — CSC-01의 DB/NAS/Geo 모듈을 사용합니다                      | 6.8    |
| SI-03 | 처리 완료/실패 이벤트  | **제공자** — 등록 처리 완료/실패 시 이벤트를 발행합니다                  | 6.4    |

### 운영 시나리오에서의 CSC-08

| 시나리오           | CSC-08 수행 내용                                                                                                                 | ICD 절 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OPS-01 정상 처리   | (7~8단계) CSC-07로부터 SI-05 등록 트리거 수신 → 메타데이터 추출 → 품질 검증 → STAC 등록 → 공간 인덱스 갱신 → sar_products 레코드 생성 (PUBLISHED) | 3.1    |
| OPS-02 실패/재시도 | (CSC-08은 OPS-02에 직접 관여하지 않음)                                                                                           | 3.2    |
| OPS-03 부분 재처리 | 기존 제품 버전 관리 후 신규 버전 등록. 이전 버전은 아카이빙 상태로 유지                                                          | 3.3    |

---

## CSC-08이 주고받는 메시지 및 데이터 정리

각 메시지의 TypeScript interface, DB 스키마, 미확정 필드 결정 주체는 [interfaces.md](./interfaces.md)를 참조하세요.

### 수신 (Consumer)

| 큐명 | 인터페이스 | 설명 |
|------|-----------|------|
| `sdpe.catalog.registration` | SI-05 | CSC-07이 Level-1 이상 제품 처리 완료 시 발행. Level-0은 대상 아님 |

### 제공 (Provider)

| 매체 | 인터페이스 | 설명 |
|------|-----------|------|
| PostgreSQL/PostGIS | SI-06 | `sar_products` 테이블에 제품 메타데이터 쓰기. CSC-09이 읽기 전용 조회. CSC-01 DB Interface 경유 |

---

## 정상 등록 흐름 (OPS-01) — CSC-08 관점

```mermaid
sequenceDiagram
    participant Q_CR as sdpe.catalog.registration
    participant CSC08 as CSC-08<br/>Product & Catalog Manager
    participant DB as CSC-01<br/>DB Interface
    participant NAS as NAS<br/>공유 스토리지

    Q_CR->>CSC08: SI-05 등록 트리거 수신
    CSC08->>NAS: product_path로 제품 파일 접근

    critical 메타데이터 추출 + 품질 검증
        CSC08->>CSC08: 제품 파일에서 메타데이터 추출
        CSC08->>CSC08: 품질 검증 (quality_run=true 시)
    end

    alt 품질 통과
        CSC08->>DB: 제품 레코드 생성 (PUBLISHED)
        CSC08->>DB: STAC 카탈로그 등록
        CSC08->>DB: 공간 인덱스 갱신
        Note over CSC08: 등록 완료
    else 품질 미달
        CSC08->>DB: 제품 레코드 생성 (REJECTED)
        CSC08->>CSC08: CSC-07에 품질 미달 Alert 전달
    end
```

## 부분 재처리 시 버전 관리 (OPS-03) — CSC-08 관점

```mermaid
sequenceDiagram
    participant Q_CR as sdpe.catalog.registration
    participant CSC08 as CSC-08<br/>Product & Catalog Manager
    participant DB as CSC-01<br/>DB Interface

    Q_CR->>CSC08: SI-05 등록 트리거 (재처리 결과)
    CSC08->>DB: 기존 제품 조회 (동일 job_id / satellite_id)
    CSC08->>DB: 기존 버전을 아카이빙 상태로 변경
    CSC08->>DB: 신규 버전 제품 등록 (PUBLISHED)
    Note over DB: User Service 조회 시 최신 버전 반환
```

---

## 모니터링 및 Alert

| 모니터링 항목 | 임계값          | 관련 인터페이스     | Alert 발행 경로       |
| ------------- | --------------- | ------------------- | --------------------- |
| 데이터 품질   | 품질 기준 미달  | SI-05 (등록 트리거) | CSC-08 → CSC-07 Alert |

---

## CSC-08 관련 TBD/TBC 항목 (ICD 8절 기준)

| 성숙도 | 항목                               | 영향                                      | 사유                            |
| ------ | ---------------------------------- | ----------------------------------------- | ------------------------------- |
| TBC    | SI-05 인터페이스 전체              | 등록 트리거 수신 로직                     | CSC-07 + CSC-08 공동 합의 필요  |
| TBD    | sar_products 전체 테이블 스키마    | DB 엔티티 설계                            | CSC-08 상세 설계 착수 시 확정   |
| TBD    | STAC Item 매핑 구조                | 카탈로그 등록 로직                        | STAC 표준 매핑 설계 필요        |
| TBD    | product_status 허용값 목록         | 제품 수명주기 관리                        | 내부 설계 결정 필요             |
| TBC    | footprint_wkt 정밀도 및 좌표계     | 공간 인덱스 정확도                        | 내부 결정 대기                  |
| TBC    | 품질 검증 자동 실행 조건           | quality_run 플래그 처리 로직              | 내부 결정 대기                  |
| TBD    | 등록 실패 시 재시도 정책           | 등록 실패 처리                            | 내부 설계 결정 필요             |
| TBD    | 쿼리 성능 요건 및 인덱스 전략      | DB 성능                                   | CSC-09 조회 패턴 확정 후 가능   |
