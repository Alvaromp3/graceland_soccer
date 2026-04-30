import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  X,
  Trophy,
  Award,
  GitCompare,
} from 'lucide-react';
import Logo from './Logo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navGroups = [
  {
    label: 'Overview',
    items: [{ path: '/', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    label: 'Squad',
    items: [
      { path: '/players', icon: Users, label: 'Players' },
      { path: '/lineup', icon: Trophy, label: 'Best Lineup' },
      { path: '/rankings', icon: Award, label: 'Rankings' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { path: '/analysis', icon: BarChart3, label: 'Analysis' },
      { path: '/comparison', icon: GitCompare, label: 'Team Comparison' },
    ],
  },
  {
    label: 'System',
    items: [{ path: '/settings', icon: Settings, label: 'Settings' }],
  },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-56
          flex flex-col
          bg-[var(--bg-surface)]
          border-r border-[var(--border-subtle)]
          transform transition-transform duration-200 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size={32} className="flex-shrink-0 rounded" />
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-primary)] truncate text-sm">
                Graceland
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider truncate">
                Soccer Analytics
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-6">
              <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.path === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(item.path);
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        onClick={onClose}
                        className={`
                          flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium
                          transition-colors
                          ${
                            isActive
                              ? 'bg-[var(--accent-performance-muted)] text-[var(--accent-performance)] border-l-2 border-[var(--accent-performance)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border-l-2 border-transparent'
                          }
                        `}
                        style={isActive ? { marginLeft: -1 } : {}}
                      >
                        <Icon
                          className="w-5 h-5 flex-shrink-0"
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
