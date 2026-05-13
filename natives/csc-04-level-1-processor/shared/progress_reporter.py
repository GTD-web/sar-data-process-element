"""Pretty staged-progress reporter for the SAR demo modal terminal.

main.py + SARProcessor 를 통과하는 시연 흐름에서 "어느 stage 가 끝났고 지금
어떤 단계가 몇 % 인지" 를 한눈에 보여주는 banner 식 로그를 stdout 으로 흘려준다.

Frontend modal (`NodeExecutionTerminal`) 은 SSE 로 들어오는 stdout 라인을 그대로
한 줄씩 렌더하므로, 멀티라인 snapshot 도 자연스럽게 표시된다.

사용 패턴
---------
    reporter = StageReporter(
        run_name="RDA_raw_to_SLC",
        stages=[
            "Loading Raw Data",
            "Loading SAR Parameters",
            ...,
        ],
    )

    reporter.start_stage(0)
    ...do work...
    reporter.complete_stage(0)

    reporter.start_stage(1)
    ...
    reporter.complete_stage(1)

    # mid-stage progress (throttled — 호출자가 직접 10% 단위 호출)
    reporter.progress(46, label="Aplying RCMC in Time Domain", done=930, total=2000)
"""

from __future__ import annotations

import sys
import time
from datetime import datetime
from typing import List, Optional


_SEP_HEAVY = "═" * 59
_SEP_LIGHT = "=" * 60
_BAR_LEN = 10


class StageReporter:
    """Snapshot-style progress reporter.

    완료/진행/대기 상태에 따라 ✓ / → / ○ 로 stage 들을 그려준다.
    """

    def __init__(self, run_name: str, stages: List[str]):
        self.run_name = run_name
        self.stages: List[str] = list(stages)
        self.completed: set[int] = set()
        self.current: int = -1
        # 사용자 예시 형식 흉내: processing-<ms>-<6글자 hex>
        ts_ms = int(time.time() * 1000)
        suffix = format(ts_ms & 0xFFFFFF, 'x').rjust(6, '0')
        self.run_id = f"processing-{ts_ms}-{suffix}"
        self._stage_started_at: float = 0.0

    # ── public API ────────────────────────────────────────────────────────

    def start_stage(self, idx: int) -> None:
        if not (0 <= idx < len(self.stages)):
            return
        self.current = idx
        self._stage_started_at = time.time()
        self._print_snapshot(pct=0)
        # 사용자 예시의 "Algorithm execution started..." 보조라인.
        print("Algorithm execution started...", flush=True)
        print("", flush=True)

    def complete_stage(self, idx: int) -> None:
        if not (0 <= idx < len(self.stages)):
            return
        self.completed.add(idx)
        if idx == self.current:
            self.current = -1
        self._print_snapshot(pct=100, suppress_current_line=True)

    def progress(
        self,
        pct: int,
        *,
        label: Optional[str] = None,
        done: Optional[int] = None,
        total: Optional[int] = None,
    ) -> None:
        """현재 진행중인 stage 의 mid-stage 갱신 — 호출 측이 throttle 책임."""
        if self.current < 0:
            return
        pct = max(0, min(100, int(pct)))
        self._print_snapshot(pct=pct, current_label=label)
        # tqdm 풍 보조 라인. done/total 가 있으면 ETA 도 같이 노출.
        bar = self._make_bar(pct)
        eta = ""
        if done is not None and total is not None and done > 0:
            elapsed = max(time.time() - self._stage_started_at, 1e-6)
            rate = done / elapsed
            remaining = (total - done) / rate if rate > 0 else 0
            eta = f" [{self._fmt_secs(elapsed)}<{self._fmt_secs(remaining)}, {rate:7.2f}it/s]"
            counter = f" {done}/{total}"
        else:
            counter = ""
        prefix = label or self.stages[self.current]
        print(f"{prefix}: {pct:3d}%|{bar}|{counter}{eta}", flush=True)
        print("", flush=True)

    # ── internals ─────────────────────────────────────────────────────────

    def _print_snapshot(
        self,
        *,
        pct: int = 0,
        current_label: Optional[str] = None,
        suppress_current_line: bool = False,
    ) -> None:
        ts = datetime.now().strftime('%H:%M:%S')
        out: List[str] = []
        out.append("")
        out.append(f"[{ts}] {self.run_name} (ID: {self.run_id})")
        out.append(_SEP_LIGHT)
        out.append("")
        out.append(_SEP_HEAVY)
        out.append(f"Processing Stages (Total: {len(self.stages)}):")
        out.append(_SEP_HEAVY)
        for i, name in enumerate(self.stages):
            if i in self.completed:
                line = f"  ✓ Stage {i+1}/{len(self.stages)}: {name} [COMPLETED]"
            elif i == self.current:
                line = f"  → Stage {i+1}/{len(self.stages)}: {name} [CURRENT - {pct}%]"
            else:
                line = f"  ○ Stage {i+1}/{len(self.stages)}: {name}"
            out.append(line)
        out.append(_SEP_HEAVY)
        if not suppress_current_line and 0 <= self.current < len(self.stages):
            label = current_label or self.stages[self.current]
            out.append(f"Current Step: {label} ({pct}%)")
        out.append("")
        sys.stdout.write("\n".join(out) + "\n")
        sys.stdout.flush()

    @staticmethod
    def _make_bar(pct: int) -> str:
        filled = int(round(_BAR_LEN * pct / 100))
        filled = max(0, min(_BAR_LEN, filled))
        return "█" * filled + " " * (_BAR_LEN - filled)

    @staticmethod
    def _fmt_secs(s: float) -> str:
        s = int(round(s))
        if s < 60:
            return f"00:{s:02d}"
        return f"{s // 60:02d}:{s % 60:02d}"
