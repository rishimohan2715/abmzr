// Shared types mirroring the FastAPI Pydantic schemas.

export interface GenerationPoint {
  start_time: string;
  actual: number | null;
  forecast: number | null;
  error: number | null;
  abs_error: number | null;
  forecast_publish_time: string | null;
  forecast_lead_hours: number | null;
  decision_date: string | null;
  gate_closure: string | null;
}

export interface GenerationResponse {
  start_date: string;
  end_date: string;
  decision_start: string;
  decision_end: string;
  count: number;
  latest_forecast_publish: string | null;
  mean_lead_hours: number | null;
  series: GenerationPoint[];
}

export interface HourlyError {
  hour: number;
  mae: number;
  bias: number;
  count: number;
}

export interface DailyError {
  date: string;
  mae: number;
  rmse: number;
  bias: number;
  count: number;
}

export interface ErrorBin {
  bin_start: number;
  bin_end: number;
  center: number;
  count: number;
}

export interface Distribution {
  bins: ErrorBin[];
  p10: number;
  p50: number;
  p90: number;
  p90_abs: number;
}

export interface Procurement {
  shortfall_energy_mwh: number;
  surplus_energy_mwh: number;
  total_gap_energy_mwh: number;
  p90_buffer_mw: number;
}

export interface MetricsResponse {
  start_date: string;
  end_date: string;
  sample_count: number;
  mae: number;
  rmse: number;
  bias: number;
  bias_pct: number;
  mape: number;
  mean_actual: number;
  normalised_mae_pct: number;
  peak_error: number;
  peak_error_time: string | null;
  worst_day: string | null;
  distribution: Distribution;
  procurement: Procurement;
  hourly: HourlyError[];
  daily: DailyError[];
}

export interface HorizonBucket {
  label: string;
  min_hours: number;
  max_hours: number;
  mae: number;
  bias: number;
  count: number;
}

export interface HorizonResponse {
  start_date: string;
  end_date: string;
  buckets: HorizonBucket[];
  day_ahead_mae: number | null;
}
