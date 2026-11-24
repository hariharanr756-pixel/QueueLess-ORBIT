export type UserRole = 'patient' | 'staff' | 'admin';

export type DoctorAvailability = 'Available' | 'Busy' | 'On Break' | 'Unavailable';

export type CounterStatus = 'Open' | 'Closed' | 'Maintenance';

export type TokenType = 'appointment' | 'walk_in';

export type TokenStatus =
  | 'waiting'
  | 'called'
  | 'in_consultation'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export type PriorityLevel = 'standard' | 'clinician_priority';

export type PredictionConfidence = 'High' | 'Moderate' | 'Lower';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isDemo: boolean;
  patientId?: string;
  doctorId?: string;
  title?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  avgServiceMin: number;
  targetWaitMin: number;
  active: boolean;
  description: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  departmentId: string;
  secondaryDepartmentIds: string[];
  availability: DoctorAvailability;
  avgConsultationMin: number;
  assignedCounterId?: string;
  activeTokenId?: string | null;
  completedToday: number;
}

export interface Counter {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  status: CounterStatus;
  assignedDoctorId?: string | null;
  currentTokenId?: string | null;
  servedToday: number;
}

export interface Patient {
  id: string;
  name: string;
  mrn: string;
  age: number;
  phone: string;
  email: string;
  isSimulatedDemo: boolean;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  departmentId: string;
  doctorId: string;
  date: string;
  timeSlot: string;
  notes: string;
  status: 'scheduled' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  tokenId?: string;
  createdAt: string;
}

export interface SupabaseSyncResult {
  synced: boolean;
  status: 'saved' | 'not_configured' | 'table_missing' | 'error';
  message: string;
  rowId?: string;
}

export interface ContributingFactor {
  label: string;
  impactMinutes: number;
  detail: string;
}

export interface Prediction {
  id: string;
  tokenId: string;
  departmentId: string;
  predictedWaitMin: number;
  predictedWaitMax: number;
  estimatedConsultationMin: number;
  uncertaintyMinutes: number;
  confidence: PredictionConfidence;
  contributingFactors: ContributingFactor[];
  modelEngine: 'deterministic_baseline_v1' | 'fastapi_random_forest';
  calculatedAt: string;
}

export interface QueueToken {
  id: string;
  tokenNumber: string;
  patientId: string;
  patientName: string;
  departmentId: string;
  doctorId: string;
  counterId?: string | null;
  appointmentId?: string | null;
  type: TokenType;
  status: TokenStatus;
  arrivalTime: string;
  scheduledTime?: string | null;
  delayMinutes: number;
  priorityLevel: PriorityLevel;
  priorityAuthorizedBy?: string | null;
  priorityReason?: string | null;
  queuePosition: number;
  patientsAhead: number;
  predictedWaitMin: number;
  predictedWaitMax: number;
  confidence: PredictionConfidence;
  contributingFactors: ContributingFactor[];
  calledAt?: string | null;
  consultationStartTime?: string | null;
  consultationEndTime?: string | null;
}

export interface Consultation {
  id: string;
  tokenId: string;
  tokenNumber: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  departmentId: string;
  counterId?: string | null;
  startedAt: string;
  completedAt?: string | null;
  durationMinutes?: number | null;
  status: 'active' | 'completed';
}

