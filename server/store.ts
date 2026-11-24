import crypto from 'crypto';
import type {
  Appointment,
  AuditLog,
  Consultation,
  Counter,
  CounterStatus,
  Department,
  Doctor,
  DoctorAvailability,
  HospitalStateSnapshot,
  NotificationItem,
  OrchestrationRecommendation,
  Patient,
  PublicUser,
  QueueToken,
  SavedScenario,
  SimulationParams,
  SimulationPresetId,
} from '../shared/types.ts';
import {
  deriveBaselineSimulationParams,
  getPresetSimulationParams,
  recalculateHospitalIntelligence,
  runOrbitSimulation,
} from '../shared/orbitEngine.ts';
import { getMlAdapterStatus } from './mlAdapter.ts';

function minutesAgoIso(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Replaceable Hospital Data Layer.
 * Implements PostgreSQL/Firestore-ready entity collections in memory for
 * zero-friction interactive demo & real-time WebSocket synchronization.
 */
export class HospitalStore {
  private departments: Department[] = [];
  private doctors: Doctor[] = [];
  private counters: Counter[] = [];
  private patients: Patient[] = [];
  private appointments: Appointment[] = [];
  private queueTokens: QueueToken[] = [];
  private consultations: Consultation[] = [];
  private recommendations: OrchestrationRecommendation[] = [];
  private notifications: NotificationItem[] = [];
  private auditLogs: AuditLog[] = [];
  private scenarios: SavedScenario[] = [];
  private tokenSequence = 124;
  private contactMessages: Array<{
    id: string;
    name: string;
    email: string;
    organization: string;
    message: string;
    createdAt: string;
  }> = [];

  private lastSnapshot!: HospitalStateSnapshot;

  constructor() {
    this.resetDemoData('System Initialization');
  }

  public getSnapshot(): HospitalStateSnapshot {
    return this.lastSnapshot;
  }

  private recompute(): HospitalStateSnapshot {
    const result = recalculateHospitalIntelligence(
      this.departments,
      this.doctors,
      this.counters,
      this.queueTokens,
      this.recommendations
    );
    this.queueTokens = result.queueTokens;
    this.recommendations = result.recommendations;

    this.lastSnapshot = {
      isSimulatedDemoData: true,
      modelEngine: getMlAdapterStatus(),
      lastRecalculatedAt: new Date().toISOString(),
      departments: [...this.departments],
      doctors: [...this.doctors],
      counters: [...this.counters],
      patients: [...this.patients],
      appointments: [...this.appointments],
      queueTokens: [...this.queueTokens],
      consultations: [...this.consultations],
      predictions: result.predictions,
      recommendations: [...this.recommendations],
      notifications: [...this.notifications].slice(0, 40),
      auditLogs: [...this.auditLogs].slice(0, 60),
      scenarios: [...this.scenarios],
      fairness: result.fairness,
      analytics: result.analytics,
    };
    return this.lastSnapshot;
  }

  private addAudit(entry: Omit<AuditLog, 'id' | 'timestamp'>): void {
    this.auditLogs.unshift({
      ...entry,
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    });
  }

  private addNotification(entry: Omit<NotificationItem, 'id' | 'read' | 'createdAt'>): void {
    this.notifications.unshift({
      ...entry,
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  public resetDemoData(actorName = 'Demo Reset'): HospitalStateSnapshot {
    this.tokenSequence = 124;

    this.departments = [
      {
        id: 'dept-gen',
        name: 'General Medicine',
        code: 'GM',
        avgServiceMin: 11,
        targetWaitMin: 20,
        active: true,
        description: 'Primary adult consultations, acute care, and routine follow-ups.',
      },
      {
        id: 'dept-card',
        name: 'Cardiology',
        code: 'CD',
        avgServiceMin: 15,
        targetWaitMin: 24,
        active: true,
        description: 'Cardiac diagnostics, ECG reviews, and specialist consultations.',
      },
      {
        id: 'dept-ortho',
        name: 'Orthopedics',
        code: 'OR',
        avgServiceMin: 13,
        targetWaitMin: 22,
        active: true,
        description: 'Musculoskeletal evaluations, fracture follow-ups, and mobility care.',
      },
      {
        id: 'dept-derm',
        name: 'Dermatology',
        code: 'DM',
        avgServiceMin: 10,
        targetWaitMin: 18,
        active: true,
        description: 'Clinical dermatology, skin screenings, and outpatient procedures.',
      },
      {
        id: 'dept-peds',
        name: 'Pediatrics',
        code: 'PD',
        avgServiceMin: 12,
        targetWaitMin: 18,
        active: true,
        description: 'Child wellness visits, immunizations, and pediatric acute care.',
      },
      {
        id: 'dept-ent',
        name: 'ENT',
        code: 'EN',
        avgServiceMin: 11,
        targetWaitMin: 20,
        active: true,
        description: 'Ear, nose, and throat clinical assessments and outpatient care.',
      },
    ];

    // Core Demo Setup: 3 Doctors (cross-covering clinics; Admin can add more)
    this.doctors = [
      {
        id: 'doc-01',
        name: 'Dr. Kavitha Rao',
        specialty: 'Internal & General Medicine',
        departmentId: 'dept-gen',
        secondaryDepartmentIds: ['dept-peds', 'dept-derm'],
        availability: 'Available',
        avgConsultationMin: 11,
        assignedCounterId: 'cnt-01',
        activeTokenId: 'tok-101',
        completedToday: 9,
      },
      {
        id: 'doc-02',
        name: 'Dr. Rohan Verma',
        specialty: 'Interventional Cardiology',
        departmentId: 'dept-card',
        secondaryDepartmentIds: ['dept-gen'],
        availability: 'Available',
        avgConsultationMin: 15,
        assignedCounterId: 'cnt-02',
        activeTokenId: 'tok-102',
        completedToday: 7,
      },
      {
        id: 'doc-03',
        name: 'Dr. Vikram Iyer',
        specialty: 'Orthopedic Surgery & ENT Liaison',
        departmentId: 'dept-ortho',
        secondaryDepartmentIds: ['dept-ent'],
        availability: 'Available',
        avgConsultationMin: 13,
        assignedCounterId: 'cnt-03',
        activeTokenId: null,
        completedToday: 8,
      },
    ];

    // Core Demo Setup: 4 Counters (3 Open, Counter 4 Standby Ready to Open)
    this.counters = [
      {
        id: 'cnt-01',
        name: 'Counter 1',
        code: 'C1',
        departmentId: 'dept-gen',
        status: 'Open',
        assignedDoctorId: 'doc-01',
        currentTokenId: 'tok-101',
        servedToday: 11,
      },
      {
        id: 'cnt-02',
        name: 'Counter 2',
        code: 'C2',
        departmentId: 'dept-card',
        status: 'Open',
        assignedDoctorId: 'doc-02',
        currentTokenId: 'tok-102',
        servedToday: 8,
      },
      {
        id: 'cnt-03',
        name: 'Counter 3',
        code: 'C3',
        departmentId: 'dept-ortho',
        status: 'Open',
        assignedDoctorId: 'doc-03',
        currentTokenId: 'tok-103',
        servedToday: 9,
      },
      {
        id: 'cnt-04',
        name: 'Counter 4 (Flex Standby)',
        code: 'C4',
        departmentId: 'dept-card',
        status: 'Closed',
        assignedDoctorId: null,
        currentTokenId: null,
        servedToday: 0,
      },
    ];

    // 24 Fictional Demo Patients
    const patientNames = [
      'Ananya Sharma',
      'Siddharth Kulkarni',
      'Meera Krishnan',
      'Rajeshwari Nair',
      'Devansh Patel',
      'Nisha Deshmukh',
      'Karthik Subramanian',
      'Farah Siddiqui',
      'Arjun Malhotra',
      'Lakshmi Venkatesh',
      'Pranav Joshi',
      'Sneha Chatterjee',
      'Harshvardhan Rao',
      'Divya Sundaram',
      'Ritesh Agarwal',
      'Pooja Bhatia',
      'Nikhil Hegde',
      'Aishwarya Pillai',
      'Varun Kapoor',
      'Shruti Bansal',
      'Manoj Tiwari',
      'Swati Gokhale',
      'Deepak Choudhary',
      'Revathi Balaji',
    ];

    this.patients = patientNames.map((name, idx) => ({
      id: `pat-${String(idx + 1).padStart(2, '0')}`,
      name,
      mrn: `MRN-${2401 + idx}`,
      age: 24 + ((idx * 7) % 48),
      phone: `+91 98000 ${String(10100 + idx * 37).slice(0, 5)}`,
      email:
        idx === 0
          ? 'patient@orbit-demo.health'
          : `${name.toLowerCase().replace(/\s+/g, '.')}@demo.orbit`,
      isSimulatedDemo: true,
    }));

    const today = todayDateStr();

    // Build 24 queue tokens across statuses (14 waiting, 1 called, 2 in_consultation, 5 completed, 1 no_show, 1 cancelled)
    const tokenConfigs: Array<{
      patIdx: number;
      num: number;
      dept: string;
      doc: string;
      cnt: string | null;
      type: 'appointment' | 'walk_in';
      status: QueueToken['status'];
      arrMinsAgo: number;
      delay: number;
      slot?: string;
      priority?: boolean;
      priorityBy?: string;
      priorityReason?: string;
    }> = [
      // Active consultations (2)
      { patIdx: 1, num: 101, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'in_consultation', arrMinsAgo: 34, delay: 0, slot: '09:30' },
      { patIdx: 2, num: 102, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'appointment', status: 'in_consultation', arrMinsAgo: 31, delay: 4, slot: '09:30' },
      // Called (1)
      { patIdx: 3, num: 103, dept: 'dept-ortho', doc: 'doc-03', cnt: 'cnt-03', type: 'appointment', status: 'called', arrMinsAgo: 28, delay: 0, slot: '09:45' },
      // Waiting (14) — Note: patIdx 0 is Ananya Sharma (Demo Patient) holding ORB-104 in Cardiology under Dr. Rohan Verma!
      { patIdx: 0, num: 104, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'appointment', status: 'waiting', arrMinsAgo: 26, delay: 5, slot: '10:00' },
      { patIdx: 4, num: 105, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'waiting', arrMinsAgo: 25, delay: 0, slot: '10:00' },
      { patIdx: 5, num: 106, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'walk_in', status: 'waiting', arrMinsAgo: 23, delay: 6 },
      { patIdx: 6, num: 107, dept: 'dept-ortho', doc: 'doc-03', cnt: 'cnt-03', type: 'appointment', status: 'waiting', arrMinsAgo: 21, delay: 3, slot: '10:15' },
      { patIdx: 7, num: 108, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'walk_in', status: 'waiting', arrMinsAgo: 19, delay: 0, priority: true, priorityBy: 'Dr. Kavitha Rao', priorityReason: 'Clinician-authorized post-op fever review' },
      { patIdx: 8, num: 109, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'appointment', status: 'waiting', arrMinsAgo: 17, delay: 8, slot: '10:30' },
      { patIdx: 9, num: 110, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'waiting', arrMinsAgo: 15, delay: 0, slot: '10:30' },
      { patIdx: 10, num: 111, dept: 'dept-peds', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'waiting', arrMinsAgo: 14, delay: 4, slot: '10:45' },
      { patIdx: 11, num: 112, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'walk_in', status: 'waiting', arrMinsAgo: 12, delay: 5 },
      { patIdx: 12, num: 113, dept: 'dept-ortho', doc: 'doc-03', cnt: 'cnt-03', type: 'walk_in', status: 'waiting', arrMinsAgo: 10, delay: 0 },
      { patIdx: 13, num: 114, dept: 'dept-derm', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'waiting', arrMinsAgo: 9, delay: 0, slot: '11:00' },
      { patIdx: 14, num: 115, dept: 'dept-ent', doc: 'doc-03', cnt: 'cnt-03', type: 'walk_in', status: 'waiting', arrMinsAgo: 7, delay: 2 },
      { patIdx: 15, num: 116, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'walk_in', status: 'waiting', arrMinsAgo: 5, delay: 0 },
      { patIdx: 16, num: 117, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'appointment', status: 'waiting', arrMinsAgo: 3, delay: 6, slot: '11:15' },
      // Completed (5)
      { patIdx: 17, num: 118, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'completed', arrMinsAgo: 95, delay: 0, slot: '08:30' },
      { patIdx: 18, num: 119, dept: 'dept-card', doc: 'doc-02', cnt: 'cnt-02', type: 'appointment', status: 'completed', arrMinsAgo: 88, delay: 0, slot: '08:45' },
      { patIdx: 19, num: 120, dept: 'dept-ortho', doc: 'doc-03', cnt: 'cnt-03', type: 'walk_in', status: 'completed', arrMinsAgo: 78, delay: 0 },
      { patIdx: 20, num: 121, dept: 'dept-gen', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'completed', arrMinsAgo: 68, delay: 2, slot: '09:00' },
      { patIdx: 21, num: 122, dept: 'dept-ortho', doc: 'doc-03', cnt: 'cnt-03', type: 'appointment', status: 'completed', arrMinsAgo: 58, delay: 0, slot: '09:15' },
      // No-show (1)
      { patIdx: 22, num: 123, dept: 'dept-derm', doc: 'doc-01', cnt: 'cnt-01', type: 'appointment', status: 'no_show', arrMinsAgo: 62, delay: 15, slot: '09:00' },
      // Cancelled (1)
      { patIdx: 23, num: 124, dept: 'dept-ent', doc: 'doc-03', cnt: 'cnt-03', type: 'appointment', status: 'cancelled', arrMinsAgo: 54, delay: 0, slot: '09:15' },
    ];

    this.appointments = [];
    this.consultations = [];
    this.queueTokens = tokenConfigs.map((cfg) => {
      const pat = this.patients[cfg.patIdx];
      const tokId = `tok-${cfg.num}`;
      const tokenNumber = `ORB-${cfg.num}`;
      let apptId: string | null = null;

      if (cfg.type === 'appointment') {
        apptId = `apt-${cfg.num}`;
        this.appointments.push({
          id: apptId,
          patientId: pat.id,
          patientName: pat.name,
          departmentId: cfg.dept,
          doctorId: cfg.doc,
          date: today,
          timeSlot: cfg.slot || '10:00',
          notes:
            cfg.patIdx === 0
              ? 'Follow-up ECG & blood pressure review (Demo Patient)'
              : 'Scheduled outpatient clinic visit',
          status:
            cfg.status === 'completed'
              ? 'completed'
              : cfg.status === 'cancelled'
              ? 'cancelled'
              : cfg.status === 'no_show'
              ? 'no_show'
              : 'checked_in',
          tokenId: tokId,
          createdAt: minutesAgoIso(cfg.arrMinsAgo + 45),
        });
      }

      if (cfg.status === 'in_consultation' || cfg.status === 'completed') {
        this.consultations.push({
          id: `con-${cfg.num}`,
          tokenId: tokId,
          tokenNumber,
          patientId: pat.id,
          patientName: pat.name,
          doctorId: cfg.doc,
          departmentId: cfg.dept,
          counterId: cfg.cnt,
          startedAt: minutesAgoIso(cfg.status === 'in_consultation' ? 7 : cfg.arrMinsAgo - 15),
          completedAt: cfg.status === 'completed' ? minutesAgoIso(cfg.arrMinsAgo - 27) : null,
          durationMinutes: cfg.status === 'completed' ? 12 : null,
          status: cfg.status === 'in_consultation' ? 'active' : 'completed',
        });
      }

      return {
        id: tokId,
        tokenNumber,
        patientId: pat.id,
        patientName: pat.name,
        departmentId: cfg.dept,
        doctorId: cfg.doc,
        counterId: cfg.cnt,
        appointmentId: apptId,
        type: cfg.type,
        status: cfg.status,
        arrivalTime: minutesAgoIso(cfg.arrMinsAgo),
        scheduledTime: cfg.slot ? `${today} ${cfg.slot}` : null,
        delayMinutes: cfg.delay,
        priorityLevel: cfg.priority ? 'clinician_priority' : 'standard',
        priorityAuthorizedBy: cfg.priorityBy || null,
        priorityReason: cfg.priorityReason || null,
        queuePosition: 0,
        patientsAhead: 0,
        predictedWaitMin: 10,
        predictedWaitMax: 16,
        confidence: 'High',
        contributingFactors: [],
        calledAt: cfg.status === 'called' ? minutesAgoIso(2) : null,
        consultationStartTime: cfg.status === 'in_consultation' ? minutesAgoIso(7) : null,
        consultationEndTime: cfg.status === 'completed' ? minutesAgoIso(cfg.arrMinsAgo - 27) : null,
      };
    });

    // Add a historical completed appointment for Demo Patient Ananya Sharma so appointment history is populated
    this.appointments.push({
      id: 'apt-hist-01',
      patientId: 'pat-01',
      patientName: 'Ananya Sharma',
      departmentId: 'dept-gen',
      doctorId: 'doc-01',
      date: '2026-10-18',
      timeSlot: '11:00',
      notes: 'Annual preventive health screening — completed',
      status: 'completed',
      createdAt: '2026-10-15T08:00:00.000Z',
    });

    this.recommendations = [];
    this.notifications = [
      {
        id: 'ntf-init-1',
        targetRole: 'patient',
        targetPatientId: 'pat-01',
        title: 'Digital Token ORB-104 Active',
        message:
          'You are checked in for Cardiology with Dr. Rohan Verma. Your live wait-time range updates automatically as clinic capacity shifts.',
        category: 'queue',
        read: false,
        createdAt: minutesAgoIso(18),
      },
      {
        id: 'ntf-init-2',
        targetRole: 'admin',
        title: 'Interactive Demo Mode Active',
        message:
          'Loaded 24 simulated patients, 3 active doctors, and 4 counters (Counter 4 on standby). All predictions use the explainable deterministic baseline.',
        category: 'counter',
        read: false,
        createdAt: minutesAgoIso(5),
      },
      {
        id: 'ntf-init-3',
        targetRole: 'staff',
        title: 'Clinician Priority Authorized (ORB-108)',
        message:
          'Dr. Kavitha Rao authorized priority placement for Farah Siddiqui (post-op fever review). Logged in PROTECT audit trail.',
        category: 'priority',
        read: false,
        createdAt: minutesAgoIso(14),
      },
    ];

    this.auditLogs = [
      {
        id: 'aud-init-1',
        pillar: 'PROTECT',
        actorName: 'Dr. Kavitha Rao',
        actorRole: 'staff',
        action: 'Clinician Priority Authorized',
        whatChanged: 'Token ORB-108 (Farah Siddiqui) moved to clinician-authorized priority lane in General Medicine.',
        why: 'Named clinician confirmed post-op fever review warrants bounded priority without violating starvation protection.',
        contributingFactors: ['Authorized clinician: Dr. Kavitha Rao', 'Standard patient wait variance remained within SLA'],
        recommendedAction: 'Monitor standard General Medicine tokens to maintain fairness index >= 85.',
        approval: 'Approved by Dr. Kavitha Rao',
        timestamp: minutesAgoIso(14),
      },
      {
        id: 'aud-init-2',
        pillar: 'PREDICT',
        actorName: actorName,
        actorRole: 'system',
        action: 'Baseline Queue Model Initialized',
        whatChanged: 'Calculated lower/upper wait-time ranges for 15 active waiting & called tokens across 6 departments.',
        why: 'Deterministic baseline initialized with 3 active clinicians, 3 open counters, and 1 standby counter.',
        contributingFactors: [
          '24 fictional demo records loaded',
          'Historical department service times (10–15 min)',
          'Counter 4 currently on standby',
        ],
        recommendedAction: 'Keep Counter 4 on standby until clinician unavailability or arrival surge raises wait > 24 min.',
        approval: 'System Baseline (Auto)',
        timestamp: minutesAgoIso(4),
      },
    ];

    const initialSnap = this.recompute();

    // Seed 2 illustrative saved simulation scenarios for immediate Compare Scenarios testing
    const baseSim = deriveBaselineSimulationParams(initialSnap);
    const surgeParams = getPresetSimulationParams('patient_surge', baseSim);
    const counterParams = getPresetSimulationParams('additional_counter', baseSim);

    this.scenarios = [
      {
        id: 'scn-demo-surge',
        name: 'Morning Surge Stress Test (Demo)',
        presetId: 'patient_surge',
        createdBy: 'Dr. Priya Nair',
        createdAt: minutesAgoIso(22),
        params: surgeParams,
        comparison: runOrbitSimulation(baseSim, surgeParams),
        isSimulated: true,
      },
      {
        id: 'scn-demo-counter',
        name: 'Open Counter 4 Mitigation (Demo)',
        presetId: 'additional_counter',
        createdBy: 'Dr. Priya Nair',
        createdAt: minutesAgoIso(12),
        params: counterParams,
        comparison: runOrbitSimulation(baseSim, counterParams),
        isSimulated: true,
      },
    ];

    return this.recompute();
  }

  public ensurePatientRecord(input: { name: string; email: string; phone?: string }): Patient {
    const existing = this.patients.find(
      (p) => p.email.toLowerCase() === input.email.trim().toLowerCase()
    );
    if (existing) return existing;
    const id = `pat-${crypto.randomUUID().slice(0, 6)}`;
    const patient: Patient = {
      id,
      name: input.name.trim(),
      mrn: `MRN-${2500 + this.patients.length}`,
      age: 32,
      phone: input.phone?.trim() || '+91 98000 00000',
      email: input.email.trim().toLowerCase(),
      isSimulatedDemo: false,
    };
    this.patients.push(patient);
    return patient;
  }

  public bookAppointment(
    actor: PublicUser,
    input: {
      departmentId: string;
      doctorId?: string;
      date: string;
      timeSlot: string;
      notes?: string;
      patientName?: string;
      patientEmail?: string;
      patientPhone?: string;
    }
  ): {
    appointment: Appointment;
    token: QueueToken;
    snapshot: HospitalStateSnapshot;
    patientContact: { name: string; email: string; phone: string };
    departmentName: string;
    doctorName: string;
  } {
    const dept = this.departments.find((d) => d.id === input.departmentId);
    if (!dept) {
      throw new Error('Selected department was not found.');
    }

    let doctor = input.doctorId ? this.doctors.find((d) => d.id === input.doctorId) : undefined;
    if (!doctor) {
      doctor =
        this.doctors.find(
          (d) =>
            (d.departmentId === dept.id || d.secondaryDepartmentIds.includes(dept.id)) &&
            d.availability !== 'Unavailable'
        ) || this.doctors[0];
    }

    const resolvedName = input.patientName?.trim() || actor.name;
    const resolvedEmail = input.patientEmail?.trim() || actor.email;
    const resolvedPhone = input.patientPhone?.trim();

    const patient =
      actor.patientId
        ? this.patients.find((p) => p.id === actor.patientId) ||
          this.ensurePatientRecord({
            name: resolvedName,
            email: resolvedEmail,
            phone: resolvedPhone,
          })
        : this.ensurePatientRecord({
            name: resolvedName,
            email: resolvedEmail,
            phone: resolvedPhone,
          });

    if (resolvedPhone) {
      patient.phone = resolvedPhone;
    }

    this.tokenSequence += 1;
    const tokenNumber = `ORB-${this.tokenSequence}`;
    const tokId = `tok-${this.tokenSequence}`;
    const aptId = `apt-${this.tokenSequence}`;

    const openCounter =
      this.counters.find((c) => c.status === 'Open' && c.departmentId === dept.id) ||
      this.counters.find((c) => c.status === 'Open') ||
      null;

    const appointment: Appointment = {
      id: aptId,
      patientId: patient.id,
      patientName: resolvedName,
      departmentId: dept.id,
      doctorId: doctor.id,
      date: input.date,
      timeSlot: input.timeSlot,
      notes: input.notes?.trim() || 'Booked via Patient Portal',
      status: 'checked_in',
      tokenId: tokId,
      createdAt: new Date().toISOString(),
    };
    this.appointments.unshift(appointment);

    const token: QueueToken = {
      id: tokId,
      tokenNumber,
      patientId: patient.id,
      patientName: resolvedName,
      departmentId: dept.id,
      doctorId: doctor.id,
      counterId: openCounter?.id || null,
      appointmentId: aptId,
      type: 'appointment',
      status: 'waiting',
      arrivalTime: new Date().toISOString(),
      scheduledTime: `${input.date} ${input.timeSlot}`,
      delayMinutes: 0,
      priorityLevel: 'standard',
      priorityAuthorizedBy: null,
      priorityReason: null,
      queuePosition: 0,
      patientsAhead: 0,
      predictedWaitMin: 10,
      predictedWaitMax: 18,
      confidence: 'High',
      contributingFactors: [],
    };
    this.queueTokens.push(token);

    this.addNotification({
      targetRole: 'patient',
      targetPatientId: patient.id,
      title: `Appointment Confirmed · Token ${tokenNumber}`,
      message: `${dept.name} with ${doctor.name} (${input.date} at ${input.timeSlot}). Live queue tracking is now active.`,
      category: 'appointment',
    });
    this.addNotification({
      targetRole: 'staff',
      title: `New Appointment Check-In: ${tokenNumber}`,
      message: `${resolvedName} joined ${dept.name} queue (${doctor.name}).`,
      category: 'queue',
    });

    this.addAudit({
      pillar: 'PREDICT',
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Appointment Booked & Token Issued',
      whatChanged: `Issued token ${tokenNumber} for ${resolvedName} in ${dept.name} (${doctor.name}).`,
      why: 'Patient booked an appointment and entered the live digital queue.',
      contributingFactors: [`Department: ${dept.name}`, `Clinician: ${doctor.name}`, `Slot: ${input.date} ${input.timeSlot}`],
      recommendedAction: 'Wait-time bounds automatically recalculated across active queue.',
      approval: 'Self-Service Booking (Verified)',
    });

    const snapshot = this.recompute();
    const updatedToken = snapshot.queueTokens.find((t) => t.id === tokId)!;
    return {
      appointment,
      token: updatedToken,
      snapshot,
      patientContact: {
        name: resolvedName,
        email: resolvedEmail || patient.email,
        phone: resolvedPhone || patient.phone,
      },
      departmentName: dept.name,
      doctorName: doctor.name,
    };
  }

  public registerWalkIn(
    actor: PublicUser,
    input: {
      patientName: string;
      phone?: string;
      departmentId: string;
      doctorId?: string;
      clinicianPriority?: boolean;
      priorityAuthorizedBy?: string;
      priorityReason?: string;
    }
  ): { token: QueueToken; snapshot: HospitalStateSnapshot } {
    const dept = this.departments.find((d) => d.id === input.departmentId);
    if (!dept) throw new Error('Department not found.');

    let doctor = input.doctorId ? this.doctors.find((d) => d.id === input.doctorId) : undefined;
    if (!doctor) {
      doctor =
        this.doctors.find(
          (d) =>
            (d.departmentId === dept.id || d.secondaryDepartmentIds.includes(dept.id)) &&
            d.availability !== 'Unavailable'
        ) || this.doctors[0];
    }

    if (input.clinicianPriority && (!input.priorityAuthorizedBy?.trim() || !input.priorityReason?.trim())) {
      throw new Error(
        'PROTECT rule: Clinician-authorized priority requires both authorizing clinician name and clinical justification.'
      );
    }

    const patient = this.ensurePatientRecord({
      name: input.patientName,
      email: `${input.patientName.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${Date.now().toString().slice(-3)}@walkin.orbit`,
      phone: input.phone,
    });

    this.tokenSequence += 1;
    const tokenNumber = `ORB-${this.tokenSequence}`;
    const tokId = `tok-${this.tokenSequence}`;
    const openCounter =
      this.counters.find((c) => c.status === 'Open' && c.departmentId === dept.id) ||
      this.counters.find((c) => c.status === 'Open') ||
      null;

    const token: QueueToken = {
      id: tokId,
      tokenNumber,
      patientId: patient.id,
      patientName: patient.name,
      departmentId: dept.id,
      doctorId: doctor.id,
      counterId: openCounter?.id || null,
      appointmentId: null,
      type: 'walk_in',
      status: 'waiting',
      arrivalTime: new Date().toISOString(),
      scheduledTime: null,
      delayMinutes: 0,
      priorityLevel: input.clinicianPriority ? 'clinician_priority' : 'standard',
      priorityAuthorizedBy: input.clinicianPriority ? input.priorityAuthorizedBy!.trim() : null,
      priorityReason: input.clinicianPriority ? input.priorityReason!.trim() : null,
      queuePosition: 0,
      patientsAhead: 0,
      predictedWaitMin: 12,
      predictedWaitMax: 20,
      confidence: 'Moderate',
      contributingFactors: [],
    };
    this.queueTokens.push(token);

    this.addAudit({
      pillar: input.clinicianPriority ? 'PROTECT' : 'PREDICT',
      actorName: actor.name,
      actorRole: actor.role,
      action: input.clinicianPriority
        ? 'Walk-In Registered with Clinician Priority'
        : 'Walk-In Patient Registered',
      whatChanged: `Generated walk-in token ${tokenNumber} for ${patient.name} in ${dept.name}.`,
      why: input.clinicianPriority
        ? `Clinician-authorized priority granted by ${input.priorityAuthorizedBy}: ${input.priorityReason}`
        : 'Front desk registered new walk-in arrival.',
      contributingFactors: [
        `Department: ${dept.name}`,
        `Assigned clinician: ${doctor.name}`,
        input.clinicianPriority ? `Authorized by: ${input.priorityAuthorizedBy}` : 'Standard FIFO placement',
      ],
      recommendedAction: 'Queue positions and predicted waiting ranges recalculated.',
      approval: input.clinicianPriority
        ? `Clinician Priority Authorized by ${input.priorityAuthorizedBy}`
        : `Registered by ${actor.name}`,
    });

    this.addNotification({
      targetRole: 'all',
      title: `Walk-In Token ${tokenNumber} Issued`,
      message: `${patient.name} added to ${dept.name} queue (${input.clinicianPriority ? 'Clinician Priority' : 'Standard Walk-In'}).`,
      category: 'queue',
    });

    const snapshot = this.recompute();
    return { token: snapshot.queueTokens.find((t) => t.id === tokId)!, snapshot };
  }

  public callNextToken(actor: PublicUser, departmentId?: string, doctorId?: string): {
    calledToken: QueueToken;
    snapshot: HospitalStateSnapshot;
  } {
    const waiting = this.queueTokens
      .filter((t) => {
        if (t.status !== 'waiting') return false;
        if (departmentId && t.departmentId !== departmentId) return false;
        if (doctorId && t.doctorId !== doctorId) return false;
        return true;
      })
      .sort((a, b) => a.queuePosition - b.queuePosition);

    if (waiting.length === 0) {
      throw new Error('No waiting patients match the selected queue filter.');
    }

    const nextTok = waiting[0];
    nextTok.status = 'called';
    nextTok.calledAt = new Date().toISOString();

    const counter =
      this.counters.find((c) => c.status === 'Open' && c.departmentId === nextTok.departmentId) ||
      this.counters.find((c) => c.status === 'Open');
    if (counter) {
      nextTok.counterId = counter.id;
      counter.currentTokenId = nextTok.id;
    }

    this.addNotification({
      targetRole: 'patient',
      targetPatientId: nextTok.patientId,
      title: `Now Calling Token ${nextTok.tokenNumber}`,
      message: `Please proceed to ${counter ? counter.name : 'your assigned consultation room'}.`,
      category: 'queue',
    });

    this.addAudit({
      pillar: 'ORCHESTRATE',
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Next Patient Called',
      whatChanged: `Token ${nextTok.tokenNumber} (${nextTok.patientName}) transitioned from waiting to called.`,
      why: 'Front desk advanced the highest-ranked eligible token under transparent queue ordering.',
      contributingFactors: [
        `Priority mode: ${nextTok.priorityLevel === 'clinician_priority' ? 'Clinician-Authorized' : 'Standard FIFO'}`,
        `Assigned counter: ${counter ? counter.name : 'Unassigned'}`,
      ],
      recommendedAction: 'Begin consultation once patient arrives at counter.',
      approval: `Executed by ${actor.name}`,
    });

    const snapshot = this.recompute();
    return {
      calledToken: snapshot.queueTokens.find((t) => t.id === nextTok.id)!,
      snapshot,
    };
  }

  public updateTokenStatus(
    actor: PublicUser,
    tokenId: string,
    status: QueueToken['status'],
    note?: string
  ): HospitalStateSnapshot {
    const tok = this.queueTokens.find((t) => t.id === tokenId);
    if (!tok) throw new Error('Queue token not found.');

    // Patients can only cancel their own waiting token
    if (actor.role === 'patient') {
      if (tok.patientId !== actor.patientId || status !== 'cancelled') {
        throw new Error('Patients may only cancel their own active tokens.');
      }
    }

    const prevStatus = tok.status;
    tok.status = status;

    const doc = this.doctors.find((d) => d.id === tok.doctorId);
    const cnt = this.counters.find((c) => c.id === tok.counterId);
    const appt = tok.appointmentId
      ? this.appointments.find((a) => a.id === tok.appointmentId)
      : undefined;

    const nowIso = new Date().toISOString();

    if (status === 'called') {
      tok.calledAt = nowIso;
    } else if (status === 'in_consultation') {
      tok.consultationStartTime = nowIso;
      if (doc) {
        doc.activeTokenId = tok.id;
        if (doc.availability === 'Available') doc.availability = 'Busy';
      }
      this.consultations.unshift({
        id: `con-${crypto.randomUUID().slice(0, 8)}`,
        tokenId: tok.id,
        tokenNumber: tok.tokenNumber,
        patientId: tok.patientId,
        patientName: tok.patientName,
        doctorId: tok.doctorId,
        departmentId: tok.departmentId,
        counterId: tok.counterId,
        startedAt: nowIso,
        completedAt: null,
        durationMinutes: null,
        status: 'active',
      });
    } else if (status === 'completed') {
      tok.consultationEndTime = nowIso;
      if (doc) {
        if (doc.activeTokenId === tok.id) doc.activeTokenId = null;
        doc.completedToday += 1;
        if (doc.availability === 'Busy') doc.availability = 'Available';
      }
      if (cnt) {
        cnt.servedToday += 1;
        if (cnt.currentTokenId === tok.id) cnt.currentTokenId = null;
      }
      const activeCon = this.consultations.find((c) => c.tokenId === tok.id && c.status === 'active');
      if (activeCon) {
        activeCon.status = 'completed';
        activeCon.completedAt = nowIso;
        activeCon.durationMinutes = Math.max(
          5,
          Math.round((Date.now() - new Date(activeCon.startedAt).getTime()) / 60_000) || 12
        );
      }
      if (appt) appt.status = 'completed';
    } else if (status === 'no_show') {
      if (appt) appt.status = 'no_show';
      if (cnt && cnt.currentTokenId === tok.id) cnt.currentTokenId = null;
    } else if (status === 'cancelled') {
      if (appt) appt.status = 'cancelled';
      if (cnt && cnt.currentTokenId === tok.id) cnt.currentTokenId = null;
    }

    this.addNotification({
      targetRole: 'patient',
      targetPatientId: tok.patientId,
      title: `Token ${tok.tokenNumber} Updated: ${status.replace('_', ' ')}`,
      message:
        status === 'in_consultation'
          ? `Your consultation with ${doc ? doc.name : 'your clinician'} has begun.`
          : status === 'completed'
          ? `Your consultation is complete. Thank you for visiting QueueLess ORBIT.`
          : status === 'called'
          ? `Please proceed to ${cnt ? cnt.name : 'your consultation counter'}.`
          : `Token status updated to ${status.replace('_', ' ')}.`,
      category: 'queue',
    });

    this.addAudit({
      pillar: 'EXPLAIN',
      actorName: actor.name,
      actorRole: actor.role,
      action: `Token Status: ${prevStatus} → ${status}`,
      whatChanged: `Token ${tok.tokenNumber} (${tok.patientName}) changed from ${prevStatus} to ${status}.`,
      why: note?.trim() || `Operational workflow update initiated by ${actor.name}.`,
      contributingFactors: [
        `Clinician: ${doc ? doc.name : 'Unassigned'}`,
        `Queue recalculated immediately for remaining waiting patients`,
      ],
      recommendedAction:
        status === 'completed' || status === 'no_show' || status === 'cancelled'
          ? 'Call next waiting token to preserve counter throughput.'
          : 'Monitor consultation duration against historical department baseline.',
      approval: `Confirmed by ${actor.name}`,
    });

    return this.recompute();
  }

  public authorizeClinicianPriority(
    actor: PublicUser,
    tokenId: string,
    authorizedBy: string,
    reason: string,
    enable: boolean
  ): HospitalStateSnapshot {
    const tok = this.queueTokens.find((t) => t.id === tokenId);
    if (!tok) throw new Error('Queue token not found.');

    if (enable) {
      tok.priorityLevel = 'clinician_priority';
      tok.priorityAuthorizedBy = authorizedBy.trim();
      tok.priorityReason = reason.trim();
    } else {
      tok.priorityLevel = 'standard';
      tok.priorityAuthorizedBy = null;
      tok.priorityReason = null;
    }

    this.addAudit({
      pillar: 'PROTECT',
      actorName: actor.name,
      actorRole: actor.role,
      action: enable ? 'Clinician Priority Authorized' : 'Clinician Priority Cleared',
      whatChanged: enable
        ? `Token ${tok.tokenNumber} (${tok.patientName}) elevated to clinician-authorized priority.`
        : `Token ${tok.tokenNumber} (${tok.patientName}) returned to standard queue order.`,
      why: enable
        ? `Human clinician authorization recorded (${authorizedBy}): ${reason}. AI did not independently assign clinical urgency.`
        : `Priority hold removed by ${actor.name}.`,
      contributingFactors: [
        `Authorizing clinician: ${authorizedBy}`,
        `Documented clinical justification: ${reason}`,
        'Starvation guard remains active for standard queue tokens',
      ],
      recommendedAction: 'Audit standard queue maximum wait to uphold hospital fairness policy.',
      approval: `Authorized by ${authorizedBy}`,
    });

    this.addNotification({
      targetRole: 'patient',
      targetPatientId: tok.patientId,
      title: enable ? `Priority Update · Token ${tok.tokenNumber}` : `Queue Order Updated · ${tok.tokenNumber}`,
      message: enable
        ? `A clinician (${authorizedBy}) authorized priority placement for your visit. Your updated wait estimate is now visible.`
        : `Your token has returned to standard queue ordering.`,
      category: 'priority',
    });

    return this.recompute();
  }

  public updateDoctorAvailability(
    actor: PublicUser,
    doctorId: string,
    availability: DoctorAvailability
  ): HospitalStateSnapshot {
    const doc = this.doctors.find((d) => d.id === doctorId);
    if (!doc) throw new Error('Doctor not found.');

    const beforeAvgMin = this.lastSnapshot.analytics.avgPredictedWaitMin;
    const beforeAvgMax = this.lastSnapshot.analytics.avgPredictedWaitMax;
    const prevAvailability = doc.availability;

    doc.availability = availability;

    const afterSnap = this.recompute();
    const afterAvgMin = afterSnap.analytics.avgPredictedWaitMin;
    const afterAvgMax = afterSnap.analytics.avgPredictedWaitMax;

    const dept = this.departments.find((d) => d.id === doc.departmentId);
    const closedCounter = this.counters.find((c) => c.status === 'Closed');
    const isReduced = availability === 'Unavailable' || availability === 'On Break';

    this.addAudit({
      pillar: 'EXPLAIN',
      actorName: actor.name,
      actorRole: actor.role,
      action: `Doctor Availability: ${prevAvailability} → ${availability}`,
      whatChanged: `${doc.name} (${dept?.name || doc.specialty}) changed to ${availability}. Hospital avg predicted wait shifted from ${beforeAvgMin}–${beforeAvgMax}m to ${afterAvgMin}–${afterAvgMax}m.`,
      why: isReduced
        ? `Active clinician count dropped to ${afterSnap.analytics.activeDoctors}/${afterSnap.analytics.totalDoctors}, redistributing ${dept?.name || 'clinic'} demand across remaining specialists.`
        : `Active clinician capacity restored to ${afterSnap.analytics.activeDoctors}/${afterSnap.analytics.totalDoctors}, lowering per-patient wait bounds.`,
      contributingFactors: [
        `Clinician: ${doc.name} (${prevAvailability} → ${availability})`,
        `Active doctors: ${afterSnap.analytics.activeDoctors}/${afterSnap.analytics.totalDoctors}`,
        `Open counters: ${afterSnap.analytics.openCounters}/${afterSnap.analytics.totalCounters}`,
        `Avg predicted wait: ${beforeAvgMin}–${beforeAvgMax}m → ${afterAvgMin}–${afterAvgMax}m`,
      ],
      recommendedAction:
        isReduced && closedCounter
          ? `Open standby ${closedCounter.name} and rebalance waiting tokens to absorb intake pressure.`
          : 'Continue monitoring department utilization and wait ranges.',
      approval: `Updated by ${actor.name}`,
    });

    // Notify affected waiting patients so Patient Dashboard reflects live transparency
    const affectedPatients = new Set(
      afterSnap.queueTokens
        .filter((t) => (t.status === 'waiting' || t.status === 'called') && t.doctorId === doc.id)
        .map((t) => t.patientId)
    );
    for (const patId of affectedPatients) {
      const patTok = afterSnap.queueTokens.find(
        (t) => t.patientId === patId && (t.status === 'waiting' || t.status === 'called')
      );
      if (patTok) {
        this.addNotification({
          targetRole: 'patient',
          targetPatientId: patId,
          title: `Wait Estimate Updated · ${patTok.tokenNumber}`,
          message: isReduced
            ? `${doc.name} is temporarily ${availability.toLowerCase()}. Your revised wait estimate is ${patTok.predictedWaitMin}–${patTok.predictedWaitMax} min while care teams coordinate coverage.`
            : `${doc.name} is now ${availability.toLowerCase()}. Your revised wait estimate is ${patTok.predictedWaitMin}–${patTok.predictedWaitMax} min.`,
          category: 'doctor',
        });
      }
    }

    this.addNotification({
      targetRole: 'admin',
      title: `${doc.name} is now ${availability}`,
      message: `Predicted hospital wait recalculated: ${beforeAvgMin}–${beforeAvgMax}m → ${afterAvgMin}–${afterAvgMax}m.`,
      category: 'doctor',
    });

    return this.recompute();
  }

  public updateCounterStatus(
    actor: PublicUser,
    counterId: string,
    status: CounterStatus,
    departmentId?: string
  ): HospitalStateSnapshot {
    const cnt = this.counters.find((c) => c.id === counterId);
    if (!cnt) throw new Error('Counter not found.');

    const beforeMin = this.lastSnapshot.analytics.avgPredictedWaitMin;
    const beforeMax = this.lastSnapshot.analytics.avgPredictedWaitMax;
    const prevStatus = cnt.status;

    cnt.status = status;
    if (departmentId && this.departments.some((d) => d.id === departmentId)) {
      cnt.departmentId = departmentId;
    }

    const afterSnap = this.recompute();
    const afterMin = afterSnap.analytics.avgPredictedWaitMin;
    const afterMax = afterSnap.analytics.avgPredictedWaitMax;

    this.addAudit({
      pillar: 'ORCHESTRATE',
      actorName: actor.name,
      actorRole: actor.role,
      action: `${cnt.name} Status: ${prevStatus} → ${status}`,
      whatChanged: `${cnt.name} transitioned from ${prevStatus} to ${status}. Avg predicted wait shifted from ${beforeMin}–${beforeMax}m to ${afterMin}–${afterMax}m.`,
      why:
        status === 'Open'
          ? `Opening ${cnt.name} expanded parallel check-in & intake throughput to ${afterSnap.analytics.openCounters}/${afterSnap.analytics.totalCounters} counters.`
          : `Reducing open counters to ${afterSnap.analytics.openCounters}/${afterSnap.analytics.totalCounters} increased intake queuing pressure.`,
      contributingFactors: [
        `Open counters: ${afterSnap.analytics.openCounters}/${afterSnap.analytics.totalCounters}`,
        `Waiting patients: ${afterSnap.analytics.totalWaiting}`,
        `Avg predicted wait: ${beforeMin}–${beforeMax}m → ${afterMin}–${afterMax}m`,
      ],
      recommendedAction:
        status === 'Open'
          ? 'Route waiting overflow tokens to the newly opened counter and notify queued patients.'
          : 'Re-open standby counter if waiting time exceeds department SLA.',
      approval: `Approved by ${actor.name}`,
    });

    // Push patient-facing update for Demo Patient & waiting patients when a counter opens
    if (status === 'Open') {
      this.addNotification({
        targetRole: 'patient',
        targetPatientId: 'pat-01',
        title: `${cnt.name} Opened — Wait Time Improved`,
        message: `Hospital operations opened ${cnt.name}. Your digital token wait-time range has been recalculated.`,
        category: 'counter',
      });
    }

    this.addNotification({
      targetRole: 'staff',
      title: `${cnt.name} is now ${status}`,
      message: `Open counters: ${afterSnap.analytics.openCounters}/${afterSnap.analytics.totalCounters}. Queue estimates updated.`,
      category: 'counter',
    });

    return this.recompute();
  }

  public actOnRecommendation(
    actor: PublicUser,
    recommendationId: string,
    decision: 'approve' | 'dismiss'
  ): HospitalStateSnapshot {
    const rec = this.recommendations.find((r) => r.id === recommendationId);
    if (!rec) throw new Error('Recommendation not found.');

    const nowIso = new Date().toISOString();
    rec.status = decision === 'approve' ? 'approved' : 'dismissed';
    rec.resolvedBy = actor.name;
    rec.resolvedAt = nowIso;

    if (decision === 'approve') {
      if (rec.actionType === 'open_counter' && rec.targetCounterId) {
        return this.updateCounterStatus(actor, rec.targetCounterId, 'Open', rec.departmentId);
      }

      if (rec.actionType === 'rebalance_queue') {
        const availableDocs = this.doctors.filter(
          (d) => d.availability === 'Available' || d.availability === 'Busy'
        );
        if (availableDocs.length > 0) {
          let reassigned = 0;
          this.queueTokens.forEach((tok) => {
            if (tok.status === 'waiting') {
              const doc = this.doctors.find((d) => d.id === tok.doctorId);
              if (!doc || doc.availability === 'Unavailable' || doc.availability === 'On Break') {
                const target = availableDocs[reassigned % availableDocs.length];
                tok.doctorId = target.id;
                reassigned += 1;
              }
            }
          });
          this.addAudit({
            pillar: 'ORCHESTRATE',
            actorName: actor.name,
            actorRole: actor.role,
            action: 'Queue Rebalanced Across Active Clinicians',
            whatChanged: `Reassigned ${reassigned} waiting token(s) from offline clinicians to active available doctors.`,
            why: `Administrator approved ORCHESTRATE recommendation: ${rec.title}.`,
            contributingFactors: rec.contributingFactors,
            recommendedAction: 'Monitor redistributed wait ranges across active clinics.',
            approval: `Approved by ${actor.name}`,
          });
          this.addNotification({
            targetRole: 'all',
            title: 'Queue Rebalanced by Operations',
            message: `${reassigned} waiting token(s) redistributed to active specialists to minimize wait times.`,
            category: 'queue',
          });
        }
      }

      if (rec.actionType === 'notify_patients') {
        const dept = this.departments.find((d) => d.id === rec.departmentId);
        this.addNotification({
          targetRole: 'patient',
          title: `Wait-Time Update · ${dept ? dept.name : 'Clinic Queue'}`,
          message: `Thank you for your patience. Care teams are actively coordinating ${dept ? dept.name : 'outpatient'} consultations; live token estimates reflect current clinic load.`,
          category: 'queue',
        });
        this.addAudit({
          pillar: 'EXPLAIN',
          actorName: actor.name,
          actorRole: actor.role,
          action: 'Proactive Patient Transparency Update Sent',
          whatChanged: `Sent wait-time transparency update to ${dept ? dept.name : 'queued'} patients.`,
          why: rec.summary,
          contributingFactors: rec.contributingFactors,
          recommendedAction: 'Continue transparent updates when predicted wait exceeds SLA.',
          approval: `Approved by ${actor.name}`,
        });
      }
    } else {
      this.addAudit({
        pillar: 'EXPLAIN',
        actorName: actor.name,
        actorRole: actor.role,
        action: 'Recommendation Dismissed',
        whatChanged: `Dismissed recommendation "${rec.title}".`,
        why: `Administrator elected to retain current resource configuration.`,
        contributingFactors: rec.contributingFactors,
        recommendedAction: 'Re-evaluate if wait time rises further.',
        approval: `Dismissed by ${actor.name}`,
      });
    }

    return this.recompute();
  }

  public addDepartment(
    actor: PublicUser,
    input: { name: string; code: string; avgServiceMin: number; targetWaitMin: number; description: string }
  ): HospitalStateSnapshot {
    const id = `dept-${crypto.randomUUID().slice(0, 6)}`;
    this.departments.push({
      id,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase().slice(0, 4),
      avgServiceMin: input.avgServiceMin,
      targetWaitMin: input.targetWaitMin,
      active: true,
      description: input.description.trim() || 'Outpatient clinical department.',
    });
    this.addAudit({
      pillar: 'ORCHESTRATE',
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Department Added',
      whatChanged: `Added department ${input.name} (${input.code.toUpperCase()}).`,
      why: 'Administrator expanded hospital clinical directory.',
      contributingFactors: [`Avg service duration: ${input.avgServiceMin}m`, `Target wait SLA: ${input.targetWaitMin}m`],
      recommendedAction: 'Assign clinicians and intake counters to the new department.',
      approval: `Approved by ${actor.name}`,
    });
    return this.recompute();
  }

  public addDoctor(
    actor: PublicUser,
    input: { name: string; specialty: string; departmentId: string; avgConsultationMin: number }
  ): HospitalStateSnapshot {
    if (!this.departments.some((d) => d.id === input.departmentId)) {
      throw new Error('Selected department does not exist.');
    }
    const id = `doc-${crypto.randomUUID().slice(0, 6)}`;
    this.doctors.push({
      id,
      name: input.name.trim(),
      specialty: input.specialty.trim(),
      departmentId: input.departmentId,
      secondaryDepartmentIds: [],
      availability: 'Available',
      avgConsultationMin: input.avgConsultationMin,
      activeTokenId: null,
      completedToday: 0,
    });
    this.addAudit({
      pillar: 'ORCHESTRATE',
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Clinician Added to Roster',
      whatChanged: `Added ${input.name} (${input.specialty}) as Available.`,
      why: 'Administrator added clinician capacity to live hospital roster.',
      contributingFactors: [`Total doctors increased to ${this.doctors.length}`],
      recommendedAction: 'Predicted waiting times recalculated automatically.',
      approval: `Approved by ${actor.name}`,
    });
    return this.recompute();
  }

  public addCounter(
    actor: PublicUser,
    input: { name: string; code: string; departmentId: string; status: CounterStatus }
  ): HospitalStateSnapshot {
    if (!this.departments.some((d) => d.id === input.departmentId)) {
      throw new Error('Selected department does not exist.');
    }
    const id = `cnt-${crypto.randomUUID().slice(0, 6)}`;
    this.counters.push({
      id,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase().slice(0, 4),
      departmentId: input.departmentId,
      status: input.status,
      assignedDoctorId: null,
      currentTokenId: null,
      servedToday: 0,
    });
    this.addAudit({
      pillar: 'ORCHESTRATE',
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Counter Provisioned',
      whatChanged: `Provisioned ${input.name} (${input.status}).`,
      why: 'Administrator expanded hospital intake counter capacity.',
      contributingFactors: [`Total counters: ${this.counters.length}`],
      recommendedAction: 'Open counter when arrival volume increases.',
      approval: `Approved by ${actor.name}`,
    });
    return this.recompute();
  }

  public saveScenario(
    actor: PublicUser,
    input: {
      name: string;
      presetId?: SimulationPresetId | 'custom';
      baselineParams: SimulationParams;
      scenarioParams: SimulationParams;
    }
  ): { scenario: SavedScenario; snapshot: HospitalStateSnapshot } {
    const comparison = runOrbitSimulation(input.baselineParams, input.scenarioParams);
    const scenario: SavedScenario = {
      id: `scn-${crypto.randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      presetId: input.presetId || 'custom',
      createdBy: actor.name,
      createdAt: new Date().toISOString(),
      params: input.scenarioParams,
      comparison,
      isSimulated: true,
    };
    this.scenarios.unshift(scenario);

    this.addAudit({
      pillar: 'EXPLAIN',
      actorName: actor.name,
      actorRole: actor.role,
      action: 'What-If Scenario Saved',
      whatChanged: `Saved simulation "${scenario.name}" (Before: ${comparison.before.predictedWaitMin}–${comparison.before.predictedWaitMax}m → After: ${comparison.after.predictedWaitMin}–${comparison.after.predictedWaitMax}m).`,
      why: comparison.explanation.why,
      contributingFactors: comparison.explanation.contributingFactors,
      recommendedAction: comparison.explanation.recommendedAction,
      approval: `Simulated by ${actor.name} (Illustrative)`,
    });

    const snapshot = this.recompute();
    return { scenario, snapshot };
  }

  public markNotificationsRead(actor: PublicUser): HospitalStateSnapshot {
    for (const n of this.notifications) {
      if (
        n.targetRole === 'all' ||
        n.targetRole === actor.role ||
        (actor.patientId && n.targetPatientId === actor.patientId)
      ) {
        n.read = true;
      }
    }
    return this.recompute();
  }

  public saveContactMessage(input: {
    name: string;
    email: string;
    organization: string;
    message: string;
  }): { id: string; receivedAt: string } {
    const id = `msg-${crypto.randomUUID().slice(0, 8)}`;
    const receivedAt = new Date().toISOString();
    this.contactMessages.push({
      id,
      name: input.name.trim(),
      email: input.email.trim(),
      organization: input.organization.trim(),
      message: input.message.trim(),
      createdAt: receivedAt,
    });
    return { id, receivedAt };
  }
}

export const hospitalStore = new HospitalStore();
