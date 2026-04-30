import { useQuery } from '@tanstack/react-query';
import { BarChart3, Users, Activity, Gauge, Zap } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import ChartPanel from '../components/charts/ChartPanel';
import { analysisApi } from '../services/api';

const iconMap: Record<string, typeof Users> = {
  totalPlayers: Users,
  avgTeamLoad: Zap,
  highRiskPlayers: Activity,
  avgTeamSpeed: Gauge,
};

export default function TeamComparison() {
  const { data, isLoading } = useQuery({
    queryKey: ['analysis', 'team-comparison'],
    queryFn: analysisApi.getTeamComparison,
  });

  const mensLoaded = Boolean(data?.teams?.mens?.loaded);
  const womensLoaded = Boolean(data?.teams?.womens?.loaded);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin w-8 h-8 border-2 border-[var(--accent-performance)] border-t-transparent rounded-full" /></div>;
  }

  if (!mensLoaded && !womensLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="panel panel--elevated p-12 text-center max-w-xl">
          <BarChart3 className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-4" />
          <h2 className="section-title mb-2">Team comparison</h2>
          <p className="caption">Load both team datasets in the Dashboard to compare them.</p>
        </div>
      </div>
    );
  }

  const metricBars = (data?.metrics || []).map((metric) => ({
    name: metric.label,
    Mens: metric.mensValue,
    Womens: metric.womensValue,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Team Comparison</h1>
        <p className="caption mt-1">Dual-team comparison backed by both persisted datasets.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['mens', 'womens'].map((teamKey) => {
          const team = data?.teams?.[teamKey];
          const label = teamKey === 'mens' ? "Men's Team" : "Women's Team";
          const performer = team?.topPerformers?.[0];
          return (
            <div key={teamKey} className="panel panel--elevated p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title">{label}</h2>
                <span className={`text-xs px-2 py-1 rounded ${team?.loaded ? 'bg-[var(--accent-performance-muted)] text-[var(--accent-performance)]' : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]'}`}>
                  {team?.loaded ? 'Loaded' : 'Missing'}
                </span>
              </div>
              {team?.kpis ? (
                <div className="space-y-2 text-sm">
                  <p className="text-[var(--text-secondary)]">Players: <span className="text-[var(--text-primary)] font-semibold">{team.kpis.totalPlayers}</span></p>
                  <p className="text-[var(--text-secondary)]">Average Load: <span className="text-[var(--text-primary)] font-semibold">{team.kpis.avgTeamLoad.toFixed(1)}</span></p>
                  <p className="text-[var(--text-secondary)]">High Risk: <span className="text-[var(--text-primary)] font-semibold">{team.kpis.highRiskPlayers}</span></p>
                  <p className="text-[var(--text-secondary)]">Top Performer: <span className="text-[var(--text-primary)] font-semibold">{performer?.name || 'N/A'}</span></p>
                </div>
              ) : (
                <p className="caption">No dataset loaded for this team.</p>
              )}
            </div>
          );
        })}
      </div>

      <ChartPanel title="Performance Delta" subtitle="Direct KPI comparison across both teams" className="p-5">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metricBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={12} />
              <YAxis stroke="var(--text-tertiary)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.96)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Bar dataKey="Mens" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Womens" fill="#ea580c" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data?.metrics || []).map((metric) => {
          const Icon = iconMap[metric.key] || BarChart3;
          return (
            <div key={metric.key} className="panel p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[var(--accent-performance)]" />
                <h3 className="section-title">{metric.label}</h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">Men: <span className="text-[var(--text-primary)] font-semibold">{metric.mensValue.toFixed(1)}</span></p>
              <p className="text-sm text-[var(--text-secondary)]">Women: <span className="text-[var(--text-primary)] font-semibold">{metric.womensValue.toFixed(1)}</span></p>
              <p className={`text-sm mt-2 font-medium ${metric.difference >= 0 ? 'text-[var(--accent-performance)]' : 'text-[var(--accent-risk-high)]'}`}>
                Difference: {metric.difference >= 0 ? '+' : ''}{metric.difference.toFixed(1)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
