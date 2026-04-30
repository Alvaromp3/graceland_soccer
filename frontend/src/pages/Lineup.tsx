import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Users, 
  Zap, 
  TrendingUp, 
  Shield, 
  Target,
  ChevronRight,
  Activity,
  Gauge,
  Trophy,
  BarChart3,
  Calculator,
  Play,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  Legend,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { playersApi, analysisApi, useDataStatus } from '../services/api';
import { useTeam } from '../contexts/useTeam';
import type { Player } from '../types';
import Chart3D from '../components/charts/Chart3D';

type CriteriaType = 'balanced' | 'speed' | 'load' | 'lowRisk' | 'highIntensity';

// Field layout positions (x%, y%) for 11 players - matches slot positions below
const fieldLayout = [
  { x: 50, y: 88 },  // 0: GK
  { x: 18, y: 68 },  // 1: LB
  { x: 38, y: 72 },  // 2: CB
  { x: 62, y: 72 },  // 3: CB
  { x: 82, y: 68 },  // 4: RB
  { x: 28, y: 48 },  // 5: MID
  { x: 50, y: 42 },  // 6: MID
  { x: 72, y: 48 },  // 7: MID
  { x: 20, y: 22 },  // 8: LW
  { x: 50, y: 15 },  // 9: ST
  { x: 80, y: 22 },  // 10: RW
];

// Allowed positions per slot (4-3-3: GK, LB, CB, CB, RB, CM x3, LW, ST, RW)
const slotPositions: string[][] = [
  ['GK'],                                    // 0
  ['LB'],                                    // 1
  ['CB'],                                    // 2
  ['CB'],                                    // 3
  ['RB'],                                    // 4
  ['CDM', 'CM'],                             // 5
  ['CM', 'CAM'],                             // 6
  ['CDM', 'CM', 'CAM'],                      // 7
  ['LW'],                                    // 8
  ['ST', 'CF'],                              // 9
  ['RW'],                                    // 10
];

const criteriaConfig: Record<CriteriaType, { label: string; description: string; icon: typeof Zap; color: string; gradient: string }> = {
  balanced: { label: 'Balanced', description: 'Best overall', icon: Trophy, color: 'cyan', gradient: 'from-cyan-500 to-blue-600' },
  speed: { label: 'Max Speed', description: 'Fastest players', icon: Gauge, color: 'blue', gradient: 'from-[#1e40af] to-[#3b82f6]' },
  load: { label: 'High Load', description: 'Work capacity', icon: Zap, color: 'orange', gradient: 'from-orange-500 to-red-600' },
  lowRisk: { label: 'Low Risk', description: 'Safest players', icon: Shield, color: 'blue', gradient: 'from-[#1e40af] to-[#3b82f6]' },
  highIntensity: { label: 'Intensity', description: 'Match ready', icon: Activity, color: 'red', gradient: 'from-red-500 to-rose-600' },
};

