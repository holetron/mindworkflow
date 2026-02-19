import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GraphPoint, randomColor, clamp } from './loginTypes';

const LoginBackground: React.FC = () => {
  const [points, setPoints] = useState<GraphPoint[]>([]);
  const [size, setSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }));

  const pointsRef = useRef<GraphPoint[]>([]);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const regeneratePoints = useCallback(
    (width: number, height: number) => {
      if (!width || !height) return;
      const margin = Math.min(width, height) * 0.08;
      const count = Math.max(8, Math.min(18, Math.round(width / 150)));
      const base = Array.from({ length: count }, (_, index) => ({
        id: index,
        x: margin + Math.random() * (width - margin * 2),
        y: margin + Math.random() * (height - margin * 2),
        color: randomColor(),
      }));

      const adjacency = base.map(() => new Set<number>());
      base.forEach((point, index) => {
        const neighbours = base
          .filter((_, i) => i !== index)
          .map((other) => ({
            id: other.id,
            distance: Math.hypot(point.x - other.x, point.y - other.y),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, Math.min(3, base.length - 1));

        neighbours.forEach((entry) => {
          adjacency[index].add(entry.id);
          adjacency[entry.id].add(index);
        });
      });

      const pointsWithLinks: GraphPoint[] = base.map((point, index) => ({
        ...point,
        links: Array.from(adjacency[index]),
      }));
      setPoints(pointsWithLinks);
    },
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    regeneratePoints(size.width, size.height);
  }, [regeneratePoints, size.height, size.width]);

  const dragRef = useRef<{ id: number; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const handlePointClick = useCallback((id: number) => {
    setPoints((prev) =>
      prev.map((point) => (point.id === id ? { ...point, color: randomColor() } : point)),
    );
  }, []);

  const handlePointerDown = useCallback((id: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    const point = pointsRef.current.find((candidate) => candidate.id === id);
    if (!point) return;
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - point.x,
      offsetY: event.clientY - point.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
        return;
      }
      const { id, offsetX, offsetY } = dragRef.current;
      const nextX = clamp(event.clientX - offsetX, 0, size.width);
      const nextY = clamp(event.clientY - offsetY, 0, size.height);
      setPoints((prev) =>
        prev.map((point) =>
          point.id === id
            ? {
                ...point,
                x: nextX,
                y: nextY,
              }
            : point,
        ),
      );
    },
    [size.height, size.width],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ from: GraphPoint; to: GraphPoint }> = [];
    points.forEach((point) => {
      point.links.forEach((targetId) => {
        const key = point.id < targetId ? `${point.id}-${targetId}` : `${targetId}-${point.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const target = points.find((candidate) => candidate.id === targetId);
          if (target) {
            list.push({ from: point, to: target });
          }
        }
      });
    });
    return list;
  }, [points]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-b from-slate-900 to-blue-950">
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] bg-[size:26px_26px] opacity-60" />
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {edges.map((edge) => (
          <line
            key={`${edge.from.id}-${edge.to.id}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke={edge.from.color}
            strokeWidth={2}
            strokeOpacity={0.4}
            strokeLinecap="round"
          />
        ))}
        {points.map((point) => (
          <g key={point.id} className="cursor-pointer" onClick={() => handlePointClick(point.id)}>
            <circle
              cx={point.x}
              cy={point.y}
              r={11}
              fill="#0f172a"
              stroke={point.color}
              strokeWidth={2}
              onPointerDown={handlePointerDown(point.id)}
            />
            <circle cx={point.x} cy={point.y} r={6} fill={point.color} />
          </g>
        ))}
      </svg>
    </div>
  );
};

export default LoginBackground;
