import React from 'react';
import { cn } from '@/lib/tailwind/utils';

export interface ProgressRingProps {
  /**
   * Main value shown in the center of the ring (e.g. 420)
   */
  value: string | number;

  /**
   * Unit shown below the value, inside the ring (e.g. "cal")
   */
  unit?: string;

  /**
   * Progress percentage, 0-100. Controls how much of the ring is filled.
   */
  percentage: number;

  /**
   * Label shown below the ring (e.g. "Move")
   */
  label: string;

  /**
   * Stroke color of the progress arc (any valid CSS color)
   */
  color: string;

  /**
   * Diameter of the ring, in pixels
   * @default 120
   */
  size?: number;

  /**
   * Thickness of the ring stroke, in viewBox units (on a 0-100 scale)
   * @default 10
   */
  strokeWidth?: number;

  /**
   * Stroke color of the background track
   * @default 'hsl(var(--border))'
   */
  trackColor?: string;

  /**
   * Additional CSS classes for the outer container
   */
  className?: string;
}

const VIEWBOX_SIZE = 100;

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  unit,
  percentage,
  label,
  color,
  size = 120,
  strokeWidth = 10,
  trackColor = 'hsl(var(--border))',
  className,
}) => {
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const radius = (VIEWBOX_SIZE - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedPercentage / 100) * circumference;
  // The dasharray/dashoffset arc always starts at screen-angle (90 + rotation) and runs clockwise;
  // centering it on the top point (instead of starting there) means the start angle must trail
  // the top by half the filled arc's angular length.
  const rotation = -90 - (clampedPercentage / 100) * 180;

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} width="100%" height="100%">
          <circle
            cx={VIEWBOX_SIZE / 2}
            cy={VIEWBOX_SIZE / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* SVG-native rotation (not CSS) so it turns around the viewBox center, not the element's border-box */}
          <circle
            cx={VIEWBOX_SIZE / 2}
            cy={VIEWBOX_SIZE / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(${rotation} ${VIEWBOX_SIZE / 2} ${VIEWBOX_SIZE / 2})`}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold leading-none text-foreground">{value}</span>
          {unit && <span className="mt-1 text-xs text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{clampedPercentage}%</span>
      </div>
    </div>
  );
};
