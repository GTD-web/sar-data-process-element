/** ICD 6.4 — 처리 레벨 (확정) */
export const ProductLevel = {
  LEVEL_0: 'LEVEL_0',
  LEVEL_1: 'LEVEL_1',
  LEVEL_2: 'LEVEL_2',
  LEVEL_3: 'LEVEL_3',
} as const;

export type ProductLevel = (typeof ProductLevel)[keyof typeof ProductLevel];
