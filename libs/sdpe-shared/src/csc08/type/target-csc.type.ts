import { CscIdentifier } from '../../csc-identifier.type';

/** ICD 6.6 SI-04 — CSC-08이 작업을 할당하는 대상 CSC (확정) */
export const TargetCsc = {
  CSC_02: CscIdentifier.CSC_02,
  CSC_03: CscIdentifier.CSC_03,
  CSC_04: CscIdentifier.CSC_04,
  CSC_05: CscIdentifier.CSC_05,
  CSC_06: CscIdentifier.CSC_06,
} as const;

export type TargetCsc = (typeof TargetCsc)[keyof typeof TargetCsc];
