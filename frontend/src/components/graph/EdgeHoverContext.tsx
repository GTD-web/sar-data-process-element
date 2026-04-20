'use client';

import { createContext, useContext } from 'react';

export const EdgeHoverContext = createContext<string | null>(null);

export function useEdgeHover(edgeId: string | undefined): boolean {
  const hoveredId = useContext(EdgeHoverContext);
  return hoveredId !== null && hoveredId === edgeId;
}
