import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { TeamContext, fetchWithTimeout, RESOLVED_API_ORIGIN } from './teamContext';
import type { TeamType } from './teamContext';

export function TeamProvider({ children }: { children: ReactNode }) {
  const [currentTeam, setCurrentTeam] = useState<TeamType>('mens');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!RESOLVED_API_ORIGIN) return;
    const id = 'graceland-preconnect-api';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'preconnect';
    link.href = RESOLVED_API_ORIGIN;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }, []);

  const { data: teamStatus, isLoading } = useQuery({
    queryKey: ['teamStatus'],
    queryFn: async () => {
      try {
        // Render cold starts can exceed 12s; avoid AbortError spam and false "empty" team state.
        const response = await fetchWithTimeout('/api/settings/team-status', 28_000);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch team status');
        }
        return data.data;
      } catch (error) {
        const aborted =
          error instanceof DOMException
            ? error.name === 'AbortError'
            : error instanceof Error && error.name === 'AbortError';
        if (!aborted) {
          console.error('Error fetching team status:', error);
        }
        // Return default structure on error
        return {
          currentTeam: 'mens',
          mens: { loaded: false, rowCount: 0 },
          womens: { loaded: false, rowCount: 0 },
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
      const response = await fetchWithTimeout('/api/settings/switch-team', 28_000, {
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

