import { createContext } from 'react';

export type TeamType = 'mens' | 'womens';

export interface TeamContextType {
  currentTeam: TeamType;
  switchTeam: (team: TeamType) => void;
  teamStatus: {
    mens: { loaded: boolean; rowCount: number };
    womens: { loaded: boolean; rowCount: number };
  } | null;
  isLoading: boolean;
}

export const TeamContext = createContext<TeamContextType | undefined>(undefined);

function sanitizeApiBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    return new URL(v).origin;
  } catch {
    return null;
  }
}

// In production we must hit the backend origin directly (no Vite proxy).
export const RESOLVED_API_ORIGIN = sanitizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

/** Avoid hanging forever when the API is down (fetch has no default timeout). */
export async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const finalUrl =
      RESOLVED_API_ORIGIN && typeof url === 'string' && url.startsWith('/')
        ? `${RESOLVED_API_ORIGIN}${url}`
        : url;
    const res = await fetch(finalUrl, { ...init, signal: ctrl.signal });
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        `HTTP ${res.status}: backend unavailable on Render (check backend Logs/Events — not a CORS bug).`,
      );
    }
    return res;
  } finally {
    window.clearTimeout(t);
  }
}

