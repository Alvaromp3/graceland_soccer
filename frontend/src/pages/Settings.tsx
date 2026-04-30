import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, CheckCircle, RefreshCw, Database, FileSearch, Settings as SettingsIcon } from 'lucide-react';
import { settingsApi } from '../services/api';
import DataAuditContent from '../components/settings/DataAuditContent';

type SettingsTab = 'general' | 'data-audit';

export default function Settings() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const { data: dateReferenceSetting, isLoading } = useQuery({
    queryKey: ['settings', 'date-reference'],
    queryFn: settingsApi.getDateReference,
  });

  const updateDateReferenceMutation = useMutation({
    mutationFn: (useToday: boolean) => settingsApi.setDateReference(useToday),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['analysis'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleDateReferenceChange = (useToday: boolean) => {
    updateDateReferenceMutation.mutate(useToday);
  };

  const tabs = [
    { id: 'general' as SettingsTab, label: 'General', icon: SettingsIcon },
    { id: 'data-audit' as SettingsTab, label: 'Data audit', icon: FileSearch },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title flex items-center gap-3">Settings</h1>
        <p className="caption mt-1">Application settings</p>
      </div>

      {/* Success message */}
      {saved && (
        <div className="p-4 rounded border border-[var(--accent-performance)]/30 bg-[var(--accent-performance-muted)] flex items-center gap-3 animate-slide-in-up">
          <CheckCircle className="w-5 h-5 text-[var(--accent-performance)]" />
          <span className="text-sm text-[var(--accent-performance)]">Settings saved successfully.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-[var(--accent-performance)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span className="font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <div className="max-w-2xl">
          {/* Date Reference Setting */}
          <div className="panel panel--elevated p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                <Calendar className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Date reference</h2>
                <p className="text-sm text-slate-500">Risk calculation period (45 days)</p>
              </div>
            </div>

            <div className="space-y-4">
            <div className="p-4 bg-white/5 rounded-xl border border-white/10">
              <p className="text-sm text-slate-400 mb-4">
                Choose from when the 45 days are counted for injury risk:
              </p>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Option 1: Today's Date */}
                  <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-white/5 ${
                    dateReferenceSetting?.useTodayAsReference
                      ? 'bg-white/10 border-cyan-500/30'
                      : 'bg-white/5 border-white/10'
                  }`}>
                    <input
                      type="radio"
                      name="dateReference"
                      checked={dateReferenceSetting?.useTodayAsReference === true}
                      onChange={() => handleDateReferenceChange(true)}
                      className="mt-1 w-4 h-4 text-cyan-500 bg-black border-white/20 focus:ring-cyan-500 focus:ring-2"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-white">From current day</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        The 45 days are counted from today. Best for real-time monitoring.
                      </p>
                    </div>
                  </label>

                  {/* Option 2: Last Training Date */}
                  <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-white/5 ${
                    dateReferenceSetting?.useTodayAsReference === false
                      ? 'bg-white/10 border-cyan-500/30'
                      : 'bg-white/5 border-white/10'
                  }`}>
                    <input
                      type="radio"
                      name="dateReference"
                      checked={dateReferenceSetting?.useTodayAsReference === false}
                      onChange={() => handleDateReferenceChange(false)}
                      className="mt-1 w-4 h-4 text-cyan-500 bg-black border-white/20 focus:ring-cyan-500 focus:ring-2"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-white">From last training or match day</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        The 45 days are counted from the last session or match recorded in your CSV.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Current setting info */}
              {dateReferenceSetting && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Current setting:</p>
                  <p className="text-sm text-slate-300 font-medium">
                    {dateReferenceSetting.useTodayAsReference ? 'From current day' : 'From last training or match day'}
                  </p>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'data-audit' && <DataAuditContent />}
    </div>
  );
}
