import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type TeamType = 'mens' | 'womens';

interface TeamContextType {
  currentTeam: TeamType;
  switchTeam: (team: TeamType) => void;
  teamStatus: {
    mens: { loaded: boolean; rowCount: number };
    womens: { loaded: boolean; rowCount: number };
  } | null;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

/** Avoid hanging forever when the API is down (fetch has no default timeout). */
async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(t);
  }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const [currentTeam, setCurrentTeam] = useState<TeamType>('mens');
  const queryClient = useQueryClient();

  const { data: teamStatus, isLoading } = useQuery({
    queryKey: ['teamStatus'],
    queryFn: async () => {
      try {
        const response = await fetchWithTimeout('/api/settings/team-status', 12000);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch team status');
        }
        return data.data;
      } catch (error) {
        console.error('Error fetching team status:', error);
        // Return default structure on error
        return {
          currentTeam: 'mens',
          mens: { loaded: false, rowCount: 0 },
          womens: { loaded: false, rowCount: 0 }
        };
      }
    },
    // Light polling: team CSV rarely changes without user action; heavy polling starves the API.
    staleTime: 120_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: 800,
  });

  const switchTeamMutation = useMutation({
    mutationFn: async (team: TeamType) => {
      try {
        const response = await fetchWithTimeout('/api/settings/switch-team', 15000, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team }),
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to switch team');
        }
        return data.data;
      } catch (error) {
        console.error('Error switching team:', error);
        throw error;
      }
    },
    onSuccess: (_data, team) => {
      setCurrentTeam(team);
      // Avoid invalidateQueries() with no filter — it refetches every query and floods /team-status.
      queryClient.invalidateQueries({ queryKey: ['teamStatus'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['data', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['analysis'] });
    },
  });

  // Sync currentTeam from server only on initial load (when we don't have a pending switch).
  // Do NOT force the user back to the team that has data — they must be able to switch
  // to the other tab (e.g. Women's) to upload that team's CSV when only Men's is loaded.
  useEffect(() => {
    if (!teamStatus?.currentTeam) return;
    setCurrentTeam(teamStatus.currentTeam);
  }, [teamStatus?.currentTeam]);

  const switchTeam = (team: TeamType) => {
    switchTeamMutation.mutate(team);
  };

  return (
    <TeamContext.Provider
      value={{
        currentTeam,
        switchTeam,
        teamStatus: teamStatus || null,
        isLoading,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}
