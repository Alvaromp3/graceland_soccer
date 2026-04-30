import { TrendingUp, TrendingDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface KPICardProps {
  title: string;
  value: string | number;
  change: number;
  icon: LucideIcon;
  subtitle?: string;
  variant?: 'default' | 'warning' | 'success';
  delay?: number;
  sparklineData?: number[];
}

export default function KPICard({ 
  title, 
  value, 
  change, 
  icon: _Icon, 
  subtitle,
  variant = 'default',
  delay = 0,
  sparklineData
}: KPICardProps) {
  const isPositive = change >= 0;
  
  const config = {
    default: {
      bg: 'rgba(255, 193, 7, 0.08)',
      border: 'rgba(255, 193, 7, 0.15)',
      accent: '#ffc107',
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.08)',
      border: 'rgba(245, 158, 11, 0.15)',
      accent: '#f59e0b',
    },
    success: {
      bg: 'rgba(132, 204, 22, 0.08)',
      border: 'rgba(132, 204, 22, 0.15)',
      accent: '#84cc16',
    },
  };

  const { bg, border, accent } = config[variant];

  return (
    <div 
      className={`
        relative p-5 opacity-0 animate-slide-in-up
        card
      `}
      style={{ 
        animationDelay: `${delay}ms`, 
        animationFillMode: 'forwards',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        {/* Change badge - Field theme */}
        <div className={`
          flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase
          ${isPositive 
            ? 'bg-opacity-10 border border-field' 
            : 'bg-opacity-10 border border-field'
          }
        `} style={{ 
          letterSpacing: '0.05em',
          backgroundColor: isPositive ? 'rgba(132, 204, 22, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          borderColor: isPositive ? 'rgba(132, 204, 22, 0.25)' : 'rgba(239, 68, 68, 0.25)',
          color: isPositive ? '#84cc16' : '#ef4444',
        }}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{Math.abs(change)}%</span>
        </div>
      </div>
      
      <div>
        {/* Number - Field theme */}
        <h3 className="text-4xl font-bold text-on-field mb-1 count-up leading-none" style={{ 
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}>{value}</h3>
        <p className="text-sm font-semibold text-field-muted mt-2">{title}</p>
        {subtitle && (
          <p className="text-[10px] text-field-subtle mt-1 uppercase" style={{ 
            letterSpacing: '0.05em',
          }}>{subtitle}</p>
        )}
      </div>

      {/* Sparkline Chart - Field theme */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-4 h-10 -mb-1" style={{ minWidth: 0, minHeight: '40px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData.map((val, idx) => ({ value: val, index: idx }))}>
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={accent} 
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom accent - Field theme */}
      <div className="mt-4 h-1 rounded-full" style={{ backgroundColor: bg, borderColor: border }} />
    </div>
  );
}
