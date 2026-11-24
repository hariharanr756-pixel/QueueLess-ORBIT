import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  attachAuthUser,
  authenticatePasswordLogin,
  completePasswordRecovery,
  getDemoAccountByRole,
  registerAccount,
  requestPasswordRecovery,
  requireAuth,
  requireRole,
  revokeSessionToken,
  signSessionToken,
  toPublicUser,
  type AuthedRequest,
} from './server/auth.ts';
import { hospitalStore } from './server/store.ts';
import { getSupabaseConfigStatus, saveAppointmentToSupabase } from './server/supabase.ts';
import { runOrbitSimulation } from './shared/orbitEngine.ts';
import type { HospitalStateSnapshot } from './shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(express.json({ limit: '1mb' }));
  app.use(attachAuthUser);

  const broadcastState = (eventType: string, summary: string, snapshot: HospitalStateSnapshot) => {
    const payload = JSON.stringify({
      type: 'state:sync',
      eventType,
      summary,
      timestamp: new Date().toISOString(),
      snapshot,
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'state:init',
        eventType: 'connected',
        summary: 'Synchronized with QueueLess ORBIT real-time coordinator',
        timestamp: new Date().toISOString(),
        snapshot: hospitalStore.getSnapshot(),
      })
    );
  });

  // --- Health & Public Summary ---
  app.get('/api/health', (_req, res) => {
    const supabaseStatus = getSupabaseConfigStatus();
    res.json({
      status: 'ok',
      platform: 'QueueLess ORBIT',
      wsClients: wss.clients.size,
      supabaseConfigured: supabaseStatus.configured,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/public/summary', (_req, res) => {
    const snap = hospitalStore.getSnapshot();
    res.json({
      isSimulatedDemoData: snap.isSimulatedDemoData,
      modelEngine: snap.modelEngine,
      analytics: snap.analytics,
      departments: snap.departments,
      doctors: snap.doctors.map((d) => ({
        id: d.id,
        name: d.name,
        specialty: d.specialty,
        departmentId: d.departmentId,
        availability: d.availability,
      })),
      sampleTokens: snap.queueTokens
        .filter((t) => t.status === 'waiting' || t.status === 'called')
        .slice(0, 6)
        .map((t) => ({
          tokenNumber: t.tokenNumber,
          departmentId: t.departmentId,
          status: t.status,
          predictedWaitMin: t.predictedWaitMin,
          predictedWaitMax: t.predictedWaitMax,
          queuePosition: t.queuePosition,
        })),
    });
  });

  // --- Authentication Routes ---
  const registerSchema = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email().max(120),
    password: z.string().min(6).max(128),
    role: z.enum(['patient', 'staff', 'admin']),
  });

  app.post('/api/auth/register', (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid name, email, role, and password (min 6 characters).' });
      return;
    }
    let patientId: string | undefined;
    if (parsed.data.role === 'patient') {
      const pat = hospitalStore.ensurePatientRecord({
        name: parsed.data.name,
        email: parsed.data.email,
      });
      patientId = pat.id;
    }
    const result = registerAccount({ ...parsed.data, patientId });
    if ('error' in result) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.status(201).json(result);
  });

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  app.post('/api/auth/login', (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required.' });
      return;
    }
    const result = authenticatePasswordLogin(parsed.data.email, parsed.data.password);
    if ('error' in result) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  const demoLoginSchema = z.object({
    role: z.enum(['patient', 'staff', 'admin']),
  });

  app.post('/api/auth/demo-login', (req, res) => {
    const parsed = demoLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Select a valid demo role: patient, staff, or admin.' });
      return;
    }
    const acc = getDemoAccountByRole(parsed.data.role);
    if (!acc) {
      res.status(500).json({ error: 'Demo account unavailable.' });
      return;
    }
    const user = toPublicUser(acc);
    const token = signSessionToken(user);
    res.json({ user, token });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res) => {
    if (req.authToken) {
      revokeSessionToken(req.authToken);
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/recover/request', (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    const result = requestPasswordRecovery(parsed.data.email);
    res.json(result);
  });

  app.post('/api/auth/recover/confirm', (req, res) => {
    const parsed = z
      .object({
        email: z.string().email(),
        code: z.string().min(4).max(12),
        newPassword: z.string().min(6).max(128),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide email, recovery code, and new password (min 6 characters).' });
      return;
    }
    const result = completePasswordRecovery(parsed.data.email, parsed.data.code, parsed.data.newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.message });
      return;
    }
    res.json(result);
  });

  // --- Full Hospital State (Authenticated) ---
  app.get('/api/state', requireAuth, (_req, res) => {
    res.json(hospitalStore.getSnapshot());
  });

  // --- Patient Appointment Booking ---
  const appointmentSchema = z.object({
    departmentId: z.string().min(1).max(60),
    doctorId: z.string().max(60).optional(),
    date: z.string().min(8).max(20),
    timeSlot: z.string().min(3).max(20),
    notes: z.string().max(400).optional(),
    patientName: z.string().trim().min(2).max(80).optional(),
    patientEmail: z.string().trim().email().max(120).optional().or(z.literal('')),
    patientPhone: z.string().trim().max(30).optional(),
  });

  app.post('/api/appointments', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = appointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid appointment details. Provide valid contact info, department, date, and time.' });
      return;
    }
    try {
      const result = hospitalStore.bookAppointment(req.user!, parsed.data);
      const supabaseSync = await saveAppointmentToSupabase({
        id: result.appointment.id,
        tokenNumber: result.token.tokenNumber,
        patientName: result.patientContact.name,
        patientEmail: result.patientContact.email,
        patientPhone: result.patientContact.phone,
        departmentId: result.appointment.departmentId,
        departmentName: result.departmentName,
        doctorId: result.appointment.doctorId,
        doctorName: result.doctorName,
        appointmentDate: result.appointment.date,
        timeSlot: result.appointment.timeSlot,
        notes: result.appointment.notes,
        status: result.appointment.status,
        predictedWaitMin: result.token.predictedWaitMin,
        predictedWaitMax: result.token.predictedWaitMax,
        createdAt: result.appointment.createdAt,
      });

      broadcastState(
        'appointment:booked',
        `New appointment token ${result.token.tokenNumber} issued`,
        result.snapshot
      );

      res.status(201).json({
        appointment: result.appointment,
        token: result.token,
        snapshot: result.snapshot,
        supabaseSync,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to book appointment.' });
    }
  });

  // --- Staff Walk-In Registration ---
  const walkInSchema = z.object({
    patientName: z.string().min(2).max(80),
    phone: z.string().max(30).optional(),
    departmentId: z.string().min(1),
    doctorId: z.string().optional(),
    clinicianPriority: z.boolean().optional(),
    priorityAuthorizedBy: z.string().max(80).optional(),
    priorityReason: z.string().max(240).optional(),
  });

  app.post('/api/queue/walk-in', requireRole(['staff', 'admin']), (req: AuthedRequest, res) => {
    const parsed = walkInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide patient name and valid department.' });
      return;
    }
    try {
      const result = hospitalStore.registerWalkIn(req.user!, parsed.data);
      broadcastState('queue:walk_in', `Walk-in token ${result.token.tokenNumber} issued`, result.snapshot);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to register walk-in.' });
    }
  });

  // --- Call Next Token ---
  app.post('/api/queue/call-next', requireRole(['staff', 'admin']), (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        departmentId: z.string().optional(),
        doctorId: z.string().optional(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid filter parameters.' });
      return;
    }
    try {
      const result = hospitalStore.callNextToken(
        req.user!,
        parsed.data.departmentId || undefined,
        parsed.data.doctorId || undefined
      );
      broadcastState('queue:called', `Called token ${result.calledToken.tokenNumber}`, result.snapshot);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to call next token.' });
    }
  });

  // --- Update Token Status ---
  const tokenStatusSchema = z.object({
    status: z.enum(['waiting', 'called', 'in_consultation', 'completed', 'no_show', 'cancelled']),
    note: z.string().max(240).optional(),
  });

  app.patch('/api/queue/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const parsed = tokenStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid token status.' });
      return;
    }
    try {
      const snapshot = hospitalStore.updateTokenStatus(
        req.user!,
        String(req.params.id),
        parsed.data.status,
        parsed.data.note
      );
      broadcastState('queue:status', `Token status updated to ${parsed.data.status}`, snapshot);
      res.json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update token status.' });
    }
  });

  // --- PROTECT: Clinician-Authorized Priority ---
  const prioritySchema = z.object({
    enable: z.boolean(),
    authorizedBy: z.string().min(2).max(80),
    reason: z.string().min(4).max(240),
  });

  app.patch('/api/queue/:id/priority', requireRole(['staff', 'admin']), (req: AuthedRequest, res) => {
    const parsed = prioritySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Authorizing clinician name and clinical justification are required by PROTECT policy.',
      });
      return;
    }
    try {
      const snapshot = hospitalStore.authorizeClinicianPriority(
        req.user!,
        String(req.params.id),
        parsed.data.authorizedBy,
        parsed.data.reason,
        parsed.data.enable
      );
      broadcastState('queue:priority', `Clinician priority updated`, snapshot);
      res.json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Priority update failed.' });
    }
  });

  // --- Doctor Availability Controls ---
  const doctorAvailabilitySchema = z.object({
    availability: z.enum(['Available', 'Busy', 'On Break', 'Unavailable']),
  });

  app.patch('/api/doctors/:id/availability', requireRole(['staff', 'admin']), (req: AuthedRequest, res) => {
    const parsed = doctorAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Select a valid doctor availability status.' });
      return;
    }
    try {
      const snapshot = hospitalStore.updateDoctorAvailability(
        req.user!,
        String(req.params.id),
        parsed.data.availability
      );
      broadcastState(
        'doctor:availability',
        `Doctor availability updated to ${parsed.data.availability}`,
        snapshot
      );
      res.json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update doctor.' });
    }
  });

  // --- Counter Status Controls ---
  const counterStatusSchema = z.object({
    status: z.enum(['Open', 'Closed', 'Maintenance']),
    departmentId: z.string().optional(),
  });

  app.patch('/api/counters/:id/status', requireRole(['staff', 'admin']), (req: AuthedRequest, res) => {
    const parsed = counterStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Select a valid counter status.' });
      return;
    }
    try {
      const snapshot = hospitalStore.updateCounterStatus(
        req.user!,
        String(req.params.id),
        parsed.data.status,
        parsed.data.departmentId
      );
      broadcastState('counter:status', `Counter status updated to ${parsed.data.status}`, snapshot);
      res.json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update counter.' });
    }
  });

  // --- ORCHESTRATE Recommendations ---
  app.post('/api/recommendations/:id/action', requireRole(['admin', 'staff']), (req: AuthedRequest, res) => {
    const parsed = z.object({ decision: z.enum(['approve', 'dismiss']) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Decision must be approve or dismiss.' });
      return;
    }
    try {
      const snapshot = hospitalStore.actOnRecommendation(
        req.user!,
        String(req.params.id),
        parsed.data.decision
      );
      broadcastState('orchestrate:action', `Recommendation ${parsed.data.decision}d`, snapshot);
      res.json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Action failed.' });
    }
  });

  // --- Admin Resource Management ---
  app.post('/api/admin/departments', requireRole(['admin']), (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(60),
        code: z.string().min(2).max(4),
        avgServiceMin: z.number().int().min(5).max(60),
        targetWaitMin: z.number().int().min(5).max(90),
        description: z.string().max(240).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide valid department name, code, and timing targets.' });
      return;
    }
    const snapshot = hospitalStore.addDepartment(req.user!, {
      ...parsed.data,
      description: parsed.data.description || '',
    });
    broadcastState('admin:department', `Department ${parsed.data.name} added`, snapshot);
    res.status(201).json({ snapshot });
  });

  app.post('/api/admin/doctors', requireRole(['admin']), (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(80),
        specialty: z.string().min(2).max(80),
        departmentId: z.string().min(1),
        avgConsultationMin: z.number().int().min(5).max(60),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide doctor name, specialty, department, and avg consultation duration.' });
      return;
    }
    try {
      const snapshot = hospitalStore.addDoctor(req.user!, parsed.data);
      broadcastState('admin:doctor', `Clinician ${parsed.data.name} added`, snapshot);
      res.status(201).json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to add doctor.' });
    }
  });

  app.post('/api/admin/counters', requireRole(['admin']), (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(60),
        code: z.string().min(1).max(4),
        departmentId: z.string().min(1),
        status: z.enum(['Open', 'Closed', 'Maintenance']),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide counter name, code, department, and initial status.' });
      return;
    }
    try {
      const snapshot = hospitalStore.addCounter(req.user!, parsed.data);
      broadcastState('admin:counter', `Counter ${parsed.data.name} added`, snapshot);
      res.status(201).json({ snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to add counter.' });
    }
  });

  // --- ORBIT Simulation Studio ---
  const simParamsSchema = z.object({
    incomingPatientVolume: z.number().min(1).max(120),
    doctorAvailability: z.number().min(1).max(12),
    openCounters: z.number().min(1).max(12),
    consultationDuration: z.number().min(5).max(45),
    appointmentDelays: z.number().min(0).max(90),
    patientArrivalRate: z.number().min(1).max(60),
  });

  app.post('/api/simulations/run', requireAuth, (req, res) => {
    const parsed = z
      .object({
        baselineParams: simParamsSchema,
        scenarioParams: simParamsSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid simulation parameters.' });
      return;
    }
    const comparison = runOrbitSimulation(parsed.data.baselineParams, parsed.data.scenarioParams);
    res.json({ comparison, isSimulated: true });
  });

  app.post('/api/scenarios', requireAuth, (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(90),
        presetId: z
          .enum([
            'normal_operations',
            'patient_surge',
            'doctor_unavailable',
            'additional_counter',
            'appointment_delays',
            'custom',
          ])
          .optional(),
        baselineParams: simParamsSchema,
        scenarioParams: simParamsSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a scenario name and valid simulation parameters.' });
      return;
    }
    const result = hospitalStore.saveScenario(req.user!, parsed.data);
    broadcastState('scenario:saved', `Saved scenario "${result.scenario.name}"`, result.snapshot);
    res.status(201).json(result);
  });

  // --- Notifications & Demo Reset ---
  app.post('/api/notifications/read', requireAuth, (req: AuthedRequest, res) => {
    const snapshot = hospitalStore.markNotificationsRead(req.user!);
    res.json({ snapshot });
  });

  app.post('/api/demo/reset', requireAuth, (req: AuthedRequest, res) => {
    const snapshot = hospitalStore.resetDemoData(req.user!.name);
    broadcastState('demo:reset', 'HACKARAVA Demo Data reset to initial 24-patient baseline', snapshot);
    res.json({ snapshot });
  });

  // --- Landing Page Contact Form ---
  app.post('/api/contact', (req, res) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(80),
        email: z.string().email().max(120),
        organization: z.string().min(2).max(120),
        message: z.string().min(10).max(1200),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please complete all fields (message must be at least 10 characters).' });
      return;
    }
    const receipt = hospitalStore.saveContactMessage(parsed.data);
    res.status(201).json({
      ok: true,
      ...receipt,
      message: 'Inquiry received by QueueLess ORBIT team.',
    });
  });

  // --- Vite Middleware / Static Production Assets ---
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`QueueLess ORBIT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start QueueLess ORBIT server:', err);
  process.exit(1);
});