export interface OrchestrationRecommendation {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  summary: string;
  departmentId?: string;
  actionType: 'open_counter' | 'rebalance_queue' | 'notify_patients' | 'review_schedule';
  actionLabel: string;
  targetCounterId?: string;
  estimatedWaitReductionMin: number;
  contributingFactors: string[];
  status: 'pending' | 'approved' | 'dismissed';
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface NotificationItem {
  id: string;
  targetRole: UserRole | 'all';
  targetPatientId?: string;
  title: string;
  message: string;
  category: 'queue' | 'doctor' | 'counter' | 'priority' | 'appointment';
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  pillar: 'PREDICT' | 'ORCHESTRATE' | 'PROTECT' | 'EXPLAIN';
  actorName: string;
  actorRole: UserRole | 'system';
  action: string;
  whatChanged: string;
  why: string;
  contributingFactors: string[];
  recommendedAction: string;
  approval: string;
  timestamp: string;
}

export type SimulationPresetId =
  | 'normal_operations'
  | 'patient_surge'
  | 'doctor_unavailable'
  | 'additional_counter'
  | 'appointment_delays';

export interface SimulationParams {
  incomingPatientVolume: number;
  doctorAvailability: number;
  openCounters: number;
  consultationDuration: number;
  appointmentDelays: number;
  patientArrivalRate: number;
}

export interface SimulationMetrics {
  predictedWaitMin: number;
  predictedWaitMax: number;
  avgWaitMinutes: number;
  queueClearanceMinutes: number;
  doctorUtilizationPct: number;
  counterUtilizationPct: number;
  throughputPerHour: number;
  backlogDeltaPerHour: number;
  fairnessScore: number;
  bottleneckType: string;
  bottleneckSeverity: 'Low' | 'Moderate' | 'High' | 'Critical';
  hourlyProjection: Array<{
    hour: string;
    waitingQueue: number;
    avgWaitMin: number;
    throughput: number;
  }>;
}

export interface SimulationComparisonResult {
  baselineParams: SimulationParams;
  scenarioParams: SimulationParams;
  before: SimulationMetrics;
  after: SimulationMetrics;
  deltas: {
    avgWaitDiff: number;
    waitMinDiff: number;
    waitMaxDiff: number;
    clearanceDiff: number;
    doctorUtilDiff: number;
    counterUtilDiff: number;
    fairnessDiff: number;
  };
  explanation: {
    whatChanged: string;
    why: string;
    contributingFactors: string[];
    recommendedAction: string;
    modelDisclosure: string;
  };
}

export interface SavedScenario {
  id: string;
  name: string;
  presetId?: SimulationPresetId | 'custom';
  createdBy: string;
  createdAt: string;
  params: SimulationParams;
  comparison: SimulationComparisonResult;
  isSimulated: true;
}

export interface FairnessSummary {
  fairnessIndex: number;
  clinicianPriorityCount: number;
  maxStandardWaitMin: number;
  starvationGuardActive: boolean;
  policyNote: string;
}

export interface AnalyticsSummary {
  totalWaiting: number;
  activeConsultations: number;
  completedConsultations: number;
  avgPredictedWaitMin: number;
  avgPredictedWaitMax: number;
  openCounters: number;
  totalCounters: number;
  activeDoctors: number;
  totalDoctors: number;
  walkInCount: number;
  appointmentCount: number;
  noShowCount: number;
  cancelledCount: number;
  hourlyArrivals: Array<{
    hour: string;
    arrivals: number;
    completed: number;
    walkIns: number;
    appointments: number;
  }>;
  departmentWaitStats: Array<{
    departmentId: string;
    departmentName: string;
    waitingCount: number;
    avgWaitMin: number;
    avgWaitMax: number;
    targetWaitMin: number;
  }>;
  doctorUtilization: Array<{
    doctorId: string;
    doctorName: string;
    availability: DoctorAvailability;
    waitingAssigned: number;
    completedToday: number;
    utilizationPct: number;
  }>;
}

export interface HospitalStateSnapshot {
  isSimulatedDemoData: true;
  modelEngine: {
    activeMode: 'deterministic_baseline_v1';
    label: string;
    fastApiReady: boolean;
    fastApiEndpointContract: string;
  };
  lastRecalculatedAt: string;
  departments: Department[];
  doctors: Doctor[];
  counters: Counter[];
  patients: Patient[];
  appointments: Appointment[];
  queueTokens: QueueToken[];
  consultations: Consultation[];
  predictions: Prediction[];
  recommendations: OrchestrationRecommendation[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  scenarios: SavedScenario[];
  fairness: FairnessSummary;
  analytics: AnalyticsSummary;
}
