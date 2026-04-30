import type { ReactNode } from 'react';

interface Chart3DProps {
  children: ReactNode;
  className?: string;
  /** Subtle 3D tilt in degrees (e.g. 4) */
  tilt?: number;
  /** Perspective value for depth (e.g. 800) */
  perspective?: number;
}

/**
 * Wrapper that adds subtle 3D depth to chart containers using CSS transforms.
 */
export default function Chart3D({
  children,
  className = '',
  tilt = 4,
  perspective = 800,
}: Chart3DProps) {
  return (
    <div
      className={className}
      style={{
        perspective,
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        style={{
          transform: `rotateX(${tilt}deg)`,
          transformStyle: 'preserve-3d',
          boxShadow: '0 10px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
          borderRadius: 12,
          background: 'white',
          border: '1px solid #e2e8f0',
        }}
      >
        {children}
      </div>
    </div>
  );
}
