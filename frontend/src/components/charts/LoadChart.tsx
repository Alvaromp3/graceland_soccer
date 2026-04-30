import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import type { LoadHistory } from '../../types';
import ChartPanel from './ChartPanel';

const CHART_COLOR = 'var(--accent-performance)';
const AXIS_COLOR = 'var(--text-tertiary)';
const REF_LINE_COLOR = 'var(--text-tertiary)';

interface LoadChartProps {
  data: LoadHistory[];
}

export default function LoadChart({ data }: LoadChartProps) {
  const avgLoad =
    data.length > 0 ? data.reduce((sum, d) => sum + d.avgLoad, 0) / data.length : 0;

  const sortedData = [...data].sort((a, b) => {
    try {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    } catch {
      return 0;
    }
  });

  const formattedData = sortedData
    .filter((d) => d.date && d.date !== 'Unknown' && d.date !== '')
    .map((d) => {
      try {
        const date = d.date.includes('T') ? new Date(d.date) : new Date(d.date + 'T00:00:00');
        if (isNaN(date.getTime())) return null;
        return {
          ...d,
          date: date.toISOString().split('T')[0],
          displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          avgLoad: typeof d.avgLoad === 'number' ? d.avgLoad : parseFloat(String(d.avgLoad)) || 0,
        };
      } catch {
        return null;
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null && d.avgLoad !== undefined && !isNaN(d.avgLoad));

  return (
    <ChartPanel title="Load evolution" subtitle="Last 15 sessions">
      <div className="h-64 w-full" style={{ minHeight: 256, minWidth: 1 }}>
        {formattedData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="caption">No data available. Upload data to view chart.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256} minWidth={0}>
            <BarChart data={formattedData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="displayDate"
                stroke={AXIS_COLOR}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                dy={4}
                tick={{ fill: AXIS_COLOR }}
              />
              <YAxis
                stroke={AXIS_COLOR}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                dx={-4}
                tick={{ fill: AXIS_COLOR }}
                width={28}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2, fontSize: '11px' }}
                formatter={(value) => [`${Number(value ?? 0).toFixed(1)} units`, 'Load']}
                cursor={{ fill: 'var(--bg-subtle)', opacity: 0.5 }}
              />
              <ReferenceLine
                y={avgLoad}
                stroke={REF_LINE_COLOR}
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.7}
              />
              <Bar
                dataKey="avgLoad"
                fill={CHART_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[10px] text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-performance)]" />
          Load
        </span>
        <span>Avg: {avgLoad.toFixed(0)}</span>
      </div>
    </ChartPanel>
  );
}
