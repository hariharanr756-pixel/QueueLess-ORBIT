/**
 * Python FastAPI + Random Forest Prediction Adapter Contract.
 *
 * QueueLess ORBIT currently runs a deterministic, explainable queueing baseline
 * (`deterministic_baseline_v1`) so zero untrained ML accuracy claims are made.
 *
 * When a trained Python FastAPI service (`FASTAPI_PREDICT_URL`) is deployed and
 * configured in server environment variables, this module defines the typed
 * request/response schema for delegating wait-time inference.
 */

export interface FastApiPredictRequest {
  department_code: string;
  patients_ahead: number;
  active_doctors: number;
  open_counters: number;
  historical_service_min: number;
  appointment_delay_min: number;
  arrival_rate_per_hour: number;
  is_walk_in: boolean;
}

export interface FastApiPredictResponse {
  predicted_wait_min: number;
  predicted_wait_max: number;
  estimated_consultation_min: number;
  confidence: 'High' | 'Moderate' | 'Lower';
  feature_importances: Array<{ feature: string; contribution_min: number }>;
  model_version: string;
}

export function getMlAdapterStatus(): {
  activeMode: 'deterministic_baseline_v1';
  label: string;
  fastApiReady: boolean;
  fastApiEndpointContract: string;
} {
  const configuredUrl = process.env.FASTAPI_PREDICT_URL?.trim();
  return {
    activeMode: 'deterministic_baseline_v1',
    label: configuredUrl
      ? 'Deterministic Explainable Baseline (FastAPI Endpoint Configured)'
      : 'Deterministic Explainable Baseline (FastAPI + Random Forest Adapter Ready)',
    fastApiReady: true,
    fastApiEndpointContract: 'POST /v1/predict/wait-range (Python FastAPI + scikit-learn RandomForestRegressor)',
  };
}
