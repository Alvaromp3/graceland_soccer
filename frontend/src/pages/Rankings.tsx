import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Trophy, 
  Zap, 
  Gauge, 
  Activity, 
  TrendingUp, 
  Target,
  Award,
  Medal,
  Flame,
  Bolt,
  Wind,
  BarChart3,
  Users,
  TrendingDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { playersApi, useDataStatus } from '../services/api';
import { useTeam } from '../contexts/useTeam';
import Chart3D from '../components/charts/Chart3D';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  CartesianGrid
} from 'recharts';

interface RankingMetric {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  unit: string;
  key: string;
}

const metrics: RankingMetric[] = [
  {
    id: 'player_load',
    name: 'Player Load',
    description: 'Average player load',
    icon: Zap,
    color: '#1e40af',
    unit: 'units',
    key: 'player_load'
  },
  {
    id: 'total_distance',
    name: 'Total Distance',
    description: 'Who runs the most (total)',
    icon: Activity,
    color: '#3b82f6',
    unit: 'miles',
    key: 'total_distance'
  },
  {
    id: 'distance',
    name: 'Average Distance',
    description: 'Average distance per session',
    icon: TrendingUp,
    color: '#1e40af',
    unit: 'miles',
    key: 'distance'
  },
  {
    id: 'total_sprints',
    name: 'Total Sprints',
    description: 'Total sprints performed',
    icon: Bolt,
    color: '#f97316',
    unit: 'yards',
    key: 'total_sprints'
  },
  {
    id: 'sprint_distance',
    name: 'Sprint Distance',
    description: 'Average distance in sprints',
    icon: Wind,
    color: '#f97316',
    unit: 'yards',
    key: 'sprint_distance'
  },
  {
    id: 'max_speed',
    name: 'Maximum Speed',
    description: 'Maximum speed reached',
    icon: Gauge,
    color: '#dc2626',
    unit: 'mph',
    key: 'max_speed'
  },
  {
    id: 'top_speed',
    name: 'Average Speed',
    description: 'Average maximum speed',
    icon: BarChart3,
    color: '#3b82f6',
    unit: 'mph',
    key: 'top_speed'
  },
  {
    id: 'work_ratio',
    name: 'Intensity (Work Ratio)',
    description: 'Average work ratio',
    icon: Flame,
    color: '#f97316',
    unit: '',
    key: 'work_ratio'
  },
  {
    id: 'max_intensity',
    name: 'Maximum Intensity',
    description: 'Maximum intensity reached',
    icon: Target,
    color: '#dc2626',
    unit: '',
    key: 'max_intensity'
  },
  {
    id: 'total_energy',
    name: 'Total Energy',
    description: 'Total energy consumed',
    icon: Zap,
    color: '#1e40af',
    unit: 'kcal',
    key: 'total_energy'
  },
  {
    id: 'energy',
    name: 'Average Energy',
    description: 'Average energy per session',
    icon: Activity,
    color: '#1e40af',
    unit: 'kcal',
    key: 'energy'
  },
  {
    id: 'max_power',
    name: 'Maximum Power',
    description: 'Maximum power generated',
    icon: Bolt,
    color: '#f97316',
    unit: 'w/kg',
    key: 'max_power'
  },
  {
    id: 'power_score',
    name: 'Average Power',
    description: 'Average relative power',
    icon: Trophy,
    color: '#3b82f6',
    unit: 'w/kg',
    key: 'power_score'
  },
  {
    id: 'max_acceleration',
    name: 'Maximum Acceleration',
    description: 'Maximum acceleration reached',
    icon: TrendingUp,
    color: '#1e40af',
    unit: 'yd/s²',
    key: 'max_acceleration'
  },
  {
    id: 'distance_per_min',
    name: 'Distance per Minute',
    description: 'Average work pace',
    icon: BarChart3,
    color: '#3b82f6',
    unit: 'yd/min',
    key: 'distance_per_min'
  },
  {
    id: 'total_impacts',
    name: 'Total Impacts',
    description: 'Total impacts received',
    icon: Target,
    color: '#a855f7',
    unit: '',
    key: 'total_impacts'
  }
];

function getRankIcon(rank: number) {
  if (rank === 1) return <Trophy className="w-5 h-5" style={{ color: '#f59e0b' }} strokeWidth={2.5} />;
  if (rank === 2) return <Medal className="w-5 h-5" style={{ color: '#94a3b8' }} strokeWidth={2.5} />;
  if (rank === 3) return <Medal className="w-5 h-5" style={{ color: '#ea580c' }} strokeWidth={2.5} />;
  return <Award className="w-4 h-4" style={{ color: '#cbd5e1' }} strokeWidth={2} />;
}

