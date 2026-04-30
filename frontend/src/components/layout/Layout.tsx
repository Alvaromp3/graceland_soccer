import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/players': 'Players',
  '/analysis': 'Analysis',
  '/lineup': 'Best Lineup',
  '/rankings': 'Rankings',
  '/comparison': 'Team Comparison',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  if (pathname === '/') return routeTitles['/'] ?? 'Dashboard';
  for (const path of Object.keys(routeTitles)) {
    if (path !== '/' && pathname.startsWith(path)) return routeTitles[path];
  }
  return 'Dashboard';
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          pageTitle={pageTitle}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
