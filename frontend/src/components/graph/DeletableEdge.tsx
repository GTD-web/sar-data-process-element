'use client';

import { EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { Plus, Trash2 } from 'lucide-react';
import { useEdgeHover } from './EdgeHoverContext';
import * as t from '@/styles/design-tokens';

export type DeletableEdgeData = {
  stroke: string;
  strokeWidth: number;
  animated: boolean;
  editable: boolean;
  sourceOrder: number;
  targetOrder: number;
  markerId?: string;
  onDelete?: (sourceOrder: number, targetOrder: number) => void;
  onInsert?: (sourceOrder: number, targetOrder: number) => void;
  onHoverStay?: () => void;
  onHoverLeave?: () => void;
  [key: string]: unknown;
};

type DeletableEdgeType = Edge<DeletableEdgeData, 'deletable'>;

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<DeletableEdgeType>) {
  const stroke = data?.stroke ?? t.edge;
  const strokeWidth = data?.strokeWidth ?? 2;
  const editable = data?.editable ?? false;
  const hovered = useEdgeHover(id as string | undefined);
  const markerId = data?.markerId ?? `arrow-${id}`;

  // n8n-style horizontal-fixed bezier: control points extend only horizontally
  const dx = Math.abs(targetX - sourceX);
  const offset = Math.max(dx * 0.4, 80);
  const edgePath = `M ${sourceX},${sourceY} C ${sourceX + offset},${sourceY} ${targetX - offset},${targetY} ${targetX},${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  const showActions = hovered && editable;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    data?.onDelete?.(data.sourceOrder, data.targetOrder);
  };

  const handleInsert = (e: React.MouseEvent) => {
    e.stopPropagation();
    data?.onInsert?.(data.sourceOrder, data.targetOrder);
  };

  const btnBase: React.CSSProperties = {
    pointerEvents: 'all',
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: `2px solid ${t.surface}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    transition: 'transform 0.15s, opacity 0.15s',
  };

  const currentStroke = showActions ? t.edgeActive : stroke;

  return (
    <>
      {/* Custom fixed-size arrowhead marker */}
      <defs>
        <marker
          id={markerId}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 0 0 L 12 6 L 0 12 Z"
            fill={currentStroke}
            style={{ transition: 'fill 0.3s ease' }}
          />
        </marker>
      </defs>
      {/* Invisible wide path for hover hit area */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: 'stroke' }}
      />
      {/* Visible edge path with CSS transition */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: showActions ? t.edgeActive : stroke,
          strokeWidth: showActions ? 3 : strokeWidth,
          transition: 'stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease',
          filter: showActions
            ? 'drop-shadow(0 0 8px rgba(52, 211, 153, 0.6))'
            : stroke === t.edgeSuccess
              ? 'drop-shadow(0 0 6px rgba(52, 211, 153, 0.5)) drop-shadow(0 0 14px rgba(52, 211, 153, 0.25))'
              : undefined,
          pointerEvents: 'none',
        }}
      />
      {editable && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            onMouseEnter={() => data?.onHoverStay?.()}
            onMouseLeave={() => data?.onHoverLeave?.()}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: showActions ? 'all' : 'none',
              display: 'flex',
              gap: 6,
              opacity: showActions ? 1 : 0,
              transition: 'opacity 0.2s ease',
            }}
          >
            <button
              onClick={handleInsert}
              style={{ ...btnBase, background: t.surfaceRaised, color: t.textSecondary }}
              title="노드 추가"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
            <button
              onClick={handleDelete}
              style={{ ...btnBase, background: t.surfaceRaised, color: t.textSecondary }}
              title="연결 삭제"
            >
              <Trash2 size={14} strokeWidth={2.5} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
