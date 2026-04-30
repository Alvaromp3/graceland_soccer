import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Player } from '../../types';

interface PlayerListProps {
  title: string;
  players: Player[];
  type: 'risk' | 'top';
  viewAllLink?: string;
}

export default function PlayerList({ title, players, type, viewAllLink }: PlayerListProps) {
  return (
    <div className="panel panel--elevated animate-slide-in-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">{title}</h3>
        {viewAllLink && (
          <Link
            to={viewAllLink}
            className="text-xs font-medium text-[var(--accent-performance)] hover:underline flex items-center gap-0.5"
          >
            View all
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <div className="space-y-0">
        {players.length === 0 ? (
          <p className="caption py-6 text-center">No players to display</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="pb-2 pr-3 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">#</th>
                <th className="pb-2 pr-3 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Name</th>
                {type === 'risk' && (
                  <th className="pb-2 pr-3 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Risk</th>
                )}
                {type === 'top' && (
                  <th className="pb-2 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-right">Load</th>
                )}
              </tr>
            </thead>
            <tbody>
              {players.slice(0, 5).map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 group"
                >
                  <td className="py-2.5 pr-3">
                    <span className="text-sm font-semibold text-[var(--text-primary)] font-[inherit] tabular-nums">
                      {player.number}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link
                      to={`/players?highlight=${player.id}`}
                      className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-performance)] transition-colors"
                    >
                      {player.name}
                    </Link>
                  </td>
                  {type === 'risk' && (
                    <td className="py-2.5">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded risk-badge--${player.riskLevel}`}
                      >
                        {player.riskLevel}
                      </span>
                    </td>
                  )}
                  {type === 'top' && (
                    <td className="py-2.5 text-right">
                      <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                        {player.avgLoad}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
