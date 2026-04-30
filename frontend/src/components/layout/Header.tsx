import { Menu } from 'lucide-react';
import TeamSelector from './TeamSelector';

interface HeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

export default function Header({ onMenuClick, pageTitle }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]"
      style={{ boxShadow: '0 1px 0 var(--border-subtle)' }}
    >
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        {pageTitle && (
          <h1 className="page-title truncate text-base sm:text-lg">
            {pageTitle}
          </h1>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <TeamSelector />
      </div>
    </header>
  );
}
