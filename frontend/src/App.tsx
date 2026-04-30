import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamProvider } from './contexts/TeamProvider';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';

const Players = lazy(() => import('./pages/Players'));
const Analysis = lazy(() => import('./pages/Analysis'));
const Lineup = lazy(() => import('./pages/Lineup'));
const Settings = lazy(() => import('./pages/Settings'));
const Rankings = lazy(() => import('./pages/Rankings'));
const TeamComparison = lazy(() => import('./pages/TeamComparison'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
      // Do not keep "loading" forever on slow networks; refetch can be manual via navigation.
      gcTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  const routeFallback = (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="panel panel--elevated p-6 bg-white text-center">
        <p className="text-sm text-[#64748b]">Loading page...</p>
      </div>
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TeamProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="players" element={<Suspense fallback={routeFallback}><Players /></Suspense>} />
              <Route path="analysis" element={<Suspense fallback={routeFallback}><Analysis /></Suspense>} />
              <Route path="lineup" element={<Suspense fallback={routeFallback}><Lineup /></Suspense>} />
              <Route path="rankings" element={<Suspense fallback={routeFallback}><Rankings /></Suspense>} />
              <Route path="comparison" element={<Suspense fallback={routeFallback}><TeamComparison /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={routeFallback}><Settings /></Suspense>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TeamProvider>
    </QueryClientProvider>
  );
}

export default App;
