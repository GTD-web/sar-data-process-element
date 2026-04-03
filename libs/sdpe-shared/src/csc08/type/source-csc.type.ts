import { CscIdentifier } from '../../csc-identifier.type';

/** ICD 6.5 SI-03 — 처리 이벤트를 발행하는 CSC (확정) */
export const SourceCsc = {
  CSC_02: CscIdentifier.CSC_02,
  CSC_03: CscIdentifier.CSC_03,
  CSC_04: CscIdentifier.CSC_04,
  CSC_05: CscIdentifier.CSC_05,
  CSC_06: CscIdentifier.CSC_06,
} as const;

export type SourceCsc = (typeof SourceCsc)[keyof typeof SourceCsc];
