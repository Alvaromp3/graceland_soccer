import { useState, useRef } from 'react';
import {
  FileUp,
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  Upload,
  Loader2,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import MetricBlock from '../components/dashboard/MetricBlock';
import LoadChart from '../components/charts/LoadChart';
import RiskDonut from '../components/charts/RiskDonut';
import PlayerList from '../components/dashboard/PlayerList';
import {
  useDashboardKPIs,
  useLoadHistory,
  useRiskDistribution,
  useHighRiskPlayers,
  useTopPerformers,
  useDataStatus,
} from '../hooks/useDashboard';
import { dataApi } from '../services/api';
import { useTeam } from '../contexts/useTeam';
import TeamSelector from '../components/layout/TeamSelector';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<{ success: boolean; message: string } | null>(null);
  const { currentTeam, teamStatus } = useTeam();
  const hasAnyData = Boolean(teamStatus?.mens?.loaded || teamStatus?.womens?.loaded);

  const { data: dataStatus, isPending: dataStatusPending, isError: dataStatusError } = useDataStatus();
  const { data: kpis } = useDashboardKPIs();
  const { data: loadHistory } = useLoadHistory();
  const { data: riskDistribution } = useRiskDistribution();
  const { data: highRiskPlayers } = useHighRiskPlayers();
  const { data: topPerformers } = useTopPerformers();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => dataApi.upload(file, currentTeam),
    onSuccess: (data) => {
      // Targeted invalidation — avoid refetching every route/query at once (slow on Render free tier).
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['players'] });
      void queryClient.invalidateQueries({ queryKey: ['data', 'status'] });
      void queryClient.invalidateQueries({ queryKey: ['teamStatus'] });
      void queryClient.invalidateQueries({ queryKey: ['analysis'] });
      setUploadStatus({
        success: true,
        message: `CSV loaded: ${data.rowCount} rows, ${data.players.length} players`,
      });
    },
    onError: (error: Error) => {
      setUploadStatus({ success: false, message: error?.message || 'Upload failed. Check file format and try again.' });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setUploadStatus({ success: false, message: 'Please select a CSV file.' });
        return;
      }
      setUploadStatus(null);
      uploadMutation.mutate(file);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const teamLabel = currentTeam === 'mens' ? "Men's Team" : "Women's Team";

  if (!hasAnyData) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full animate-fade-in">
          <div className="panel panel--elevated p-8 text-center">
            <h2 className="page-title mb-2">Graceland Soccer Analytics</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Upload Catapult GPS data to analyze performance, injury risk, and recommendations.
            </p>
            <p className="caption mb-3">Upload CSV for:</p>
            <div className="flex justify-center mb-6">
              <TeamSelector />
            </div>
            <p className="caption mb-6">The CSV will be assigned to the team selected above.</p>
            {uploadStatus && (
              <div
                className={`mb-6 p-3 rounded flex items-center gap-2 text-sm border ${
                  uploadStatus.success
                    ? 'bg-[var(--accent-performance-muted)] border-[var(--accent-performance)]/30 text-[var(--accent-performance)]'
                    : 'bg-[var(--accent-risk-high)]/10 border-[var(--accent-risk-high)]/30 text-[var(--accent-risk-high)]'
                }`}
              >
                {uploadStatus.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                <span>{uploadStatus.message}</span>
              </div>
            )}
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={uploadMutation.isPending}
                className="btn btn--primary w-full gap-2 py-3"
              >
                {uploadMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Uploading…
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4" />
                    Upload Catapult CSV
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (hasAnyData && dataStatusPending) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-performance)]" aria-hidden />
        <p className="text-sm">Loading dashboard…</p>
      </div>
    );
  }

  if (hasAnyData && dataStatusError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 max-w-md mx-auto text-center px-4">
        <AlertTriangle className="w-10 h-10 text-[var(--accent-risk-high)]" aria-hidden />
        <div>
          <p className="font-semibold text-[var(--text-primary)] mb-1">Could not reach the server</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Start the backend on port 8000, then refresh. If it is running, check the terminal for errors.
          </p>
        </div>
      </div>
    );
  }

  if (!dataStatus?.loaded) {
    return (
      <div className="space-y-6 animate-fade-in">
        <p className="section-title text-[var(--text-secondary)]">Dashboard – {teamLabel}</p>
        <p className="caption">No data for this team. Upload a CSV to view metrics.</p>
        <div className="panel panel--elevated p-8 text-center max-w-lg mx-auto">
          <h3 className="section-title mb-2">No data for {teamLabel}</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Upload a Catapult CSV for this team to view load, risk, and performance.
          </p>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={uploadMutation.isPending}
            className="btn btn--primary gap-2"
          >
            {uploadMutation.isPending ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <><FileUp className="w-4 h-4" /> Upload CSV for {teamLabel}</>
            )}
          </button>
          {uploadStatus && (
            <p className={`mt-4 text-sm ${uploadStatus.success ? 'text-[var(--accent-performance)]' : 'text-[var(--accent-risk-high)]'}`}>
              {uploadStatus.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  const totalPlayers = riskDistribution
    ? riskDistribution.low + riskDistribution.medium + riskDistribution.high
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="caption">Real-time metrics and injury risk · {teamLabel}</p>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          <button type="button" onClick={handleUploadClick} className="btn btn--secondary gap-2 text-sm">
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
        </div>
      </div>

      {uploadStatus && (
        <div
          className={`flex items-center justify-between p-3 rounded border text-sm animate-slide-in-up ${
            uploadStatus.success
              ? 'bg-[var(--accent-performance-muted)] border-[var(--accent-performance)]/30 text-[var(--accent-performance)]'
              : 'bg-[var(--accent-risk-high)]/10 border-[var(--accent-risk-high)]/30 text-[var(--accent-risk-high)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {uploadStatus.success ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{uploadStatus.message}</span>
          </div>
          <button type="button" onClick={() => setUploadStatus(null)} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Executive summary */}
      <div className="panel p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="metric-label mb-1">Actionable alerts</p>
            {highRiskPlayers && highRiskPlayers.length > 0 ? (
              <p className="text-sm text-[var(--text-primary)]">
                <span className="font-semibold text-[var(--accent-risk-high)]">{highRiskPlayers.length} player{highRiskPlayers.length > 1 ? 's' : ''} at high risk</span>
                {' — consider rest or reduce load.'}
              </p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">No players at high risk.</p>
            )}
            <Link to="/players?filter=high-risk" className="text-xs font-medium text-[var(--accent-performance)] hover:underline mt-1 inline-block">View players →</Link>
          </div>
          <div>
            <p className="metric-label mb-1">Period metrics</p>
            <p className="text-sm text-[var(--text-primary)]">
              Avg Load <strong className="tabular-nums">{kpis?.avgTeamLoad ?? 0}</strong>
              {' · '}
              Avg Speed <strong className="tabular-nums">{kpis?.avgTeamSpeed ?? 0}</strong> mph
            </p>
            <Link to="/analysis" className="text-xs font-medium text-[var(--accent-performance)] hover:underline mt-1 inline-block">Detailed analysis →</Link>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 p-3 rounded border border-[var(--border-default)] bg-[var(--bg-elevated)]">
        <Clock className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-[var(--text-primary)]">Risk assessment period</p>
          <p className="caption mt-0.5">
            Injury risk uses the <strong className="text-[var(--text-primary)]">last 45 days</strong> (Settings). Without recent data, risk is marked low.
          </p>
        </div>
      </div>

      {highRiskPlayers && highRiskPlayers.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded border border-[var(--accent-risk-high)]/30 bg-[var(--accent-risk-high)]/10 animate-slide-in-up">
          <div>
            <p className="section-title">High risk players</p>
            <p className="caption mt-0.5">{highRiskPlayers.length} player{highRiskPlayers.length > 1 ? 's' : ''} require attention</p>
          </div>
          <Link
            to="/analysis"
            className="btn btn--primary gap-1.5 text-sm bg-[var(--accent-risk-high)] border-[var(--accent-risk-high)] hover:opacity-90"
          >
            View details
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Metrics row — not cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricBlock value={kpis?.totalPlayers ?? 0} label="Active roster" sublabel="players" />
        <MetricBlock value={kpis?.avgTeamLoad ?? 0} label="Average load" sublabel="units/session" />
        <MetricBlock value={kpis?.highRiskPlayers ?? 0} label="High risk" sublabel="last 45 days" valueClassName="text-[var(--accent-risk-high)]" />
        <MetricBlock value={kpis?.avgTeamSpeed ?? 0} label="Average speed" sublabel="mph" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LoadChart data={loadHistory ?? []} />
        </div>
        <div className="panel panel--elevated">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Risk distribution</h3>
            <span className="caption">{totalPlayers} players</span>
          </div>
          <RiskDonut data={riskDistribution ?? { low: 0, medium: 0, high: 0 }} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded border border-[var(--border-subtle)]">
              <p className="metric-value text-lg text-[var(--risk-low)]">{riskDistribution?.low ?? 0}</p>
              <p className="metric-label mt-0.5">Low</p>
            </div>
            <div className="text-center p-2 rounded border border-[var(--border-subtle)]">
              <p className="metric-value text-lg text-[var(--risk-medium)]">{riskDistribution?.medium ?? 0}</p>
              <p className="metric-label mt-0.5">Medium</p>
            </div>
            <div className="text-center p-2 rounded border border-[var(--border-subtle)]">
              <p className="metric-value text-lg text-[var(--risk-high)]">{riskDistribution?.high ?? 0}</p>
              <p className="metric-label mt-0.5">High</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlayerList title="High risk players" players={highRiskPlayers ?? []} type="risk" viewAllLink="/players?filter=high-risk" />
        <PlayerList title="Top performers" players={topPerformers ?? []} type="top" viewAllLink="/players" />
      </div>
    </div>
  );
}
