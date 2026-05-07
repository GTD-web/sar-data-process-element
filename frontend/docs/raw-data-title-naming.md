# Raw Data 파일명(타이틀) 네이밍 컨벤션

- **결정 일자**: 2026-05-07
- **상태**: Active
- **관련 코드**:
  - `frontend/src/app/(planning)/_services/pipeline.mock.ts` — `formatRawDataTitle()`, `MODE_CODE`, `POL_CODE`, `SCENE_DURATION_S`
  - `frontend/src/app/(planning)/plan/data-catalog/DataCatalogPage.tsx` — `RawDataList` (카드 렌더)

## 배경

기존 `RawDataSummary.title` 포맷은 다음과 같이 위성 short name + 시각 + 위경도를 단순 결합한 형태였다.

```
X1_20241015_063412_36-525241_128-157707
```

이 포맷의 문제점:

1. **모드/편파/처리 레벨이 식별자에 없음**. 카탈로그에서 `Stripmap` vs `Spotlight`, `VV` vs `HH+HV` 를 파일명만 보고 구분할 수 없다.
2. **Scene Sensing Stop 정보 부재**. SAR 운용에서 "획득 길이" 는 모드 변별의 핵심 지표인데, 시작 시각만 있어 길이를 추론할 수 없다.
3. **위경도가 식별자의 핵심 자리를 차지**. 좌표는 카드 별도 슬롯(📍 chip)으로 빠지면 충분하고, 식별자에는 다른 메타가 들어가는 게 정보 밀도가 높다.
4. **고유성 보장 없음**. 같은 위성·시각·근처 좌표의 파일이 들어오면 충돌 가능.
5. **업계 표준에서 이탈**. 운용자가 외부 SAR 데이터(Sentinel-1, ICEYE, Capella 등)와 함께 다룰 때 mental model 이 달라 비용이 든다.

## 결정

**Sentinel-1 product naming convention 을 차용해, LumirX 운용 컨텍스트에 맞춰 일부 슬롯을 재해석한다.**

항공 시범 데이터와 위성 운용 데이터를 동일 포맷으로 통일한다 — 운용 단계 전환 시점에 식별 체계를 갈아끼우는 비용을 회피하기 위함.

### 포맷

```
{Mission}_{Mode}_{ProductType}_{Level}{Class}{Pol}_{StartUTC}_{StopUTC}_{Flight}_{LookAngle}_{Hash}.h5
```

예:

```
LX1_SM_RAW_0SVV_20241015T063412_20241015T063554_F0042_LA77_A1B2.h5
```

### 슬롯별 사양

| 슬롯 | 예시 | 길이 | 의미 | 매핑 규칙 |
|---|---|---|---|---|
| **Mission** | `LX1` | 3 | 위성/플랫폼 ID | `LumirX-{n}` → `LX{n}` |
| **Mode** | `SM` | 2 | 촬영 모드 | `Stripmap`→`SM`, `ScanSAR`→`SC`, `Spotlight`→`SL` |
| **ProductType** | `RAW` | 3 | 산출물 타입 | `RAW`(L0), `SLC`(L1), `GRD`(L2), `MAP`(L3) |
| **Level + Class + Pol** | `0SVV` | 4 | 처리 레벨(1자리) + 클래스(1자리, S=Standard) + 편파(2자리) | 편파: `HH`→`SH`, `VV`→`SV`, `HH+HV`→`DH`, `VV+VH`→`DV` |
| **StartUTC** | `20241015T063412` | 15 | Scene Sensing Start | ISO 8601 basic (`YYYYMMDDTHHMMSS`), UTC |
| **StopUTC** | `20241015T063554` | 15 | Scene Sensing Stop | 동일 포맷. mock 에서는 모드별 typical duration 으로 산출 (Stripmap 103s / ScanSAR 150s / Spotlight 10s) |
| **Flight** | `F0042` | 5 | 비행/궤도 ID | 항공: `F` + 4자리 비행 번호. 위성 운용 시: 절대 궤도 번호로 의미 재해석(포맷은 유지) |
| **LookAngle** | `LA77` | 4 | Look angle (°) | `LA` + 2자리 정수. LumirX는 LA 가변폭이 커서 운용상 의미 큼. Sentinel-1 의 datatake ID 슬롯을 LA 로 재해석 |
| **Hash** | `A1B2` | 4 | 고유성 보장 | CRC-16 또는 결정론적 해시 4-hex(대문자) |
| **확장자** | `.h5` | 3 | 컨테이너 포맷 | HDF5 |

