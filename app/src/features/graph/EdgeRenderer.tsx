import { memo, useMemo } from 'react';
import type {
  EdgeProps,
  ConnectionLineComponentProps,
  Position,
} from 'reactflow';

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
    case 'Top':
      return { x, y: y - 12 };
    case 'Bottom':
      return { x, y: y + 12 };
    case 'Left':
      return { x: x - 12, y };
    case 'Right':
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
    const start = useMemo(
      () => getPointFromParams(sourceX, sourceY, sourcePosition ?? 'Right'),
      [sourceX, sourceY, sourcePosition],
    );
    const end = useMemo(
      () => getPointFromParams(targetX, targetY, targetPosition ?? 'Left'),
      [targetX, targetY, targetPosition],
    );

    const path = useMemo(() => calculateBezierPath(start, end), [start, end]);

    return (
      <g className="rf-smart-edge">
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
    const start = getPointFromParams(fromX, fromY, fromPosition ?? 'Right');
    const end = getPointFromParams(toX, toY, toPosition ?? 'Left');
    const path = calculateBezierPath(start, end);

    return <path className="rf-smart-edge__preview" d={path} />;
  },
);
SmartConnectionLine.displayName = 'SmartConnectionLine';

