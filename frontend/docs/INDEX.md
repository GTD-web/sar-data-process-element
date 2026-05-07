# Design Decisions Index

`frontend/docs/` 의 모든 design decision 문서를 한 곳에 압축. UI 변경 작업
전에 이 파일을 1회 읽고, "건드리는 코드/요청 키워드가 어떤 active 결정과
매치되는지" 를 판단한다.

각 항목 형식:
`[문서] — 한 줄 요약 — <관련 코드/심볼>`

## Active

- [raw-data-title-naming.md](./raw-data-title-naming.md) — Raw Data 파일명은 Sentinel-1 차용 9-슬롯 포맷 (`LX{n}_{Mode}_{Type}_{LSP}_{startUTC}_{stopUTC}_{Flight}_LA{angle}_{Hash}.h5`) — `pipeline.mock.ts:formatRawDataTitle`, `DataCatalogPage.tsx:RawDataList`

## Superseded / Deprecated

- (없음)

## 사용법

UI/식별자/레이아웃 관련 코드 수정 전:

1. 위 Active 목록을 훑어 영향 받는 항목이 있는지 확인.
2. 매치되면 해당 문서를 열고 "결정" 섹션을 사용자에게 인용.
3. 사용자에게 "이 결정을 바꾸는 변경인가?" 명시 확인.
4. 바꾸는 거라면 [README.md 의 Supersession 워크플로](./README.md#supersession-워크플로) 따라 처리.
5. 무관한 변경이면 그냥 진행.
