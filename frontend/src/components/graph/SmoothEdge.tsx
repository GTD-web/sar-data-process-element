'use client';

import type { EdgeProps } from '@xyflow/react';
import * as t from '@/styles/design-tokens';

export function SmoothEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const dx = Math.abs(targetX - sourceX);
  const offset = Math.max(dx * 0.4, 80);
  const path = `M ${sourceX},${sourceY} C ${sourceX + offset},${sourceY} ${targetX - offset},${targetY} ${targetX},${targetY}`;
  const strokeColor = style?.stroke as string ?? t.edge;
  const isCompleted = strokeColor === t.edgeSuccess;

  return (
    <path
      id={id}
      d={path}
      fill="none"
      className="react-flow__edge-path"
      strokeLinecap="round"
      style={{
        stroke: strokeColor,
        strokeWidth: 2,
        filter: isCompleted
          ? 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.5)) drop-shadow(0 0 14px rgba(52, 211, 153, 0.25))'
          : undefined,
      }}
    />
  );
}
