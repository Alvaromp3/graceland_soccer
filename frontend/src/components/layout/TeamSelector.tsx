import { Users, UserCheck } from 'lucide-react';
import { useTeam } from '../../contexts/useTeam';

export default function TeamSelector() {
  const { currentTeam, switchTeam, teamStatus } = useTeam();

  return (
    <div
      className="flex rounded overflow-hidden border border-[var(--border-default)] bg-[var(--bg-elevated)]"
      role="tablist"
      aria-label="Team selection"
    >
      <button
        type="button"
        role="tab"
        aria-selected={currentTeam === 'mens'}
        onClick={() => switchTeam('mens')}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors min-w-[90px] justify-center
          ${
            currentTeam === 'mens'
              ? 'bg-[var(--accent-performance-muted)] text-[var(--accent-performance)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
          }
        `}
      >
        <Users className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Men's</span>
        {teamStatus?.mens?.loaded && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              currentTeam === 'mens'
                ? 'bg-[var(--accent-performance)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]'
            }`}
          >
            {teamStatus.mens.rowCount}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={currentTeam === 'womens'}
        onClick={() => switchTeam('womens')}
        className={`
          flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors min-w-[90px] justify-center
          ${
            currentTeam === 'womens'
              ? 'bg-[var(--accent-performance-muted)] text-[var(--accent-performance)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
          }
        `}
      >
        <UserCheck className="w-4 h-4 flex-shrink-0" />
        <span className="hidden sm:inline">Women's</span>
        {teamStatus?.womens?.loaded && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              currentTeam === 'womens'
                ? 'bg-[var(--accent-performance)] text-white'
                : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)]'
            }`}
          >
            {teamStatus.womens.rowCount}
          </span>
        )}
      </button>
    </div>
  );
}