export default function Lineup() {
  const [selectedCriteria, setSelectedCriteria] = useState<CriteriaType>('balanced');
  const [activeTab, setActiveTab] = useState<'lineup' | 'comparison' | 'stats' | 'prediction'>('lineup');
  const [selectedPlayerForPrediction, setSelectedPlayerForPrediction] = useState<string>('');
  const [sessionType, setSessionType] = useState<'match' | 'training'>('match');

  const { currentTeam } = useTeam();
  const { data: dataStatus } = useDataStatus();

  const { data: players, isLoading } = useQuery({
    queryKey: ['players'],
    queryFn: playersApi.getAll,
    enabled: !!dataStatus?.loaded,
  });

  // Predict load: backend fetches player metrics (single request, avoids 404 from getDetail)
  const predictLoadMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const player = players?.find(p => p.id === playerId);
      if (!player) throw new Error('Player not found');

      const result = await analysisApi.predictLoad({
        playerId,
        sessionType,
        features: {}, // backend fills from get_player_detail when empty
      });

      return { player, result };
    },
  });

  // Score a player for the current criteria (higher = better)
  const scorePlayer = useMemo(() => {
    const riskOrder = { low: 1, medium: 0.7, high: 0.4 };
    const riskOrderLowFirst = { low: 0, medium: 1, high: 2 };
    return (p: Player) => {
      switch (selectedCriteria) {
        case 'speed':
          return p.avgSpeed;
        case 'load':
          return p.avgLoad;
        case 'lowRisk':
          return 1000 - riskOrderLowFirst[p.riskLevel] * 500 + p.avgSpeed;
        case 'highIntensity':
          return p.avgLoad * p.avgSpeed;
        case 'balanced':
        default:
          return (p.avgSpeed / 25) * 0.3 + (p.avgLoad / 600) * 0.3 + riskOrder[p.riskLevel] * 0.4;
      }
    };
  }, [selectedCriteria]);

  // Generate best lineup by position: fill each slot with best available player for that position
  const bestLineup = useMemo(() => {
    if (!players || players.length < 11) return [];

    const result: (Player | null)[] = new Array(11).fill(null);
    let remaining = [...players];

    for (let slot = 0; slot < 11; slot++) {
      const allowed = slotPositions[slot];
      const candidates = remaining.filter((p) => allowed.includes(p.position));
      const pool = candidates.length > 0 ? candidates : remaining;
      pool.sort((a, b) => scorePlayer(b) - scorePlayer(a));
      const chosen = pool[0];
      if (chosen) {
        result[slot] = chosen;
        remaining = remaining.filter((p) => p.id !== chosen.id);
      }
    }

    return result.filter((p): p is Player => p !== null);
  }, [players, scorePlayer]);

  // Stats for the lineup
  const lineupStats = useMemo(() => {
    if (!bestLineup.length) return null;
    
    const avgSpeed = bestLineup.reduce((sum, p) => sum + p.avgSpeed, 0) / bestLineup.length;
    const avgLoad = bestLineup.reduce((sum, p) => sum + p.avgLoad, 0) / bestLineup.length;
    const totalSessions = bestLineup.reduce((sum, p) => sum + p.sessions, 0);
    const riskCounts = {
      low: bestLineup.filter(p => p.riskLevel === 'low').length,
      medium: bestLineup.filter(p => p.riskLevel === 'medium').length,
      high: bestLineup.filter(p => p.riskLevel === 'high').length,
    };

    return { avgSpeed, avgLoad, totalSessions, riskCounts };
  }, [bestLineup]);

  // Radar data for lineup
  const radarData = useMemo(() => {
    if (!lineupStats) return [];
    return [
      { metric: 'Speed', value: (lineupStats.avgSpeed / 25) * 100, fullMark: 100 },
      { metric: 'Load', value: (lineupStats.avgLoad / 600) * 100, fullMark: 100 },
      { metric: 'Low Risk', value: (lineupStats.riskCounts.low / 11) * 100, fullMark: 100 },
      { metric: 'Experience', value: Math.min(100, (lineupStats.totalSessions / 200) * 100), fullMark: 100 },
      { metric: 'Fitness', value: 100 - (lineupStats.riskCounts.high / 11) * 100, fullMark: 100 },
    ];
  }, [lineupStats]);

  // Bar chart data for player comparison
  const comparisonData = useMemo(() => {
    return bestLineup.map(p => ({
      name: p.name.split(' ')[0],
      speed: p.avgSpeed,
      load: p.avgLoad / 10,
      risk: p.riskLevel === 'low' ? 100 : p.riskLevel === 'medium' ? 60 : 30,
    }));
  }, [bestLineup]);

  // Risk distribution pie chart
  const riskPieData = useMemo(() => {
    if (!lineupStats) return [];
    return [
      { name: 'Low Risk', value: lineupStats.riskCounts.low, color: '#22c55e' },
      { name: 'Medium Risk', value: lineupStats.riskCounts.medium, color: '#eab308' },
      { name: 'High Risk', value: lineupStats.riskCounts.high, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [lineupStats]);

  const teamLabel = currentTeam === 'mens' ? 'Men\'s Team' : 'Women\'s Team';

  // No data state for current team
  if (!dataStatus?.loaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="panel panel--elevated p-8 max-w-md text-center">
          <Trophy className="w-10 h-10 mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="section-title mb-2">No data</h2>
          <p className="caption mb-6">Upload a CSV for {teamLabel} in the Dashboard to generate lineups.</p>
          <a href="/" className="btn btn--primary gap-2">
            Go to Dashboard
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-performance)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const config = criteriaConfig[selectedCriteria];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="caption">Optimal XI and load prediction</p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)]">
          <config.icon className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
        </div>
      </div>

      {/* Criteria */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(criteriaConfig) as [CriteriaType, typeof criteriaConfig.balanced][]).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const isSelected = selectedCriteria === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCriteria(key)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-[var(--accent-performance-muted)] border-[var(--accent-performance)] text-[var(--accent-performance)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto">
        {[
          { id: 'lineup', label: 'Lineup', icon: Users },
          { id: 'comparison', label: 'Compare', icon: BarChart3 },
          { id: 'stats', label: 'Stats', icon: Activity },
          { id: 'prediction', label: 'Predict Load', icon: Calculator },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[var(--accent-performance-muted)] text-[var(--accent-performance)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'lineup' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Field — realistic grass, minimal markings */}
          <div className="lg:col-span-2 panel panel--elevated p-4">
            <h3 className="section-title mb-4">Best XI — {config.label}</h3>
            <div
              className="relative w-full aspect-[4/5] max-h-[500px] overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #1a4d2e 0%, #2d6a3e 25%, #3d7a4a 50%, #2d6a3e 75%, #1a4d2e 100%)',
                boxShadow: 'inset 0 0 80px rgba(0,0,0,0.15)',
              }}
            >
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)' }} />
              <div className="absolute inset-[3%] border-[2px] border-white/50" style={{ borderRadius: '2px' }} />
              <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[35%] h-[16%] border-[2px] border-white/50 border-t-0" style={{ borderRadius: '0 0 2px 2px' }} />
              <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[12%] h-[6%] border-[2px] border-white/50 border-t-0" style={{ borderRadius: '0 0 2px 2px' }} />
              <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 w-[35%] h-[16%] border-[2px] border-white/50 border-b-0" style={{ borderRadius: '2px 2px 0 0' }} />
              <div className="absolute bottom-[3%] left-1/2 -translate-x-1/2 w-[12%] h-[6%] border-[2px] border-white/50 border-b-0" style={{ borderRadius: '2px 2px 0 0' }} />
              <div className="absolute top-1/2 left-[3%] right-[3%] h-[1px] bg-white/50 -translate-y-1/2" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[22%] h-[22%] border-[2px] border-white/50 rounded-full" />
              <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-white/70 -translate-x-1/2 -translate-y-1/2" />

              {fieldLayout.map((pos, idx) => {
                const player = bestLineup[idx];
                if (!player) return null;
                const riskBorder = player.riskLevel === 'high' ? 'border-[var(--risk-high)]' : player.riskLevel === 'medium' ? 'border-[var(--risk-medium)]' : 'border-white/60';
                return (
                  <div
                    key={player.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-default"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    <div className={`w-11 h-11 rounded-full bg-white/95 flex flex-col items-center justify-center border-2 ${riskBorder} text-[var(--bg-app)] shadow-md group-hover:scale-105 transition-transform`}>
                      <span className="text-xs font-bold leading-none">{player.number}</span>
                      <span className="text-[8px] font-medium leading-tight opacity-90">{player.position}</span>
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)] px-2 py-1 rounded text-center whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 text-[11px] text-[var(--text-primary)] shadow-lg">
                      {player.name} · {player.avgSpeed} mph
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bench list */}
          <div className="panel panel--elevated p-4">
            <h3 className="section-title mb-3">Selected</h3>
            <ul className="space-y-1.5 max-h-[420px] overflow-y-auto custom-scrollbar">
              {(['GK', 'LB', 'CB', 'CB', 'RB', 'MID', 'MID', 'MID', 'LW', 'ST', 'RW'] as const).map((slotLabel, idx) => {
                const player = bestLineup[idx];
                if (!player) return null;
                return (
                  <li
                    key={player.id}
                    className="flex items-center gap-2 py-2 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  >
                    <span className="w-8 h-8 flex-shrink-0 rounded flex items-center justify-center text-[10px] font-semibold border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                      {slotLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{player.name}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">#{player.number} · {player.position} · {player.avgSpeed} mph</p>
                    </div>
                    <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded risk-badge--${player.riskLevel}`}>
                      {player.riskLevel}
                    </span>
                  </li>
                );
              })}
            </ul>
            {lineupStats && (
              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex gap-4">
                <div>
                  <p className="metric-value text-lg">{lineupStats.avgSpeed.toFixed(1)}</p>
                  <p className="metric-label">Avg Speed</p>
                </div>
                <div>
                  <p className="metric-value text-lg">{lineupStats.avgLoad.toFixed(0)}</p>
                  <p className="metric-label">Avg Load</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'comparison' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Chart3D tilt={3} className="p-6">
            <h3 className="font-semibold text-[#1e293b] mb-4 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-[#1e40af]" />
              Speed Comparison (mph)
            </h3>
            <p className="text-xs text-[#64748b] mb-3">Max speed per player — higher is better</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} tick={{ fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={72} tick={{ fill: '#334155', fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    }}
                    formatter={(value) => [`${Number(value ?? 0).toFixed(1)} mph`, 'Speed']}
                    labelFormatter={(label) => `Player: ${label}`}
                  />
                  <Bar dataKey="speed" fill="url(#lineupSpeedGrad)" radius={[0, 6, 6, 0]} name="Speed (mph)" maxBarSize={28} />
                  <defs>
                    <linearGradient id="lineupSpeedGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#1e40af" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>

          <Chart3D tilt={-2} className="p-6">
            <h3 className="font-semibold text-[#1e293b] mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#ea580c]" />
              Load Comparison (units)
            </h3>
            <p className="text-xs text-[#64748b] mb-3">Training load per player — compare workload</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} tick={{ fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={72} tick={{ fill: '#334155', fontWeight: 600 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    }}
                    formatter={(value) => [`${(Number(value ?? 0) * 10).toFixed(0)}`, 'Load']}
                    labelFormatter={(label) => `Player: ${label}`}
                  />
                  <Bar dataKey="load" fill="url(#lineupLoadGrad)" radius={[0, 6, 6, 0]} name="Load" maxBarSize={28} />
                  <defs>
                    <linearGradient id="lineupLoadGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>

          <Chart3D tilt={2} className="p-6 lg:col-span-2">
            <h3 className="font-semibold text-[#1e293b] mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#1e40af]" />
              Performance Trend
            </h3>
            <p className="text-xs text-[#64748b] mb-3">Speed (mph) vs Fitness % by player — compare both metrics</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparisonData} margin={{ top: 8, right: 16, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tick={{ fill: '#334155' }} />
                  <YAxis yAxisId="left" stroke="#64748b" fontSize={11} tick={{ fill: '#64748b' }} label={{ value: 'Speed (mph)', angle: -90, position: 'insideLeft', style: { fill: '#1e40af', fontSize: 11 } }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} tick={{ fill: '#64748b' }} domain={[0, 100]} label={{ value: 'Fitness %', angle: 90, position: 'insideRight', style: { fill: '#ea580c', fontSize: 11 } }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    }}
                    formatter={(value, name) => [String(name) === 'Speed' ? `${Number(value ?? 0).toFixed(1)} mph` : `${Number(value ?? 0).toFixed(0)}%`, String(name ?? '')]}
                    labelFormatter={(label) => `Player: ${label}`}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="speed" stroke="#1e40af" strokeWidth={2.5} dot={{ fill: '#1e40af', strokeWidth: 2, r: 4 }} name="Speed (mph)" />
                  <Line yAxisId="right" type="monotone" dataKey="risk" stroke="#ea580c" strokeWidth={2.5} dot={{ fill: '#ea580c', strokeWidth: 2, r: 4 }} name="Fitness %" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Chart3D>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              Team Profile
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Radar
                    name="Team"
                    dataKey="value"
                    stroke="#8b5cf6"
                    fill="url(#radarGradient)"
                    strokeWidth={2}
                  />
                  <defs>
                    <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#1e40af]" />
              Risk Distribution
            </h3>
            <div className="h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="value"
                    strokeWidth={0}
                    paddingAngle={4}
                  >
                    {riskPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(51, 65, 85, 0.5)',
                      borderRadius: '12px',
                    }}
                    formatter={(value) => [`${value} players`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">11</p>
                  <p className="text-[10px] text-slate-500">Players</p>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {riskPieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-[10px] text-slate-400">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-slate-400" />
              Team Summary
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Avg Speed', value: lineupStats?.avgSpeed.toFixed(1), unit: 'mph', color: 'cyan', max: 25 },
                { label: 'Avg Load', value: lineupStats?.avgLoad.toFixed(0), unit: '', color: 'orange', max: 600 },
                { label: 'Team Fitness', value: lineupStats ? Math.round((lineupStats.riskCounts.low / 11) * 100) : 0, unit: '%', color: 'blue', max: 100 },
              ].map((stat) => (
                <div key={stat.label} className="p-4 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">{stat.label}</span>
                    <span className={`text-${stat.color}-400 font-bold`}>{stat.value}{stat.unit}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full bg-gradient-to-r from-${stat.color}-500 to-${stat.color}-400 rounded-full transition-all duration-500`}
                      style={{ width: `${(parseFloat(stat.value?.toString() || '0') / stat.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              
              <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Total Sessions</span>
                  <span className="text-purple-400 font-bold">{lineupStats?.totalSessions}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'prediction' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prediction Form */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <Calculator className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Predict Player Load</h3>
                <p className="text-sm text-slate-500">Calculate expected load for next session</p>
              </div>
            </div>

            {/* Session Type */}
            <div className="mb-5">
              <label className="block text-sm text-slate-400 mb-3">Session Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSessionType('match')}
                  className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                    sessionType === 'match'
                      ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border-orange-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Trophy className={`w-5 h-5 ${sessionType === 'match' ? 'text-orange-400' : 'text-slate-400'}`} />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${sessionType === 'match' ? 'text-white' : 'text-slate-300'}`}>Match</p>
                    <p className="text-[10px] text-slate-500">+15% load factor</p>
                  </div>
                </button>
                <button
                  onClick={() => setSessionType('training')}
                  className={`p-4 rounded-xl border transition-all flex items-center gap-3 ${
                    sessionType === 'training'
                      ? 'bg-cyan-500/20 border-cyan-500/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Activity className={`w-5 h-5 ${sessionType === 'training' ? 'text-slate-300' : 'text-slate-400'}`} />
                  <div className="text-left">
                    <p className={`text-sm font-medium ${sessionType === 'training' ? 'text-white' : 'text-slate-300'}`}>Training</p>
                    <p className="text-[10px] text-slate-500">Standard load</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Player Selection */}
            <div className="mb-5">
              <label className="block text-sm text-slate-400 mb-2">Select Player</label>
              <select
                value={selectedPlayerForPrediction}
                onChange={(e) => setSelectedPlayerForPrediction(e.target.value)}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="">-- Select a player --</option>
                {players?.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name} (#{player.number})
                  </option>
                ))}
              </select>
            </div>

            {/* Predict Button */}
            <button
              onClick={() => predictLoadMutation.mutate(selectedPlayerForPrediction)}
              disabled={!selectedPlayerForPrediction || predictLoadMutation.isPending}
              className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-600 border border-cyan-500/30 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
            >
              {predictLoadMutation.isPending ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Predict Load
                </>
              )}
            </button>
          </div>

          {/* Prediction Result */}
          <div className="card p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#1e40af]" />
              Prediction Result
            </h3>

            {!predictLoadMutation.data && !predictLoadMutation.error && (
              <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                    <Calculator className="w-8 h-8 text-slate-500" />
                  </div>
                  <p>Select a player and click Predict</p>
                  <p className="text-[10px] text-slate-600 mt-1">to see expected load for next session</p>
                </div>
              </div>
            )}

            {predictLoadMutation.error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-sm text-red-400">Error: {(predictLoadMutation.error as Error).message}</p>
              </div>
            )}

            {predictLoadMutation.data && (
              <div className="space-y-4 animate-slide-in-up">
                {/* Player Info */}
                <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                  <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-lg">
                    {predictLoadMutation.data.player.number}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{predictLoadMutation.data.player.name}</p>
                    <p className="text-xs text-slate-500">{sessionType === 'match' ? 'Match' : 'Training'} Prediction</p>
                  </div>
                </div>

                {/* Predicted Load */}
                <div className="p-6 bg-white/5 border border-white/10 rounded-xl text-center relative overflow-hidden">
                  <p className="text-sm text-slate-400 mb-2 relative">Predicted Player Load</p>
                  <p className="text-6xl font-bold text-white relative">
                    {predictLoadMutation.data.result.predictedLoad?.toFixed(0) || 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2 relative">Based on ML model analysis</p>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white/5 rounded-lg text-center border border-white/5">
                    <p className="text-xs text-slate-500">Historical Avg</p>
                    <p className="text-lg font-bold text-white">{predictLoadMutation.data.player.avgLoad.toFixed(0)}</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg text-center border border-white/5">
                    <p className="text-xs text-slate-500">Sessions</p>
                    <p className="text-lg font-bold text-white">{predictLoadMutation.data.player.sessions}</p>
                  </div>
                </div>

                {/* Note */}
                <div className="p-3 bg-white/5 rounded-lg flex items-start gap-2 border border-white/5">
                  <Clock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-500">
                    Prediction uses regression model trained on historical data.
                    {sessionType === 'match' && ' Match sessions include +15% intensity factor.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
