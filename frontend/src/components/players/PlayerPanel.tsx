import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  UserMinus,
  Edit2,
  Save,
  Trash2,
  X,
  Activity,
} from 'lucide-react';
import type { Player } from '../../types';
import ChartPanel from '../charts/ChartPanel';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const positions = ['GK', 'CB', 'LB', 'RB', 'CM', 'CDM', 'CAM', 'LW', 'RW', 'ST', 'CF'];

interface PlayerPanelProps {
  player: Player;
  onExclude: (name: string) => void;
  onDelete?: (id: string, name: string) => void;
  compareMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEditPosition?: (playerName: string, position: string) => void;
}

export default function PlayerPanel({
  player,
  onExclude,
  onDelete,
  compareMode = false,
  isSelected = false,
  onToggleSelect,
  onEditPosition,
}: PlayerPanelProps) {
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(player.position);

  useEffect(() => {
    setSelectedPosition(player.position);
  }, [player.position]);

  const handleSavePosition = () => {
    if (onEditPosition) {
      onEditPosition(player.name, selectedPosition);
      setIsEditingPosition(false);
    }
  };

  return (
    <div
      role={compareMode ? 'button' : undefined}
      tabIndex={compareMode ? 0 : undefined}
      onClick={() => compareMode && onToggleSelect?.(player.id)}
      onKeyDown={(e) => compareMode && (e.key === 'Enter' || e.key === ' ') && onToggleSelect?.(player.id)}
      className={`
        flex items-center gap-4 p-3 rounded border border-[var(--border-subtle)]
        transition-colors
        ${compareMode ? 'cursor-pointer' : ''}
        ${isSelected ? 'bg-[var(--accent-performance-muted)] border-[var(--accent-performance)]' : 'bg-[var(--bg-surface)] hover:border-[var(--border-default)]'}
      `}
    >
      {compareMode && (
        <div className="flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center bg-[var(--bg-elevated)] border-[var(--border-default)]">
          {isSelected && <span className="text-[var(--accent-performance)] font-bold text-sm">✓</span>}
        </div>
      )}
      <div className="w-10 h-10 flex-shrink-0 rounded flex items-center justify-center font-semibold text-sm border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
        {player.number}
      </div>
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <Link
            to={`/analysis?player=${player.id}`}
            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-performance)] truncate block"
            onClick={(e) => !compareMode && e.stopPropagation()}
          >
            {player.name}
          </Link>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!isEditingPosition ? (
              <>
                <span className="caption">#{player.number}</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  {player.position}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsEditingPosition(true); }}
                  className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--accent-performance)]"
                  title="Edit position"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  className="text-xs bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-2 py-0.5 text-[var(--text-primary)]"
                >
                  {positions.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
                <button type="button" onClick={handleSavePosition} className="p-0.5 text-[var(--risk-low)]" title="Save">
                  <Save className="w-3 h-3" />
                </button>
                <button type="button" onClick={() => { setSelectedPosition(player.position); setIsEditingPosition(false); }} className="p-0.5 text-[var(--text-tertiary)]" title="Cancel">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular-nums font-semibold text-[var(--text-primary)] text-sm">{player.avgLoad}</span>
          <span className="caption">Load</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular-nums font-semibold text-[var(--text-primary)] text-sm">{player.avgSpeed}</span>
          <span className="caption">mph</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular-nums font-semibold text-[var(--text-primary)] text-sm">{player.sessions}</span>
          <span className="caption">Sess</span>
        </div>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded risk-badge--${player.riskLevel}`}>
          {player.riskLevel}
        </span>
        <span className="caption flex items-center gap-1">
          <Activity className="w-3 h-3" />
          {player.lastSession || 'N/A'}
        </span>
      </div>
      {!compareMode && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <Link
            to={`/analysis?player=${player.id}`}
            className="btn btn--ghost py-1.5 px-2 text-xs gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            Analyze
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExclude(player.name); }}
            className="p-2 rounded text-[var(--accent-alert)] hover:bg-[var(--accent-alert)]/10"
            title="Exclude from analysis"
          >
            <UserMinus className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(player.id, player.name); }}
              className="p-2 rounded text-[var(--accent-risk-high)] hover:bg-[var(--accent-risk-high)]/10"
              title="Delete player"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PlayersComparisonChart({ players }: { players: Player[] }) {
  const data = players.map((p) => ({
    name: p.name.split(' ')[0],
    load: p.avgLoad,
    speed: p.avgSpeed,
  }));

  return (
    <ChartPanel title="Comparison" subtitle="Load and speed">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} width={32} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '6px 10px', fontSize: '12px' }}
              formatter={(value, name) => [String(name) === 'load' ? `${Number(value ?? 0).toFixed(1)} units` : `${Number(value ?? 0).toFixed(1)} mph`, String(name) === 'load' ? 'Load' : 'Speed']}
            />
            <Bar dataKey="load" fill="var(--accent-performance)" radius={[2, 2, 0, 0]} name="load" />
            <Bar dataKey="speed" fill="var(--risk-low)" radius={[2, 2, 0, 0]} name="speed" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}
