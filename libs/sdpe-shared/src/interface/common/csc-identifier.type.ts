/** SDPE 시스템을 구성하는 CSC 식별자 */
export const CscIdentifier = {
  CSC_01: 'CSC-01' /** CSC-01: 외부 인터페이스 */,
  CSC_02: 'CSC-02' /** CSC-02: Raw Data Collector */,
  CSC_03: 'CSC-03' /** CSC-03: Range Compression */,
  CSC_04: 'CSC-04' /** CSC-04: L1 Processing */,
  CSC_05: 'CSC-05' /** CSC-05: L2/L3 Processing */,
  CSC_06: 'CSC-06' /** CSC-06: Pipeline Configuration */,
  CSC_07: 'CSC-07' /** CSC-07: Pipeline Workflow */,
  CSC_08: 'CSC-08' /** CSC-08: Pipeline Orchestrator */,
  CSC_09: 'CSC-09' /** CSC-09: Data Service */,
} as const;

export type CscIdentifier = (typeof CscIdentifier)[keyof typeof CscIdentifier];
