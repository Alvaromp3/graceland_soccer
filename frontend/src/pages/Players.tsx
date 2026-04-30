import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  UserMinus,
  UserPlus,
  X,
  Users,
  GitCompare,
  EyeOff,
  Eye,
  ChevronRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';
import { playersApi, useDataStatus } from '../services/api';
import { useTeam } from '../contexts/useTeam';
import PlayerPanel, { PlayersComparisonChart } from '../components/players/PlayerPanel';
import ChartPanel from '../components/charts/ChartPanel';

const positions = ['GK', 'CB', 'LB', 'RB', 'CM', 'CDM', 'CAM', 'LW', 'RW', 'ST', 'CF'];

export default function Players() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [showExcluded, setShowExcluded] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [confirmExclude, setConfirmExclude] = useState<{ open: boolean; playerName: string }>({ open: false, playerName: '' });
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; playerId: string; playerName: string }>({ open: false, playerId: '', playerName: '' });
  const { currentTeam } = useTeam();

  const { data: dataStatus } = useDataStatus();
  const { data: players, isLoading } = useQuery({
    queryKey: ['players'],
    queryFn: playersApi.getAll,
    enabled: !!dataStatus?.loaded,
  });
  const { data: excludedPlayers } = useQuery({
    queryKey: ['players', 'excluded'],
    queryFn: playersApi.getExcluded,
    enabled: !!dataStatus?.loaded,
  });

  const excludeMutation = useMutation({
    mutationFn: playersApi.excludePlayer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setConfirmExclude({ open: false, playerName: '' });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: playersApi.restorePlayer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const updatePositionMutation = useMutation({
    mutationFn: ({ playerName, position }: { playerName: string; position: string }) =>
      playersApi.updatePosition(playerName, position, currentTeam),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: playersApi.deletePlayer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['data', 'status'] });
      setConfirmDelete({ open: false, playerId: '', playerName: '' });
    },
  });

  const handleEditPosition = (playerName: string, position: string) => {
    updatePositionMutation.mutate({ playerName, position });
  };
  const filteredPlayers = players?.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchRisk = riskFilter === 'all' || p.riskLevel === riskFilter;
    const matchPos = positionFilter === 'all' || p.position === positionFilter;
    return matchSearch && matchRisk && matchPos;
  }) ?? [];
  const riskCounts = {
    all: players?.length ?? 0,
    low: players?.filter((p) => p.riskLevel === 'low').length ?? 0,
    medium: players?.filter((p) => p.riskLevel === 'medium').length ?? 0,
    high: players?.filter((p) => p.riskLevel === 'high').length ?? 0,
  };
  const handleToggleSelect = (playerId: string) => {
    const next = new Set(selectedForCompare);
    if (next.has(playerId)) next.delete(playerId);
    else if (next.size < 3) next.add(playerId);
    setSelectedForCompare(next);
  };
  const selectedPlayers = filteredPlayers.filter((p) => selectedForCompare.has(p.id));
  const loadChartData = filteredPlayers
    .sort((a, b) => b.avgLoad - a.avgLoad)
    .slice(0, 10)
    .map((p) => ({
      name: p.name.split(' ')[0],
      fullName: p.name,
      load: Math.round(p.avgLoad * 10) / 10,
      risk: p.riskLevel,
    }));

  const teamLabel = currentTeam === 'mens' ? "Men's Team" : "Women's Team";

  if (!dataStatus?.loaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="panel panel--elevated p-8 text-center max-w-sm">
          <Users className="w-10 h-10 mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="section-title mb-2">No data</h2>
          <p className="caption mb-6">Upload a CSV for {teamLabel} in the Dashboard to view players.</p>
          <Link to="/" className="btn btn--primary gap-2">
            Go to Dashboard
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Modals */}
      {confirmExclude.open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="panel panel--elevated p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Exclude from analysis</h3>
              <button type="button" onClick={() => setConfirmExclude({ open: false, playerName: '' })} className="p-2 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Exclude <strong className="text-[var(--text-primary)]">{confirmExclude.playerName}</strong>? They can be restored anytime.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmExclude({ open: false, playerName: '' })} className="btn btn--secondary flex-1">Cancel</button>
              <button type="button" onClick={() => excludeMutation.mutate(confirmExclude.playerName)} disabled={excludeMutation.isPending} className="btn btn--primary flex-1 gap-2">
                {excludeMutation.isPending ? 'Excluding…' : <><UserMinus className="w-4 h-4" /> Exclude</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete.open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="panel panel--elevated p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Delete player</h3>
              <button type="button" onClick={() => setConfirmDelete({ open: false, playerId: '', playerName: '' })} className="p-2 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Delete <strong className="text-[var(--text-primary)]">{confirmDelete.playerName}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmDelete({ open: false, playerId: '', playerName: '' })} className="btn btn--secondary flex-1">Cancel</button>
              <button type="button" onClick={() => deleteMutation.mutate(confirmDelete.playerId)} disabled={deleteMutation.isPending} className="btn flex-1 gap-2 bg-[var(--accent-risk-high)] text-white border-[var(--accent-risk-high)] hover:opacity-90">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="caption">{players?.length ?? 0} players · {teamLabel}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setCompareMode(!compareMode); if (compareMode) setSelectedForCompare(new Set()); }}
            className={`btn text-sm ${compareMode ? 'btn--primary' : 'btn--secondary'}`}
          >
            <GitCompare className="w-4 h-4" />
            Compare {selectedForCompare.size > 0 ? `(${selectedForCompare.size})` : ''}
          </button>
          {(excludedPlayers?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setShowExcluded(!showExcluded)}
              className={`btn text-sm ${showExcluded ? 'btn--primary' : 'btn--secondary'}`}
            >
              {showExcluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Excluded ({excludedPlayers?.length})
            </button>
          )}
        </div>
      </div>

      {showExcluded && excludedPlayers && excludedPlayers.length > 0 && (
        <div className="panel p-4 border-[var(--accent-alert)]/30 bg-[var(--accent-alert)]/5">
          <p className="section-title mb-2">Excluded players</p>
          <p className="caption mb-3">Click to restore.</p>
          <div className="flex flex-wrap gap-2">
            {excludedPlayers.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => restoreMutation.mutate(name)}
                disabled={restoreMutation.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] text-sm text-[var(--text-primary)] hover:border-[var(--accent-performance)]"
              >
                {name}
                <UserPlus className="w-3.5 h-3.5 text-[var(--accent-performance)]" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats overview — compact */}
      <div className="flex flex-wrap gap-6 py-2 border-b border-[var(--border-subtle)]">
        <span className="metric-value text-xl">{riskCounts.all}</span>
        <span className="metric-label self-center">Active</span>
        <span className="metric-value text-xl text-[var(--risk-low)]">{riskCounts.low}</span>
        <span className="metric-label self-center">Low</span>
        <span className="metric-value text-xl text-[var(--risk-medium)]">{riskCounts.medium}</span>
        <span className="metric-label self-center">Medium</span>
        <span className="metric-value text-xl text-[var(--risk-high)]">{riskCounts.high}</span>
        <span className="metric-label self-center">High</span>
      </div>

      {/* Compare view */}
      {compareMode && selectedPlayers.length > 0 && (
        <div className="panel panel--elevated p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Compare up to 3 players</h3>
            <button type="button" onClick={() => setSelectedForCompare(new Set())} className="btn btn--ghost text-sm">Clear</button>
          </div>
          <div className="space-y-2 mb-4">
            {selectedPlayers.map((player) => (
              <PlayerPanel
                key={player.id}
                player={player}
                onExclude={() => {}}
                compareMode
                isSelected={selectedForCompare.has(player.id)}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
          {selectedPlayers.length > 1 && (
            <PlayersComparisonChart players={selectedPlayers} />
          )}
        </div>
      )}

      {/* Top 10 by load */}
      {loadChartData.length > 0 && !compareMode && (
        <ChartPanel title="Top 10 by load" subtitle="Average load per session">
          <div className="h-64 w-full" style={{ minHeight: 256, minWidth: 1 }}>
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <BarChart
                data={loadChartData}
                margin={{ top: 16, right: 16, left: 8, bottom: 48 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} horizontal={true} />
                <XAxis
                  dataKey="name"
                  type="category"
                  stroke="var(--text-tertiary)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-secondary)' }}
                  angle={-35}
                  textAnchor="end"
                  height={44}
                  interval={0}
                />
                <YAxis
                  type="number"
                  stroke="var(--text-tertiary)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-tertiary)' }}
                  width={36}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}
                  formatter={(value) => [`${Number(value ?? 0).toFixed(1)} units`, 'Load']}
                  labelFormatter={(_, payload) => (payload?.[0] as { payload?: { fullName?: string } })?.payload?.fullName ?? ''}
                  cursor={{ fill: 'var(--bg-subtle)', opacity: 0.6 }}
                />
                <Bar
                  dataKey="load"
                  fill="#ea580c"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  name="Load"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'low', 'medium', 'high'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setRiskFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${
                riskFilter === f
                  ? 'bg-[var(--accent-performance-muted)] border-[var(--accent-performance)] text-[var(--accent-performance)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({f === 'all' ? riskCounts.all : riskCounts[f]})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="caption self-center">Position:</span>
          {['all', ...positions].map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setPositionFilter(pos)}
              className={`px-2 py-1 rounded text-xs font-medium border ${
                positionFilter === pos
                  ? 'bg-[var(--accent-performance-muted)] border-[var(--accent-performance)] text-[var(--accent-performance)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Player list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded border border-[var(--border-subtle)] skeleton" />
          ))}
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="panel p-12 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h3 className="section-title mb-2">No players found</h3>
          <p className="caption">{search ? `No match for "${search}"` : 'No players in this category'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPlayers.map((player) => (
            <PlayerPanel
              key={player.id}
              player={player}
              onExclude={(name) => setConfirmExclude({ open: true, playerName: name })}
              onDelete={(id, name) => setConfirmDelete({ open: true, playerId: id, playerName: name })}
              compareMode={compareMode}
              isSelected={selectedForCompare.has(player.id)}
              onToggleSelect={handleToggleSelect}
              onEditPosition={handleEditPosition}
            />
          ))}
        </div>
      )}
    </div>
  );
}
