import type {
  CounterStatus,
  DoctorAvailability,
  HospitalStateSnapshot,
  PublicUser,
  QueueToken,
  SavedScenario,
  SimulationComparisonResult,
  SimulationParams,
  SimulationPresetId,
  SupabaseSyncResult,
  UserRole,
} from '../../shared/types.ts';

let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (memoryAuthToken) {
    headers.Authorization = `Bearer ${memoryAuthToken}`;
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
  }
  return data as T;
}

export interface PublicSummaryResponse {
  isSimulatedDemoData: true;
  modelEngine: HospitalStateSnapshot['modelEngine'];
  analytics: HospitalStateSnapshot['analytics'];
  departments: HospitalStateSnapshot['departments'];
  doctors: Array<{
    id: string;
    name: string;
    specialty: string;
    departmentId: string;
    availability: DoctorAvailability;
  }>;
  sampleTokens: Array<{
    tokenNumber: string;
    departmentId: string;
    status: QueueToken['status'];
    predictedWaitMin: number;
    predictedWaitMax: number;
    queuePosition: number;
  }>;
}

export const orbitApi = {
  getPublicSummary: () => apiRequest<PublicSummaryResponse>('/api/public/summary'),

  demoLogin: (role: UserRole) =>
    apiRequest<{ user: PublicUser; token: string }>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  login: (email: string, password: string) =>
    apiRequest<{ user: PublicUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (input: { name: string; email: string; password: string; role: UserRole }) =>
    apiRequest<{ user: PublicUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () =>
    apiRequest<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  requestRecovery: (email: string) =>
    apiRequest<{ sent: boolean; demoCode?: string; message: string }>('/api/auth/recover/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  confirmRecovery: (email: string, code: string, newPassword: string) =>
    apiRequest<{ ok: boolean; message: string }>('/api/auth/recover/confirm', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    }),

  getState: () => apiRequest<HospitalStateSnapshot>('/api/state'),

  bookAppointment: (input: {
    departmentId: string;
    doctorId?: string;
    date: string;
    timeSlot: string;
    notes?: string;
    patientName?: string;
    patientEmail?: string;
    patientPhone?: string;
  }) =>
    apiRequest<{
      appointment: unknown;
      token: QueueToken;
      snapshot: HospitalStateSnapshot;
      supabaseSync: SupabaseSyncResult;
    }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  registerWalkIn: (input: {
    patientName: string;
    phone?: string;
    departmentId: string;
    doctorId?: string;
    clinicianPriority?: boolean;
    priorityAuthorizedBy?: string;
    priorityReason?: string;
  }) =>
    apiRequest<{ token: QueueToken; snapshot: HospitalStateSnapshot }>('/api/queue/walk-in', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  callNext: (filters?: { departmentId?: string; doctorId?: string }) =>
    apiRequest<{ calledToken: QueueToken; snapshot: HospitalStateSnapshot }>('/api/queue/call-next', {
      method: 'POST',
      body: JSON.stringify(filters || {}),
    }),

  updateTokenStatus: (tokenId: string, status: QueueToken['status'], note?: string) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>(`/api/queue/${encodeURIComponent(tokenId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  authorizePriority: (
    tokenId: string,
    payload: { enable: boolean; authorizedBy: string; reason: string }
  ) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>(
      `/api/queue/${encodeURIComponent(tokenId)}/priority`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  updateDoctorAvailability: (doctorId: string, availability: DoctorAvailability) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>(
      `/api/doctors/${encodeURIComponent(doctorId)}/availability`,
      {
        method: 'PATCH',
        body: JSON.stringify({ availability }),
      }
    ),

  updateCounterStatus: (counterId: string, status: CounterStatus, departmentId?: string) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>(
      `/api/counters/${encodeURIComponent(counterId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, departmentId }),
      }
    ),

  actOnRecommendation: (recommendationId: string, decision: 'approve' | 'dismiss') =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>(
      `/api/recommendations/${encodeURIComponent(recommendationId)}/action`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }
    ),

  addDepartment: (input: {
    name: string;
    code: string;
    avgServiceMin: number;
    targetWaitMin: number;
    description?: string;
  }) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  addDoctor: (input: {
    name: string;
    specialty: string;
    departmentId: string;
    avgConsultationMin: number;
  }) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>('/api/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  addCounter: (input: {
    name: string;
    code: string;
    departmentId: string;
    status: CounterStatus;
  }) =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>('/api/admin/counters', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  runSimulation: (baselineParams: SimulationParams, scenarioParams: SimulationParams) =>
    apiRequest<{ comparison: SimulationComparisonResult; isSimulated: true }>(
      '/api/simulations/run',
      {
        method: 'POST',
        body: JSON.stringify({ baselineParams, scenarioParams }),
      }
    ),

  saveScenario: (input: {
    name: string;
    presetId?: SimulationPresetId | 'custom';
    baselineParams: SimulationParams;
    scenarioParams: SimulationParams;
  }) =>
    apiRequest<{ scenario: SavedScenario; snapshot: HospitalStateSnapshot }>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  markNotificationsRead: () =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>('/api/notifications/read', {
      method: 'POST',
    }),

  resetDemoData: () =>
    apiRequest<{ snapshot: HospitalStateSnapshot }>('/api/demo/reset', {
      method: 'POST',
    }),

  submitContact: (input: {
    name: string;
    email: string;
    organization: string;
    message: string;
  }) =>
    apiRequest<{ ok: boolean; id: string; message: string }>('/api/contact', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
