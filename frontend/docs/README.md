# Frontend Design Decisions

프론트엔드 UI/식별자/레이아웃 결정의 근거를 보존하는 디렉토리.

코드 자체로는 "왜 이렇게 만들었는지"가 드러나지 않는 결정들 — 식별자 포맷,
표시 컨벤션, 레이아웃 우선순위 — 을 여기 기록해, 미래에 같은 영역을 건드릴
때 의도치 않게 결정을 뒤집는 것을 방지한다.

## 진입점

- [INDEX.md](./INDEX.md) — 모든 active 결정을 한 줄씩. UI 변경 전 이 파일을 먼저 읽는다.

## 워크플로

### 일반 변경 (결정과 무관)

스타일 미세 조정, 버그 수정 등 design decision 과 무관한 변경은 그냥 진행.
INDEX.md 의 항목들과 매치되지 않으면 결정과 무관한 것으로 간주.

### 결정에 영향 주는 변경

INDEX.md 의 active 항목과 코드/요청이 매치되면:

1. 해당 문서의 "결정" 섹션을 사용자에게 인용해 보여준다.
2. "이 결정을 바꾸는 변경인가?" 명시적으로 확인을 받는다.
3. 사용자가 변경을 승인하면 supersession 워크플로 진행.
4. 결정 유지가 맞다면 변경을 보류하거나 결정에 부합하는 다른 안 제시.

### Supersession 워크플로

결정이 바뀔 때 기존 문서를 지우면 history 가 사라진다. 대신:

1. **기존 문서**: frontmatter 의 `상태` 를 `Superseded by <new-name>.md` 로
   바꾸고, `최근 검토` 갱신, `Superseded on: <date>` 라인을 frontmatter 에
   추가. 본문은 그대로 보존.
2. **새 문서**: `<topic>-v2.md` 또는 새 이름으로 생성. frontmatter 에
   `Supersedes: <old-name>.md` 명시. 배경 섹션에 "이전 결정의 어떤 점이 안
   맞아서 바꾸는지" 기록.
3. **INDEX.md**:
   - Active 섹션에서 기존 항목 제거
   - Superseded / Deprecated 섹션에 기존 항목 추가
   - Active 섹션에 새 항목 추가
4. **코드 변경**: 동일 PR/커밋에서 doc + code 함께.

이렇게 하면 시간이 지나도 supersession 체인을 따라 의사결정 history 추적이 가능하다.

## 문서 작성 가이드

- **한 결정 = 한 문서**. 한 파일에 여러 변경을 섞지 않는다 — supersession 시 분리가 어렵다.
- **파일명**: `kebab-case.md`. 토픽 위주로 (`raw-data-title-naming.md`, `sidebar-navigation.md` 등).
- **Frontmatter 필수 항목**:
  ```markdown
  - **결정 일자**: YYYY-MM-DD
  - **최근 검토**: YYYY-MM-DD
  - **상태**: Active   (또는 `Superseded by xxx.md` / `Deprecated`)
  - **관련 코드**:
    - `<path>` — `<symbol/function/component>`
  - **트리거 키워드**: <자연어 요청에서 매치할 키워드들 콤마 구분>
  - **Supersedes**: (없음 또는 파일명)
  - **Superseded by**: (없음 또는 파일명)
  ```
- **본문 권장 순서**:
  1. 배경 / 문제
  2. 결정
  3. 대안과 트레이드오프
  4. 적용 범위 / 영향
  5. 미해결 사항

## 관련 자동화

- `frontend/AGENTS.md` 의 `Design Decisions` 섹션이 이 디렉토리 참조 룰을 정의.
- 결정과 강하게 결합된 함수에는 코드 위에 한 줄 포인터 주석을 둘 수 있다 (`// Design decision: frontend/docs/<file>.md`).