전체 길이: 약 67자 (확장자 포함).

### 산출물 파일명 자동 파생

처리 단계가 진행되면 `ProductType` + `Level` 만 바꾸어 동일 stem 을 유지한다.

```
LX1_SM_SLC_1SVV_20241015T063412_20241015T063554_F0042_LA77_A1B2     (L1 SLC)
LX1_SM_GRD_2SVV_20241015T063412_20241015T063554_F0042_LA77_A1B2     (L2 GRD)
LX1_SM_MAP_3SVV_20241015T063412_20241015T063554_F0042_LA77_A1B2     (L3 MAP)
```

stem 을 보존하므로 lineage 추적, grep, 카탈로그 join 이 단순해진다.

## 대안과 트레이드오프

| 대안 | 장점 | 단점 / 채택하지 않은 이유 |
|---|---|---|
| 현행 `X1_시각_위경도` 유지 | 변경 비용 0 | 모드/편파/레벨 정보 누락. 위에 나열한 모든 문제 해결 불가 |
| Sentinel-1 포맷 그대로(절대 궤도) | 표준 100% 호환 | 항공 테스트 단계는 절대 궤도 개념이 없어 슬롯 비워두거나 가짜값 채워야 함. LumirX의 LA 가변성을 포맷에서 노출 못함 |
| LumirX 자체 코드 정의(`L0H/L1S/...`) | LumirX 워딩에 맞춤 | 외부 SAR 데이터와 mental model 분리. 운용자/협력사 학습 비용 |
| 좌표를 식별자에 포함 | 한 줄 식별자에 위치까지 | 식별자가 너무 길고, 좌표는 카드의 별도 슬롯(📍)으로 더 가독성 좋게 표현 가능 |

**채택안의 트레이드오프**:

- Sentinel-1 의 `Datatake ID` 슬롯을 LumirX 의 `LookAngle` 로 재해석한 것은 표준에서의 의도적 이탈. 외부 도구가 이 슬롯을 hex datatake 로 파싱하면 깨질 수 있다. 운용 도구는 SDPE 자체이고 외부 호환은 우선순위가 아니라서 수용.
- `Flight` 슬롯의 `F` prefix 는 항공 컨텍스트를 시사하지만, 위성 운용 전환 시 의미만 "절대 궤도 번호" 로 재해석하고 prefix 는 유지하는 정책. prefix 변경은 식별자 깨짐을 유발하므로 회피.

## 적용 범위 / 영향

- **현재**: `(planning)` mock 환경의 `formatRawDataTitle()` 만 적용. 실제 위성 데이터 파이프라인 수신 측은 미적용.
- **카드 표시**: `RawDataList` 가 `font-mono` + full-width wrap 으로 식별자를 그대로 노출. truncate 하지 않음.
- **rawDataPath**: NAS 경로의 파일명 부분도 동일 식별자를 그대로 사용 (`/mnt/nas/sdpe/raw/{satelliteId}/{mode}/{title}`).
- **HDF5 attribute 매핑**: 향후 실제 HDF5 수신 시 root attrs 의 `Operation Mode`, `Scene Sensing Start UTC`, `Scene Sensing Stop UTC`, ST0 의 `Look Angle` 을 위 슬롯에 직접 매핑한다. Hash 는 파일 CRC 또는 catalog 등록 시점의 시퀀스 기반으로 계산.

## 미해결 사항

- **Polarization 듀얼 표기 확정**: `DH`/`DV` 외 `DC`(compact pol) 등 추가 필요시 코드 합의 필요.
- **ProductType 코드 확장**: `MAP` 외에 분광 인덱스, 변화 탐지 등 L3+ 산출물의 코드 체계 미정.
- **Hash 알고리즘**: 현재 mock 은 결정론적 의사 해시. 실제 운용 시 파일 무결성 검증과 결합할지(예: SHA-256 truncate) 결정 필요.
- **Resolution suffix**: Sentinel-1 의 `GRDH`(High) 처럼 해상도를 ProductType 에 붙일지 — 현재는 단일 해상도 가정으로 생략.
