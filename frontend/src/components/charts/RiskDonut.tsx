import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { RiskDistribution } from '../../types';

const COLORS = {
  low: 'var(--risk-low)',
  medium: 'var(--risk-medium)',
  high: 'var(--risk-high)',
};

interface RiskDonutProps {
  data: RiskDistribution;
}

export default function RiskDonut({ data }: RiskDonutProps) {
  const total = data.low + data.medium + data.high;

  const chartData = [
    { name: 'Low', value: data.low, color: COLORS.low },
    { name: 'Medium', value: data.medium, color: COLORS.medium },
    { name: 'High', value: data.high, color: COLORS.high },
  ].filter((d) => d.value > 0);

  if (chartData.length === 0) {
    chartData.push({ name: 'No data', value: 1, color: 'var(--text-tertiary)' });
  }

  return (
    <div className="h-44 relative w-full" style={{ minHeight: 176, minWidth: 1 }}>
      <ResponsiveContainer width="100%" height={176} minWidth={0}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={44}
            outerRadius={62}
            paddingAngle={chartData.length > 1 ? 2 : 0}
            dataKey="value"
            stroke="var(--bg-surface)"
            strokeWidth={1.5}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
            }}
            formatter={(value, name) => [`${Number(value ?? 0)} players`, String(name ?? '')]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <p className="metric-value text-2xl">{total}</p>
          <p className="metric-label mt-0.5">Players</p>
        </div>
      </div>
    </div>
  );
}