function formatValue(value: number): string {
  if (value === 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

export default function Rankings() {
  const [selectedMetric, setSelectedMetric] = useState<string>('player_load');
  const { currentTeam } = useTeam();
  const { data: dataStatus } = useDataStatus();
  
  const currentMetric = metrics.find(m => m.id === selectedMetric) || metrics[0];
  
  const { data: rankings, isLoading } = useQuery({
    queryKey: ['rankings', selectedMetric],
    queryFn: () => playersApi.getRankings(selectedMetric),
    enabled: !!dataStatus?.loaded,
  });

  const teamLabel = currentTeam === 'mens' ? 'Men\'s Team' : 'Women\'s Team';

  // Prepare chart data - Estilo Catapult profesional
  const chartData = useMemo(() => {
    if (!rankings || rankings.length === 0) return [];
    const top10 = rankings.slice(0, 10);
    const maxValue = Math.max(...top10.map((p) => p.metrics[currentMetric.key] ?? 0));
    const avgValue = top10.reduce((sum, p) => sum + (p.metrics[currentMetric.key] ?? 0), 0) / top10.length;
    
    return top10.map((player) => ({
      name: player.name.split(' ').pop() || player.name,
      fullName: player.name,
      value: player.metrics[currentMetric.key] ?? 0,
      percentage: maxValue > 0 ? ((player.metrics[currentMetric.key] ?? 0) / maxValue) * 100 : 0,
      rank: player.rank,
      sessions: player.metrics.sessions ?? 0,
      isAboveAvg: (player.metrics[currentMetric.key] ?? 0) > avgValue
    }));
  }, [rankings, currentMetric]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!rankings || rankings.length === 0) return null;
    const values = rankings.map((p) => p.metrics[currentMetric.key] ?? 0);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;
    const topPlayer = rankings[0];
    
    return { maxValue, minValue, avgValue, topPlayer };
  }, [rankings, currentMetric]);

  if (!dataStatus?.loaded) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="card p-8 max-w-md text-center">
          <h2 className="text-xl font-bold title-3d mb-2">No Data Available</h2>
          <p className="text-sm text-[#64748b] mb-6">
            Upload a CSV for {teamLabel} in Dashboard to view rankings.
          </p>
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1e40af] hover:bg-[#3b82f6] text-white font-semibold text-sm uppercase transition-colors rounded-lg" style={{ letterSpacing: '0.5px' }}>
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - Professional Style */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold title-3d">Player Rankings</h1>
            <p className="text-sm text-field-muted mt-1">{teamLabel} • Performance Metrics</p>
          </div>
          {rankings && rankings.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg">
              <Users className="w-4 h-4 text-[#1e40af]" />
              <span className="text-sm font-semibold text-[#1e293b]">{rankings.length} Players</span>
            </div>
          )}
        </div>
      </div>

      {/* Metric selector - simple dropdown */}
      <div className="card p-4">
        <label htmlFor="metric-select" className="block text-sm font-semibold text-[#1e293b] mb-2">
          Metric
        </label>
        <select
          id="metric-select"
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="w-full max-w-xs px-4 py-2.5 rounded-lg border border-[#e2e8f0] bg-white text-[#1e293b] font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#1e40af] focus:border-[#1e40af]"
        >
          {metrics.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Stats Summary - Professional Style */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4 bg-white">
            <p className="text-xs font-semibold text-[#64748b] uppercase mb-1" style={{ letterSpacing: '0.5px' }}>Top Performer</p>
            <p className="text-lg font-bold text-[#1e293b] mb-1">{stats.topPlayer?.name}</p>
            <p className="text-sm font-semibold" style={{ color: currentMetric.color }}>
              {formatValue(stats.maxValue)} {currentMetric.unit}
            </p>
          </div>
          <div className="card p-4 bg-white">
            <p className="text-xs font-semibold text-[#64748b] uppercase mb-1" style={{ letterSpacing: '0.5px' }}>Average</p>
            <p className="text-2xl font-bold text-[#1e293b] mb-1">{formatValue(stats.avgValue)}</p>
            <p className="text-xs text-[#64748b]">{currentMetric.unit}</p>
          </div>
          <div className="card p-4 bg-white">
            <p className="text-xs font-semibold text-[#64748b] uppercase mb-1" style={{ letterSpacing: '0.5px' }}>Range</p>
            <p className="text-sm font-semibold text-[#1e293b] mb-1">
              {formatValue(stats.minValue)} - {formatValue(stats.maxValue)}
            </p>
            <p className="text-xs text-[#64748b]">{currentMetric.unit}</p>
          </div>
          <div className="card p-4 bg-white">
            <p className="text-xs font-semibold text-[#64748b] uppercase mb-1" style={{ letterSpacing: '0.5px' }}>Players</p>
            <p className="text-2xl font-bold text-[#1e293b] mb-1">{rankings?.length || 0}</p>
            <p className="text-xs text-[#64748b]">in ranking</p>
          </div>
        </div>
      )}

      {/* Chart - 3D style, clear labels */}
      {chartData.length > 0 && (
        <Chart3D tilt={3} className="p-6">
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-on-field" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>{currentMetric.name}</h2>
                <p className="text-xs text-field-muted">Top 10 Players — {currentMetric.description}</p>
              </div>
              {stats && (
                <div className="text-right">
                  <p className="text-xs text-field-muted uppercase font-semibold" style={{ letterSpacing: '0.5px' }}>Average</p>
                  <p className="text-sm font-semibold text-on-field" style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>{formatValue(stats.avgValue)} {currentMetric.unit}</p>
                </div>
              )}
            </div>

            <div className="h-96 w-full" style={{ minHeight: 384, minWidth: 1 }}>
            <ResponsiveContainer width="100%" height={384} minWidth={0}>
              <BarChart 
                data={chartData} 
                layout="vertical"
                margin={{ top: 10, right: 40, left: 100, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={true} vertical={false} />
                <XAxis 
                  type="number" 
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(value) => formatValue(Number(value))}
                />
                <YAxis 
                  dataKey="name" 
                  type="category"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  tick={{ fill: '#334155', fontWeight: 600 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    padding: '10px 12px'
                  }}
                  labelStyle={{ 
                    color: '#1e293b', 
                    fontWeight: 600,
                    marginBottom: '6px',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: '#334155', fontSize: '13px' }}
                  formatter={(value) => {
                    return [
                      `${formatValue(Number(value ?? 0))} ${currentMetric.unit}`,
                      currentMetric.name
                    ];
                  }}
                  labelFormatter={(label) => `Player: ${chartData.find(d => d.name === label)?.fullName || label}`}
                  cursor={{ stroke: currentMetric.color, strokeWidth: 1, strokeDasharray: '5 5', opacity: 0.3 }}
                />
                {stats && (
                  <ReferenceLine 
                    x={stats.avgValue} 
                    stroke={currentMetric.color}
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    label={{ value: 'Avg', position: 'right', fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  />
                )}
                <Bar 
                  dataKey="value" 
                  radius={[0, 6, 6, 0]}
                  fill={currentMetric.color}
                >
                  {chartData.map((entry, index) => {
                    const isTopThree = entry.rank <= 3;
                    const opacity = isTopThree ? 1 : 0.7;
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={currentMetric.color}
                        style={{
                          opacity: opacity,
                          transition: 'all 0.2s ease'
                        }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </>
        </Chart3D>
      )}

      {/* Full ranking - clean list */}
      <div className="card overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-[#e2e8f0] bg-white">
          <h2 className="text-lg font-bold text-[#1e293b]">{currentMetric.name} — Full Ranking</h2>
          <p className="text-sm text-[#64748b] mt-0.5">
            {rankings?.length ?? 0} players · unit: {currentMetric.unit || '—'}
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#e2e8f0] border-t-[#1e40af]" />
            <p className="text-[#64748b] mt-4 text-sm font-medium">Loading rankings...</p>
          </div>
        ) : !rankings || rankings.length === 0 ? (
          <div className="p-12 text-center">
            <Trophy className="w-12 h-12 mx-auto mb-4 text-[#cbd5e1]" strokeWidth={2} />
            <p className="font-semibold text-[#1e293b]">No data available</p>
            <p className="text-[#64748b] text-sm mt-2">Upload data in Dashboard to see rankings.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {rankings.map((player) => {
              const value = player.metrics[currentMetric.key] || 0;
              const isTopThree = player.rank <= 3;
              const maxValue = Math.max(...rankings.map((p) => p.metrics[currentMetric.key] || 0));
              const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const isAboveAvg = stats && value > stats.avgValue;

              return (
                <div
                  key={player.name}
                  className={`flex flex-wrap items-center gap-4 px-6 py-4 transition-colors hover:bg-[#f8fafc] sm:flex-nowrap ${
                    isTopThree ? 'bg-[#1e40af]/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-2 shrink-0">
                      {getRankIcon(player.rank)}
                      <span className="font-bold text-[#1e293b] w-6 text-right tabular-nums">{player.rank}</span>
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 shrink-0 flex items-center justify-center font-bold text-sm rounded-lg border-2 ${
                        isTopThree ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]'
                      }`}>
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-[#1e293b] truncate">{player.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                    <span className="text-base font-bold text-[#1e293b]">{formatValue(value)}</span>
                      {currentMetric.unit && <span className="text-xs text-[#64748b] ml-1">{currentMetric.unit}</span>}
                    </div>
                    <div className="w-24 sm:w-32 h-2 bg-[#e2e8f0] rounded-full overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: currentMetric.color }}
                      />
                    </div>
                    <span className="text-sm text-[#64748b] w-12 text-right">{player.metrics.sessions ?? 0} sess.</span>
                    {stats && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium w-14 ${isAboveAvg ? 'text-[#1e40af]' : 'text-[#64748b]'}`}>
                        {isAboveAvg ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={2.5} /> : <TrendingDown className="w-3.5 h-3.5" strokeWidth={2.5} />}
                        {isAboveAvg ? 'Above' : 'Below'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
