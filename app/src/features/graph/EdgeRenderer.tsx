import { memo, useMemo, useState, useCallback } from 'react';
import type {
  EdgeProps,
  ConnectionLineComponentProps,
} from 'reactflow';
import { useReactFlow, Position } from 'reactflow';

interface Point {
  x: number;
  y: number;
}

function calculateBezierPath(start: Point, end: Point): string {
  const deltaX = Math.abs(end.x - start.x);
  const offset = Math.max(deltaX * 0.5, 60);
  const control1 = `${start.x + offset},${start.y}`;
  const control2 = `${end.x - offset},${end.y}`;
  return `M ${start.x},${start.y} C ${control1} ${control2} ${end.x},${end.y}`;
}

function getPointFromParams(x: number, y: number, position: Position): Point {
  switch (position) {
    case Position.Top:
      return { x, y: y - 12 };
    case Position.Bottom:
      return { x, y: y + 12 };
    case Position.Left:
      return { x: x - 12, y };
    case Position.Right:
    default:
      return { x: x + 12, y };
  }
}

export const SmartBezierEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    selected,
  }: EdgeProps): JSX.Element => {
    const [isHovered, setIsHovered] = useState(false);
    const { setEdges } = useReactFlow();
    
    const start = useMemo(
      () => getPointFromParams(sourceX, sourceY, sourcePosition ?? Position.Right),
      [sourceX, sourceY, sourcePosition],
    );
    const end = useMemo(
      () => getPointFromParams(targetX, targetY, targetPosition ?? Position.Left),
      [targetX, targetY, targetPosition],
    );

    const path = useMemo(() => calculateBezierPath(start, end), [start, end]);
    
    // Calculate middle point for delete button
    const midPoint = useMemo(() => ({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    }), [start, end]);

    const handleDelete = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setEdges(edges => edges.filter(edge => edge.id !== id));
    }, [id, setEdges]);

    return (
      <g 
        className="rf-smart-edge"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <path
          id={id}
          className={`rf-smart-edge__path${selected ? ' rf-smart-edge__path--selected' : ''}`}
          d={path}
          style={style}
          markerEnd={markerEnd}
        />
        <path
          d={path}
          className="rf-smart-edge__halo"
        />
        
        {/* Delete button on hover */}
        {isHovered && (
          <foreignObject
            x={midPoint.x - 14}
            y={midPoint.y - 14}
            width={28}
            height={28}
            className="rf-smart-edge__delete-button"
          >
            <button
              onClick={handleDelete}
              className="w-7 h-7 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full text-sm font-bold flex items-center justify-center shadow-xl border-2 border-white transition-all duration-200 hover:scale-110"
              title="Удалить соединение"
              style={{
                backdropFilter: 'blur(4px)',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.8)',
              }}
            >
              ✕
            </button>
          </foreignObject>
        )}
      </g>
    );
  },
);
SmartBezierEdge.displayName = 'SmartBezierEdge';

export const SmartConnectionLine = memo(
  ({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
  }: ConnectionLineComponentProps): JSX.Element => {
    const start = getPointFromParams(fromX, fromY, fromPosition ?? Position.Right);
    const end = getPointFromParams(toX, toY, toPosition ?? Position.Left);
    const path = calculateBezierPath(start, end);

    return <path className="rf-smart-edge__preview" d={path} />;
  },
);
SmartConnectionLine.displayName = 'SmartConnectionLine';

