import React from 'react';

interface LoadingIndicatorProps {
  sourceNodeId: string;
  targetNodeId: string;
  sourcePosition: { x: number; y: number };
  sourceWidth: number;
  sourceHeight: number;
  targetPosition: { x: number; y: number };
  targetWidth: number;
  targetHeight: number;
}

export default function LoadingIndicator({ 
  sourceNodeId,
  targetNodeId,
  sourcePosition, 
  sourceWidth, 
  sourceHeight,
  targetPosition,
  targetWidth,
  targetHeight
}: LoadingIndicatorProps) {
  // Вычисляем точки соединения
  const sourceConnectionX = sourcePosition.x + sourceWidth; // правый край источника
  const sourceConnectionY = sourcePosition.y + sourceHeight / 2; // центр источника
  
  const targetConnectionX = targetPosition.x; // левый край цели
  const targetConnectionY = targetPosition.y + targetHeight / 2; // центр цели
  
  // Вычисляем середину стрелки
  const midX = (sourceConnectionX + targetConnectionX) / 2;
  const midY = (sourceConnectionY + targetConnectionY) / 2;
  
  const circleSize = 30; // немного больше чем было

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: midX - circleSize / 2,
        top: midY - circleSize / 2,
        width: circleSize,
        height: circleSize,
      }}
    >
      {/* Круг с индикатором загрузки на середине стрелки */}
      <div className="w-full h-full rounded-full bg-slate-800/95 border-2 border-sky-400 flex items-center justify-center shadow-lg backdrop-blur-sm">
        {/* Вращающийся индикатор */}
        <div className="w-4 h-4 relative">
          <div className="w-full h-full border-2 border-slate-600 border-t-sky-400 rounded-full animate-spin"></div>
          
          {/* Пульсирующая точка в центре */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}