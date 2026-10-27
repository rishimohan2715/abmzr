import type {
  GenerationResponse,
  HorizonResponse,
  MetricsResponse,
} from "../types";

// In dev, Vite proxies /api -> :8000. In production the base can be overridden
// with VITE_API_BASE (e.g. the deployed backend URL on Render/Heroku).
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function fetchGeneration(
  startDate: string,
  endDate: string
): Promise<GenerationResponse> {
  return getJSON<GenerationResponse>(
    `/api/generation?startDate=${startDate}&endDate=${endDate}`
  );
}

export function fetchMetrics(
  startDate: string,
  endDate: string
): Promise<MetricsResponse> {
  return getJSON<MetricsResponse>(
    `/api/metrics?startDate=${startDate}&endDate=${endDate}`
  );
}

export function fetchHorizon(
  startDate: string,
  endDate: string
): Promise<HorizonResponse> {
  return getJSON<HorizonResponse>(
    `/api/horizon?startDate=${startDate}&endDate=${endDate}`
  );
}
