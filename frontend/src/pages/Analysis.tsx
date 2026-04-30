import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  BarChart3, 
  AlertTriangle, 
  TrendingUp, 
  Loader2, 
  CheckCircle, 
  Activity,
  Shield,
  Zap,
  Target,
  Heart,
  ArrowRight,
  Info,
  Bot,
  Sparkles,
  RefreshCw,
  Clock,
  Minus
} from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { playersApi, analysisApi, useDataStatus } from '../services/api';
import type { AIRecommendationBundle } from '../services/api';
import { useTeam } from '../contexts/useTeam';
import type { RiskPrediction, Player } from '../types';
import ReactMarkdown from 'react-markdown';

export default function Analysis() {
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [prediction, setPrediction] = useState<RiskPrediction | null>(null);
  const [selectedPlayerData, setSelectedPlayerData] = useState<Player | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendationBundle | null>(null);

  const { currentTeam } = useTeam();
  const { data: dataStatus } = useDataStatus();

  const { data: players } = useQuery({
    queryKey: ['players', currentTeam],
    queryFn: playersApi.getAll,
    enabled: !!dataStatus?.loaded,
  });

  const { data: teamAverage } = useQuery({
    queryKey: ['teamAverage', currentTeam],
    queryFn: analysisApi.getTeamAverage,
    enabled: !!dataStatus?.loaded,
  });

  const { data: analytics } = useQuery({
    queryKey: ['analysis', 'analytics', currentTeam, selectedPlayer || 'team'],
    queryFn: () => analysisApi.getAnalytics(selectedPlayer || undefined),
    // Show team/player comparisons immediately on selection (no need to run AI analysis first).
    enabled: !!dataStatus?.loaded && !!selectedPlayer,
  });

  // OpenRouter status query (AI recommendations provider)
  const { data: openRouterStatus } = useQuery({
    queryKey: ['openrouter', 'status'],
    queryFn: analysisApi.getOpenRouterStatus,
    staleTime: 30000,
  });

  // One backend round-trip: ML risk + OpenRouter coach text (no duplicate predict_risk / no double timeout)
  const analyzeMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const d = await analysisApi.getAIRecommendations(playerId);
      const risk: RiskPrediction = {
        playerId: d.playerId,
        playerName: d.playerName,
        riskLevel: d.riskLevel,
        probability: typeof d.probability === 'number' ? d.probability : 0,
        factors: Array.isArray(d.factors) ? d.factors : [],
        recommendations: Array.isArray(d.recommendations) ? d.recommendations : [],
        hasRecentData: d.hasRecentData,
        recentSessionCount: d.recentSessionCount,
      };
      return { risk, ai: d };
    },
    onMutate: () => {
      setPrediction(null);
      setAiRecommendations(null);
    },
    onSuccess: ({ risk, ai }) => {
      setPrediction(risk);
      setAiRecommendations(ai);
    },
    onError: (error: Error) => {
      console.error('Analyze error:', error);
      setPrediction(null);
      setAiRecommendations({
        aiSuccess: false,
        aiError: error.message || 'Failed to analyze',
        aiRecommendations: 'Analysis request failed. Ensure backend and OpenRouter are running, then try again.',
        playerId: selectedPlayer,
        playerName: selectedPlayerData?.name || 'Unknown',
        aiSource: 'openrouter',
        riskLevel: 'low',
      });
    },
  });

  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayer(playerId);
    
    if (playerId === 'team_average') {
      // Use team average data
      if (teamAverage) {
        setSelectedPlayerData({
          id: 'team_average',
          name: 'Team Average',
          number: 0,
          position: 'TEAM',
          riskLevel: teamAverage.riskLevel || 'low',
          avgLoad: teamAverage.avgLoad || 0,
          avgSpeed: teamAverage.avgSpeed || 0,
          sessions: teamAverage.sessions || 0,
          hasRecentData: teamAverage.hasRecentData || false,
          recentSessions: teamAverage.recentSessionCount || 0
        });
      } else {
        setSelectedPlayerData(null);
      }
    } else {
      const player = players?.find(p => p.id === playerId);
      setSelectedPlayerData(player || null);
    }
    
    setPrediction(null);
    setAiRecommendations(null);
  };

  const handlePredict = () => {
    if (selectedPlayer) {
      analyzeMutation.mutate(selectedPlayer);
    }
  };

  const riskConfig = {
    low: { 
      bg: 'bg-[#1e40af]/10', 
      text: 'text-[#1e40af]', 
      border: 'border-[#1e40af]/30',
      icon: CheckCircle,
      color: '#1e40af',
      gradient: 'from-[#1e40af] to-[#3b82f6]'
    },
    medium: { 
      bg: 'bg-[#f59e0b]/10', 
      text: 'text-[#f59e0b]', 
      border: 'border-[#f59e0b]/30',
      icon: AlertTriangle,
      color: '#f59e0b',
      gradient: 'from-[#f59e0b] to-[#fbbf24]'
    },
    high: { 
      bg: 'bg-[#dc2626]/10', 
      text: 'text-[#dc2626]', 
      border: 'border-[#dc2626]/30',
      icon: AlertTriangle,
      color: '#dc2626',
      gradient: 'from-[#dc2626] to-[#ef4444]'
    },
  };

  const teamLabel = currentTeam === 'mens' ? 'Men\'s Team' : 'Women\'s Team';

  // Generate radar chart data from player
  const getRadarData = () => {
    if (!selectedPlayerData) return [];
    return [
      { metric: 'Load', value: Math.min(100, (selectedPlayerData.avgLoad / 600) * 100), fullMark: 100 },
      { metric: 'Speed', value: Math.min(100, (selectedPlayerData.avgSpeed / 25) * 100), fullMark: 100 },
      { metric: 'Sessions', value: Math.min(100, (selectedPlayerData.sessions / 30) * 100), fullMark: 100 },
      { metric: 'Consistency', value: 75, fullMark: 100 },
      { metric: 'Recovery', value: selectedPlayerData.riskLevel === 'low' ? 90 : selectedPlayerData.riskLevel === 'medium' ? 60 : 30, fullMark: 100 },
    ];
  };

  // Risk probability chart data
  const getProbabilityData = () => {
    if (!prediction) return [];
    const prob = prediction.probability * 100;
    return [
      { name: 'Risk', value: prob, color: riskConfig[prediction.riskLevel].color },
      { name: 'Safe', value: 100 - prob, color: '#e2e8f0' },
    ];
  };

  const percentileForSelected = analytics?.percentiles?.find((entry) => entry.playerId === selectedPlayer);

  const teamBenchmark = useMemo(() => {
    if (!teamAverage) return null;
    const avgLoad = Number(teamAverage.avgLoad ?? 0);
    const avgSpeed = Number(teamAverage.avgSpeed ?? 0);
    const sessions = Number(teamAverage.sessions ?? 0);
    return { avgLoad, avgSpeed, sessions };
  }, [teamAverage]);

  const deltas = useMemo(() => {
    if (!selectedPlayerData || !teamBenchmark) return null;
    const dLoad = selectedPlayerData.avgLoad - teamBenchmark.avgLoad;
    const dSpeed = selectedPlayerData.avgSpeed - teamBenchmark.avgSpeed;
    const dSessions = selectedPlayerData.sessions - teamBenchmark.sessions;
    const pct = (v: number, base: number) => (base > 0 ? (v / base) * 100 : null);
    return {
      load: { delta: dLoad, pct: pct(dLoad, teamBenchmark.avgLoad) },
      speed: { delta: dSpeed, pct: pct(dSpeed, teamBenchmark.avgSpeed) },
      sessions: { delta: dSessions, pct: pct(dSessions, teamBenchmark.sessions) },
    };
  }, [selectedPlayerData, teamBenchmark]);

  const coachSnapshot = useMemo(() => {
    if (!selectedPlayerData || !deltas) return null;
    const loadFlag =
      deltas.load.pct === null
        ? null
        : deltas.load.pct >= 15
          ? 'high'
          : deltas.load.pct <= -15
            ? 'low'
            : 'normal';
    const speedFlag =
      deltas.speed.pct === null
        ? null
        : deltas.speed.pct >= 8
          ? 'high'
          : deltas.speed.pct <= -8
            ? 'low'
            : 'normal';
    const sessionsFlag =
      deltas.sessions.pct === null
        ? null
        : deltas.sessions.pct >= 20
          ? 'high'
          : deltas.sessions.pct <= -20
            ? 'low'
            : 'normal';
    return { loadFlag, speedFlag, sessionsFlag };
  }, [selectedPlayerData, deltas]);

  // No data loaded state for current team (must appear after hooks)
  if (!dataStatus?.loaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="panel panel--elevated p-8 max-w-md text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="section-title mb-2">No data</h2>
          <p className="caption mb-6">
            Upload a CSV for {teamLabel} in the Dashboard to analyze risk.
          </p>
          <a href="/" className="btn btn--primary gap-2">
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b] flex items-center gap-3">
          <Shield className="w-7 h-7 text-[#64748b]" />
          Risk Analysis
        </h1>
        <p className="text-[#64748b] text-sm mt-1">
          Predict injury risk and get AI-powered recommendations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Player Selection */}
        <div className="lg:col-span-1 space-y-4">
          {/* Select Player Card */}
          <div className="panel panel--elevated p-6 bg-white">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-lg bg-[#ea580c]/10 border border-[#ea580c]/20">
                <Target className="w-5 h-5 text-[#ea580c]" />
              </div>
              <div>
                <h2 className="font-semibold text-[#1e293b]">Select Player</h2>
                <p className="text-xs text-[#64748b]">Choose a player to analyze</p>
              </div>
            </div>

            <div className="space-y-4">
              <select
                value={selectedPlayer}
                onChange={(e) => handlePlayerSelect(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-[#e2e8f0] rounded-lg text-[#1e293b] focus:outline-none focus:border-[#1e40af] transition-colors"
              >
                <option value="">Choose a player...</option>
                <option value="team_average" className="font-semibold">
                  Team Average (All Players)
                </option>
                <optgroup label="Players">
                  {players?.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </optgroup>
              </select>

              <button
                onClick={handlePredict}
                disabled={!selectedPlayer || analyzeMutation.isPending}
                className="btn btn--primary w-full py-3 gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {analyzeMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing (coach report)...
                  </>
                ) : (
                  <>
                    <Activity className="w-5 h-5" />
                    Generate coach report
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Selected Player Info */}
          {selectedPlayerData && (
            <div className="panel panel--elevated p-6 bg-white animate-slide-in-up">
              <div className="flex items-center gap-4 mb-4">
                <div className={`
                  w-14 h-14 rounded-lg flex items-center justify-center font-bold text-xl border-2
                  ${selectedPlayerData.id === 'team_average' 
                    ? 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30'
                    : `${riskConfig[selectedPlayerData.riskLevel].bg} ${riskConfig[selectedPlayerData.riskLevel].text} border ${riskConfig[selectedPlayerData.riskLevel].border}`
                  }
                `}>
                  {selectedPlayerData.id === 'team_average' ? 'TA' : selectedPlayerData.number}
                </div>
                <div>
                  <h3 className="font-semibold text-[#1e293b]">{selectedPlayerData.name}</h3>
                  <p className="text-sm text-[#64748b]">
                    {selectedPlayerData.id === 'team_average' 
                      ? (teamAverage?.teamStats?.totalPlayers
                          ? `Average of ${teamAverage.teamStats.totalPlayers} players`
                          : 'No team data loaded')
                      : `#${selectedPlayerData.number}`
                    }
                  </p>
                </div>
              </div>

              {/* When Team Average has no data, show empty state instead of zeros */}
              {selectedPlayerData.id === 'team_average' && (!teamAverage?.teamStats?.totalPlayers || selectedPlayerData.sessions === 0) ? (
                <div className="py-6 px-4 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] text-center">
                  <p className="text-sm text-[#64748b]">
                    Upload a CSV in the Dashboard to see team averages and risk distribution.
                  </p>
                  <a href="/" className="inline-block mt-3 text-sm font-medium text-[#1e40af] hover:underline">
                    Go to Dashboard
                  </a>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[#f8fafc] rounded-lg text-center border border-[#e2e8f0]">
                      <Zap className="w-4 h-4 text-[#64748b] mx-auto mb-1" />
                      <p className="text-lg font-bold text-[#1e293b]">{selectedPlayerData.avgLoad}</p>
                      <p className="text-[10px] text-[#64748b]">Avg Load</p>
                    </div>
                    <div className="p-3 bg-[#f8fafc] rounded-lg text-center border border-[#e2e8f0]">
                      <TrendingUp className="w-4 h-4 text-[#64748b] mx-auto mb-1" />
                      <p className="text-lg font-bold text-[#1e293b]">{selectedPlayerData.avgSpeed}</p>
                      <p className="text-[10px] text-[#64748b]">Avg Speed</p>
                    </div>
                    <div className="p-3 bg-[#f8fafc] rounded-lg text-center border border-[#e2e8f0]">
                      <Activity className="w-4 h-4 text-[#64748b] mx-auto mb-1" />
                      <p className="text-lg font-bold text-[#1e293b]">{selectedPlayerData.sessions}</p>
                      <p className="text-[10px] text-[#64748b]">Sessions</p>
                    </div>
                    <div className="p-3 bg-[#f8fafc] rounded-lg text-center border border-[#e2e8f0]">
                      <Heart className="w-4 h-4 text-[#dc2626] mx-auto mb-1" />
                      <p className={`text-lg font-bold capitalize ${riskConfig[selectedPlayerData.riskLevel].text}`}>
                        {selectedPlayerData.riskLevel}
                      </p>
                      <p className="text-[10px] text-[#64748b]">Current Risk</p>
                    </div>
                  </div>
                  {/* Team Stats for Team Average - only when we have real data */}
                  {selectedPlayerData.id === 'team_average' && (teamAverage?.teamStats?.totalPlayers ?? 0) > 0 && (
                    <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
                      <p className="text-xs text-[#64748b] mb-2">Team Distribution</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                          <p className="text-lg font-bold text-[#10b981]">{teamAverage?.teamStats?.riskDistribution.low ?? 0}</p>
                          <p className="caption">Low Risk</p>
                        </div>
                        <div className="text-center p-2 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-lg">
                          <p className="text-lg font-bold text-[#f59e0b]">{teamAverage?.teamStats?.riskDistribution.medium ?? 0}</p>
                          <p className="text-[10px] text-[#64748b]">Medium</p>
                        </div>
                        <div className="text-center p-2 bg-[#dc2626]/10 border border-[#dc2626]/20 rounded-lg">
                          <p className="text-lg font-bold text-[#dc2626]">{teamAverage?.teamStats?.riskDistribution.high ?? 0}</p>
                          <p className="text-[10px] text-[#64748b]">High Risk</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Player Radar Chart - hide when Team Average has no data */}
          {selectedPlayerData && !(selectedPlayerData.id === 'team_average' && (!teamAverage?.teamStats?.totalPlayers || selectedPlayerData.sessions === 0)) && (
            <div className="panel panel--elevated p-6 bg-white animate-slide-in-up" style={{ animationDelay: '100ms' }}>
              <h3 className="font-semibold text-[#1e293b] mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#64748b]" />
                Performance Profile
              </h3>
              <div className="h-64 min-h-[256px] w-full">
                <ResponsiveContainer width="100%" height={256} minWidth={0}>
                  <RadarChart data={getRadarData()}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Radar
                      name="Performance"
                      dataKey="value"
                      stroke="#1e40af"
                      fill="#1e40af"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Team comparison snapshot (always visible once a player is selected) */}
          {selectedPlayerData && teamBenchmark && deltas && (
            <div className="panel panel--elevated p-6 bg-white animate-slide-in-up">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#64748b]" />
                  <h3 className="font-semibold text-[#1e293b]">Compared to Team Average</h3>
                </div>
                {percentileForSelected && (
                  <div className="text-xs text-[#64748b]">
                    Load {percentileForSelected.loadPercentile.toFixed(0)}% · Speed {percentileForSelected.speedPercentile.toFixed(0)}% · Sessions {percentileForSelected.sessionPercentile.toFixed(0)}%
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    label: 'Load',
                    value: selectedPlayerData.avgLoad,
                    team: teamBenchmark.avgLoad,
                    delta: deltas.load.delta,
                    pct: deltas.load.pct,
                    unit: '',
                    flag: coachSnapshot?.loadFlag,
                  },
                  {
                    label: 'Speed',
                    value: selectedPlayerData.avgSpeed,
                    team: teamBenchmark.avgSpeed,
                    delta: deltas.speed.delta,
                    pct: deltas.speed.pct,
                    unit: 'mph',
                    flag: coachSnapshot?.speedFlag,
                  },
                  {
                    label: 'Sessions',
                    value: selectedPlayerData.sessions,
                    team: teamBenchmark.sessions,
                    delta: deltas.sessions.delta,
                    pct: deltas.sessions.pct,
                    unit: '',
                    flag: coachSnapshot?.sessionsFlag,
                  },
                ].map((m) => {
                  const up = m.delta > 0;
                  const abs = Math.abs(m.delta);
                  const icon =
                    abs < 0.0001 ? <Minus className="w-4 h-4 text-[#94a3b8]" /> : up ? <TrendingUp className="w-4 h-4 text-[#10b981]" /> : <ArrowRight className="w-4 h-4 text-[#f59e0b] rotate-180" />;
                  const badge =
                    m.flag === 'high'
                      ? { bg: 'bg-[#dc2626]/10', text: 'text-[#dc2626]', label: 'Above team' }
                      : m.flag === 'low'
                        ? { bg: 'bg-[#1e40af]/10', text: 'text-[#1e40af]', label: 'Below team' }
                        : { bg: 'bg-[#f8fafc]', text: 'text-[#64748b]', label: 'Near team' };
                  return (
                    <div key={m.label} className="p-4 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[#64748b] uppercase">{m.label}</p>
                        <span className={`text-[10px] px-2 py-1 rounded ${badge.bg} ${badge.text}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-2xl font-bold text-[#1e293b]">{m.value}{m.unit ? ` ${m.unit}` : ''}</p>
                          <p className="text-[11px] text-[#64748b]">Team avg: {m.team}{m.unit ? ` ${m.unit}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <div className="inline-flex items-center gap-1">
                            {icon}
                            <span className="text-sm font-semibold text-[#334155]">
                              {abs < 0.0001 ? '0' : `${up ? '+' : '-'}${abs.toFixed(m.label === 'Sessions' ? 0 : 1)}`}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#64748b]">
                            {m.pct === null ? '—' : `${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(0)}% vs team`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 rounded-lg border border-[#e2e8f0] bg-white">
                <p className="text-sm font-semibold text-[#1e293b] mb-1">Coach snapshot</p>
                <p className="text-sm text-[#64748b]">
                  Use this to set next-session targets. Then click <strong>Generate coach report</strong> for risk drivers + action plan.
                </p>
              </div>
            </div>
          )}

          {prediction ? (
            <>
              {/* No Recent Data Warning */}
              {prediction.hasRecentData === false && (
                <div className="panel p-4 border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/10 animate-slide-in-up">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="text-[#f59e0b] font-semibold mb-1">No Recent Training Data</p>
                      <p className="text-[#64748b]">
                        This player has no training sessions in the last 45 days. 
                        Risk is automatically set to LOW as we cannot accurately assess without recent data.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Risk Level Card */}
              <div className={`panel panel--elevated p-6 border bg-white animate-slide-in-up ${riskConfig[prediction.riskLevel].border}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`
                      w-16 h-16 rounded-lg flex items-center justify-center border-2
                      ${riskConfig[prediction.riskLevel].bg} ${riskConfig[prediction.riskLevel].border}
                    `}>
                      {(() => {
                        const IconComponent = riskConfig[prediction.riskLevel].icon;
                        return <IconComponent className={`w-8 h-8 ${riskConfig[prediction.riskLevel].text}`} />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm text-[#64748b] mb-1">Injury Risk Level</p>
                      <p className={`text-3xl font-bold capitalize ${riskConfig[prediction.riskLevel].text}`}>
                        {prediction.riskLevel} Risk
                      </p>
                      <p className="text-sm text-[#64748b] mt-1">
                        {prediction.playerName}
                      </p>
                    </div>
                  </div>

                  {/* Probability Donut */}
                  <div className="w-32 h-32 relative flex-shrink-0" style={{ minWidth: 128, minHeight: 128 }}>
                    <ResponsiveContainer width={128} height={128}>
                      <PieChart width={128} height={128}>
                        <Pie
                          data={getProbabilityData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={50}
                          dataKey="value"
                          strokeWidth={2}
                          stroke="#ffffff"
                        >
                          {getProbabilityData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            padding: '8px 10px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                          }}
                          labelStyle={{ color: '#1e293b', fontWeight: 600, fontSize: '12px' }}
                          itemStyle={{ color: '#334155', fontSize: '13px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${riskConfig[prediction.riskLevel].text}`}>
                          {(prediction.probability * 100).toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-[#64748b]">Confidence</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Risk Factors & Recommendations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Risk Factors */}
                <div className="panel panel--elevated p-6 bg-white animate-slide-in-up" style={{ animationDelay: '100ms' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5 text-[#ea580c]" />
                    <h3 className="font-semibold text-[#1e293b]">Risk Factors</h3>
                  </div>
                  <ul className="space-y-3">
                    {prediction.factors.map((factor, i) => (
                      <li key={i} className="flex items-start gap-3 p-3 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                        <span className={`
                          w-2 h-2 rounded-full mt-1.5 flex-shrink-0
                          ${prediction.riskLevel === 'high' ? 'bg-[#dc2626]' : prediction.riskLevel === 'medium' ? 'bg-[#f59e0b]' : 'bg-[#1e40af]'}
                        `} />
                        <span className="text-sm text-[#334155]">{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommendations */}
                <div
                  className="panel panel--elevated p-6 bg-[#0f172a] border border-[#334155] animate-slide-in-up"
                  style={{ animationDelay: '150ms' }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-semibold text-white">Recommendations</h3>
                  </div>
                  <ul className="space-y-3">
                    {prediction.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 p-3 bg-[#1e293b]/80 border border-[#334155] rounded-lg"
                      >
                        <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-white">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {analytics && (
                <>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {percentileForSelected && (
                      <div className="panel p-5 bg-white">
                        <h3 className="font-semibold text-[#1e293b] mb-3">Percentiles</h3>
                        <div className="space-y-3 text-sm">
                          <p className="text-[#64748b]">Load: <span className="font-semibold text-[#1e293b]">{percentileForSelected.loadPercentile.toFixed(1)}%</span></p>
                          <p className="text-[#64748b]">Speed: <span className="font-semibold text-[#1e293b]">{percentileForSelected.speedPercentile.toFixed(1)}%</span></p>
                          <p className="text-[#64748b]">Sessions: <span className="font-semibold text-[#1e293b]">{percentileForSelected.sessionPercentile.toFixed(1)}%</span></p>
                        </div>
                      </div>
                    )}

                    <div className="panel p-5 bg-white xl:col-span-2">
                      <h3 className="font-semibold text-[#1e293b] mb-3">Recent Outlier Timeline</h3>
                      <div className="space-y-2 max-h-56 overflow-auto pr-1">
                        {analytics.outlierTimeline.length > 0 ? analytics.outlierTimeline.slice(-8).reverse().map((event, idx) => (
                          <div key={`${event.date}-${idx}`} className="p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                            <p className="text-sm font-medium text-[#1e293b]">{event.playerName} · {event.playerLoad}</p>
                            <p className="text-xs text-[#64748b]">{event.date} · {event.sessionTitle}</p>
                          </div>
                        )) : (
                          <p className="text-sm text-[#64748b]">No extreme spikes detected with the current dataset.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {analytics.positionComparison.length > 0 && (
                    <div className="panel panel--elevated p-6 bg-white animate-slide-in-up">
                      <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-5 h-5 text-[#10b981]" />
                        <h3 className="font-semibold text-[#1e293b]">Position Group Comparison</h3>
                      </div>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.positionComparison}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="positionGroup" stroke="#94a3b8" fontSize={11} />
                            <YAxis stroke="#94a3b8" fontSize={11} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="avgLoad" fill="#10b981" radius={[6, 6, 0, 0]} name="Avg Load" />
                            <Bar dataKey="avgTopSpeed" fill="#1e40af" radius={[6, 6, 0, 0]} name="Avg Top Speed" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* AI Coach Section */}
              <div className="panel panel--elevated p-6 bg-white animate-slide-in-up" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-[#06b6d4]/10 border border-[#06b6d4]/20">
                      <Bot className="w-5 h-5 text-[#06b6d4]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#1e293b]">AI Coach Recommendations</h3>
                      <p className="text-xs text-[#64748b]">
                        Powered by OpenRouter {openRouterStatus?.status === 'ready' ? '(Connected)' : '(Not configured)'}
                      </p>
                    </div>
                  </div>
                  
                  <button
                    onClick={handlePredict}
                    disabled={analyzeMutation.isPending || !selectedPlayer}
                    className="px-4 py-2 bg-[#06b6d4] hover:bg-[#0891b2] border border-[#06b6d4] rounded-lg font-semibold text-white text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {analyzeMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Get AI Analysis
                      </>
                    )}
                  </button>
                </div>

                {/* OpenRouter Status Badge */}
                {openRouterStatus && (
                  <div className={`mb-4 px-3 py-2 rounded-lg text-xs inline-flex items-center gap-2 ${
                    openRouterStatus.status === 'ready' 
                      ? 'bg-[var(--risk-low)]/10 text-[var(--risk-low)] border border-[var(--risk-low)]/30'
                      : 'bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border border-[var(--risk-medium)]/30'
                  }`} style={openRouterStatus.status !== 'ready' ? { backgroundColor: 'rgba(255, 193, 7, 0.15)' } : {}}>
                    <span className={`w-2 h-2 rounded-full ${openRouterStatus.status === 'ready' ? 'bg-[#10b981]' : 'bg-[#ffc107]'}`} />
                    {openRouterStatus.status === 'ready' 
                      ? `OpenRouter connected - Model: ${openRouterStatus.defaultModel}`
                      : openRouterStatus.message}
                  </div>
                )}

                {/* Error Message */}
                {analyzeMutation.isError && (
                  <div className="mb-4 p-3 bg-[#dc2626]/10 border border-[#dc2626]/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#dc2626]" />
                      <span className="text-sm text-[#dc2626]">
                        Failed to analyze: {(analyzeMutation.error as Error)?.message || 'Unknown error'}
                      </span>
                    </div>
                  </div>
                )}

                {/* AI Recommendations Content */}
                {aiRecommendations ? (
                    <div className="p-4 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="w-4 h-4 text-[#64748b]" />
                      <span className="text-sm font-semibold text-[#1e293b]">
                        {aiRecommendations.aiSuccess ? 'AI Analysis' : 'Standard Recommendations'}
                      </span>
                      {aiRecommendations.aiSource && (
                        <span className="text-xs text-[#64748b] bg-[#e2e8f0] px-2 py-1 rounded">
                          source: {aiRecommendations.aiSource}
                        </span>
                      )}
                      {!aiRecommendations.aiSuccess && aiRecommendations.aiError && (
                        <span className="text-xs text-[#dc2626] bg-[#dc2626]/10 px-2 py-1 rounded">
                          {aiRecommendations.aiError}
                        </span>
                      )}
                    </div>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          h2: ({children}) => <h2 className="text-lg font-semibold text-[#1e293b] mt-4 mb-2">{children}</h2>,
                          h3: ({children}) => <h3 className="text-md font-semibold text-[#334155] mt-3 mb-1">{children}</h3>,
                          p: ({children}) => <p className="text-sm text-[#334155] mb-2">{children}</p>,
                          ul: ({children}) => <ul className="list-disc list-inside text-sm text-[#334155] space-y-1">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal list-inside text-sm text-[#334155] space-y-1">{children}</ol>,
                          li: ({children}) => <li className="text-[#334155]">{children}</li>,
                          strong: ({children}) => <strong className="text-[#1e293b] font-semibold">{children}</strong>,
                        }}
                      >
                        {aiRecommendations.aiRecommendations}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-[#f8fafc] rounded-lg text-center border border-[#e2e8f0]">
                    <Bot className="w-10 h-10 text-[#cbd5e1] mx-auto mb-3" />
                    <p className="text-sm text-[#64748b] mb-2">
                      {selectedPlayer 
                        ? 'Click "Get AI Analysis" to receive personalized coaching recommendations based on this player\'s performance data.'
                        : 'Select a player first to get AI-powered coaching recommendations.'}
                    </p>
                    {!selectedPlayer && (
                      <p className="text-xs text-[#94a3b8] mt-2">
                        The AI Analysis button will be enabled once you select a player.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="panel p-4 border-[var(--border-default)] bg-white animate-slide-in-up" style={{ animationDelay: '250ms' }}>
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-[#64748b] flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-[#64748b]">
                    <p className="text-[#334155] font-semibold mb-1">About this prediction</p>
                    <p>
                      Risk analysis uses data from the <strong className="text-[#1e293b]">last 45 days only</strong>. If no recent training data is available, 
                      risk is set to LOW. AI recommendations are powered by OpenRouter.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : analyzeMutation.isPending ? (
            <div className="panel panel--elevated p-8 bg-white text-center animate-slide-in-up">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#06b6d4]/10 border border-[#06b6d4]/20 rounded-lg flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#06b6d4] animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-[#1e293b] mb-2">Running Analysis</h3>
              <p className="text-[#64748b] text-sm max-w-md mx-auto">
                Generating risk scoring and coach recommendations for the selected player.
              </p>
            </div>
          ) : analyzeMutation.isError ? (
            <div className="panel panel--elevated p-8 bg-white text-center animate-slide-in-up">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#dc2626]/10 border border-[#dc2626]/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-[#dc2626]" />
              </div>
              <h3 className="text-lg font-semibold text-[#1e293b] mb-2">Analysis Failed</h3>
              <p className="text-[#64748b] text-sm mb-4">
                {(analyzeMutation.error as Error)?.message || 'Could not analyze player risk. Please try again.'}
              </p>
              <button
                onClick={handlePredict}
                className="px-4 py-2 bg-[#06b6d4] hover:bg-[#0891b2] rounded-lg text-sm text-white transition-colors border border-[#06b6d4]"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="panel panel--elevated p-12 bg-white text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg flex items-center justify-center">
                <Shield className="w-10 h-10 text-[#cbd5e1]" />
              </div>
              <h3 className="text-lg font-semibold text-[#1e293b] mb-2">Ready to Analyze</h3>
              <p className="text-[#64748b] text-sm max-w-md mx-auto">
                Select a player, then run AI Analysis to get injury risk plus a coach report.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
