'use client';

import { EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { Plus, Trash2 } from 'lucide-react';
import { useEdgeHover } from './EdgeHoverContext';

export type DeletableEdgeData = {
  stroke: string;
  strokeWidth: number;
  animated: boolean;
  editable: boolean;
  sourceOrder: number;
  targetOrder: number;
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
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<DeletableEdgeType>) {
  const stroke = data?.stroke ?? '#334155';
  const strokeWidth = data?.strokeWidth ?? 2;
  const editable = data?.editable ?? false;
  const hovered = useEdgeHover(id as string | undefined);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

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
    border: '2px solid #1e293b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    transition: 'transform 0.15s, opacity 0.15s',
  };

  return (
    <>
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
        stroke={showActions ? '#ffffff' : stroke}
        strokeWidth={showActions ? 3 : strokeWidth}
        style={{
          transition: 'stroke 0.3s ease, stroke-width 0.3s ease',
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
              style={{ ...btnBase, background: '#3b82f6', color: '#fff' }}
              title="노드 추가"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
            <button
              onClick={handleDelete}
              style={{ ...btnBase, background: '#ef4444', color: '#fff' }}
              title="연결 삭제"
            >
              <Trash2 size={13} strokeWidth={2.5} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
