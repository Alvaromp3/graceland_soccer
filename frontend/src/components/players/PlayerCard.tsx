import { AlertTriangle, Clock } from 'lucide-react';
import type { Player } from '../../types';

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
}

const riskStyles = {
  low: {
    bg: 'bg-[#1e40af]/10',
    text: 'text-[#1e40af]',
    border: 'border-[#1e40af]/30',
  },
  medium: {
    bg: 'bg-accent-yellow/10',
    text: 'text-accent-yellow',
    border: 'border-accent-yellow/30',
  },
  high: {
    bg: 'bg-accent-red/10',
    text: 'text-accent-red',
    border: 'border-accent-red/30',
  },
};

export default function PlayerCard({ player, onClick }: PlayerCardProps) {
  const risk = riskStyles[player.riskLevel];

  return (
    <div
      onClick={onClick}
      className="bg-dark-800 rounded-xl p-5 border border-dark-700 hover:border-dark-600 hover:shadow-lg hover:shadow-dark-900/50 transition-all duration-300 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar with number */}
          <div className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-accent-blue to-accent-cyan rounded-xl flex items-center justify-center">
              <span className="text-xl font-bold text-white">{player.number}</span>
            </div>
            {/* Risk indicator dot */}
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-dark-800 ${
              player.riskLevel === 'high' ? 'bg-accent-red' :
              player.riskLevel === 'medium' ? 'bg-accent-yellow' : 'bg-[#1e40af]'
            }`} />
          </div>
          
          <div>
            <h3 className="font-semibold text-white group-hover:text-accent-cyan transition-colors">
              {player.name}
            </h3>
            <p className="text-sm text-slate-400">#{player.number}</p>
          </div>
        </div>

        {/* Risk badge */}
        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase flex items-center gap-1 ${risk.bg} ${risk.text} border ${risk.border}`}>
          {player.riskLevel === 'high' && <AlertTriangle className="w-3 h-3" />}
          {player.riskLevel}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-dark-900 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-white">{player.avgLoad}</p>
          <p className="text-xs text-slate-400">Avg Load</p>
        </div>
        <div className="bg-dark-900 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-white">{player.avgSpeed}</p>
          <p className="text-xs text-slate-400">Avg Speed</p>
        </div>
        <div className="bg-dark-900 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-white">{player.sessions}</p>
          <p className="text-xs text-slate-400">Sessions</p>
        </div>
      </div>

      {/* Last session */}
      {player.lastSession && (
        <div className="mt-3 pt-3 border-t border-dark-700 flex items-center gap-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          <span>Last session: {player.lastSession}</span>
        </div>
      )}
    </div>
  );
}
