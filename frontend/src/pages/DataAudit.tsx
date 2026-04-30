import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Trash2, 
  RefreshCw,
  BarChart3,
  Shield,
  Zap,
  ChevronRight,
  Info,
  Sparkles,
  RotateCcw,
  FileSearch
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { dataApi, useDataStatus } from '../services/api';

export default function DataAudit() {
  const queryClient = useQueryClient();

  const { data: dataStatus } = useDataStatus();

  const { data: audit, isLoading, refetch } = useQuery({
    queryKey: ['data', 'audit'],
    queryFn: dataApi.getAudit,
    enabled: !!dataStatus?.loaded,
  });

  const cleanMutation = useMutation({
    mutationFn: () => dataApi.cleanOutliers('iqr', 3.0), // Fixed to 3.0 for permissive cleaning
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      refetch();
    },
  });

  const resetMutation = useMutation({
    mutationFn: dataApi.resetData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      refetch();
    },
  });

  // Prepare outlier chart data
  const outlierChartData = audit?.outliers 
    ? Object.entries(audit.outliers)
        .map(([col, data]: [string, any]) => ({
          name: col.replace(/\(.*\)/g, '').trim().slice(0, 15),
          outliers: data.count,
          percentage: data.percentage,
        }))
        .sort((a, b) => b.outliers - a.outliers)
        .slice(0, 8)
    : [];

  // No data state
  if (!dataStatus?.loaded) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center animate-fade-in">
        <div className="card p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-slate-800/60 border border-slate-700/50 rounded-2xl flex items-center justify-center">
            <Database className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No Data Loaded</h2>
          <p className="text-slate-400 text-sm mb-6">
            Load CSV data first to perform data audit.
          </p>
          <a 
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 btn-primary rounded-xl font-medium text-white text-sm"
          >
            Go to Dashboard
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const qualityColor = audit?.dataQualityScore >= 80 ? 'emerald' : audit?.dataQualityScore >= 60 ? 'yellow' : 'red';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileSearch className="w-7 h-7 text-slate-400" />
            Data Audit
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Analyze data quality and clean outliers
          </p>
        </div>

        {/* Status Badge */}
        {audit?.isCleaned && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-400 font-medium">Data Cleaned</span>
          </div>
        )}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 bg-${qualityColor}-500/10 rounded-lg`}>
              <Shield className={`w-5 h-5 text-${qualityColor}-400`} />
            </div>
            <span className="text-sm text-slate-400">Quality Score</span>
          </div>
          <p className={`text-3xl font-bold text-${qualityColor}-400`}>
            {audit?.dataQualityScore || 0}%
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Database className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-sm text-slate-400">Total Rows</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {audit?.totalRows?.toLocaleString() || 0}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-sm text-slate-400">Outlier Columns</span>
          </div>
          <p className="text-3xl font-bold text-orange-400">
            {Object.keys(audit?.outliers || {}).length}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Zap className="w-5 h-5 text-slate-400" />
            </div>
            <span className="text-sm text-slate-400">Players</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {audit?.totalPlayers || 0}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outliers Chart & Clean Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Outliers Chart */}
          {outlierChartData.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-white">Outliers by Column</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outlierChartData} layout="vertical">
                    <XAxis type="number" stroke="#475569" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="#475569" fontSize={10} width={100} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(51, 65, 85, 0.5)',
                        borderRadius: '12px',
                      }}
                      formatter={(value, name) => [
                        name === 'outliers' ? `${value} rows` : `${value}%`,
                        name === 'outliers' ? 'Outliers' : 'Percentage'
                      ]}
                    />
                    <Bar dataKey="outliers" fill="#f97316" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Clean Outliers Action */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                <Trash2 className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Clean Outliers</h3>
                <p className="text-sm text-slate-500">Remove extreme values using IQR method</p>
              </div>
            </div>

            <div className="mb-5 p-4 bg-slate-800/30 rounded-xl">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">
                  The IQR (Interquartile Range) method caps only extreme values outside Q1 - 3.0×IQR and Q3 + 3.0×IQR. 
                  This is a <strong className="text-slate-300">permissive approach</strong> that only removes truly extreme outliers, preserving most of your data.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => cleanMutation.mutate()}
                disabled={cleanMutation.isPending || Object.keys(audit?.outliers || {}).length === 0}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
              >
                {cleanMutation.isPending ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Clean Outliers
                  </>
                )}
              </button>

              {audit?.isCleaned && (
                <button
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {resetMutation.isPending ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-5 h-5" />
                  )}
                  Reset
                </button>
              )}
            </div>

            {/* Cleaning Results */}
            {cleanMutation.data?.success && (
              <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-slide-in-up">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-400">Cleaning Complete!</p>
                </div>
                <p className="text-sm text-slate-400">{cleanMutation.data.message}</p>
                {cleanMutation.data.stats && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-500">Outliers Capped:</span>
                      <span className="text-white ml-2 font-medium">{cleanMutation.data.stats.totalOutliersCapped}</span>
                    </div>
                    <div className="p-2 bg-slate-800/50 rounded-lg">
                      <span className="text-slate-500">Columns Affected:</span>
                      <span className="text-white ml-2 font-medium">{cleanMutation.data.stats.columnsAffected}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Warnings & Stats */}
        <div className="space-y-6">
          {/* Warnings */}
          {audit?.warnings && audit.warnings.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <h3 className="font-semibold text-white">Warnings</h3>
              </div>
              <div className="space-y-2">
                {audit.warnings.map((warning: string, idx: number) => (
                  <div key={idx} className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-xs text-yellow-400">{warning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {audit?.recommendations && audit.recommendations.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold text-white">Recommendations</h3>
              </div>
              <div className="space-y-2">
                {audit.recommendations.map((rec: string, idx: number) => (
                  <div key={idx} className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <p className="text-xs text-cyan-400">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column Stats */}
          {audit?.columnStats && Object.keys(audit.columnStats).length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-slate-400" />
                <h3 className="font-semibold text-white">Key Metrics</h3>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {Object.entries(audit.columnStats).slice(0, 5).map(([col, stats]: [string, any]) => (
                  <div key={col} className="p-3 bg-slate-800/30 rounded-lg">
                    <p className="text-xs text-slate-400 mb-2 truncate" title={col}>{col}</p>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500">Mean:</span>
                        <span className="text-white ml-1">{stats.mean}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Std:</span>
                        <span className="text-white ml-1">{stats.std}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Min:</span>
                        <span className="text-white ml-1">{stats.min}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Max:</span>
                        <span className="text-white ml-1">{stats.max}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
