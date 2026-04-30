import type { ReactNode } from 'react';

interface ChartPanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export default function ChartPanel({ title, subtitle, children, className = '' }: ChartPanelProps) {
  return (
    <div className={`panel panel--elevated ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="caption mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
