import React, { useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  Clock,
  Info,
  PlusCircle,
  Ticket,
  XCircle,
} from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';

const TIME_SLOTS = [
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
];

function formatClockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function statusText(status: string): { label: string; color: string } {
  switch (status) {
    case 'waiting':
      return { label: 'Waiting in Queue', color: 'text-cyan-300' };
    case 'called':
      return { label: 'Called to Counter', color: 'text-amber-300' };
    case 'in_consultation':
      return { label: 'In Consultation', color: 'text-violet-300' };
    case 'completed':
      return { label: 'Completed', color: 'text-emerald-300' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'text-slate-400' };
    case 'no_show':
      return { label: 'No-Show', color: 'text-rose-300' };
    default:
      return { label: status, color: 'text-slate-200' };
  }
}

export function PatientDashboard() {
  const { user, snapshot, activeTab, setActiveTab, applySnapshot } = useOrbit();

  const existingPatientPhone =
    snapshot?.patients.find((p) => (user?.patientId ? p.id === user.patientId : false))?.phone || '';

  const [patientName, setPatientName] = useState(user?.name || '');
  const [patientEmail, setPatientEmail] = useState(user?.email || '');
  const [patientPhone, setPatientPhone] = useState(existingPatientPhone);
  const [departmentId, setDepartmentId] = useState('dept-gen');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeSlot, setTimeSlot] = useState('11:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const deptMap = useMemo(
    () => new Map((snapshot?.departments || []).map((d) => [d.id, d])),
    [snapshot]
  );
  const doctorMap = useMemo(
    () => new Map((snapshot?.doctors || []).map((d) => [d.id, d])),
    [snapshot]
  );
  const counterMap = useMemo(
    () => new Map((snapshot?.counters || []).map((c) => [c.id, c])),
    [snapshot]
  );

  if (!snapshot || !user) {
    return (
      <div className="orbit-glass rounded-2xl p-8 text-sm text-slate-400">
        Loading patient queue telemetry...
      </div>
    );
  }

  const myPatientId = user.patientId;
  const myTokens = snapshot.queueTokens.filter((t) =>
    myPatientId ? t.patientId === myPatientId : t.patientName === user.name
  );
  const activeTokens = myTokens.filter(
    (t) => t.status === 'waiting' || t.status === 'called' || t.status === 'in_consultation'
  );
  const primaryToken = activeTokens[0] || null;

  const myAppointments = snapshot.appointments.filter((a) =>
    myPatientId ? a.patientId === myPatientId : a.patientName === user.name
  );
  const upcomingAppointments = myAppointments.filter(
    (a) => a.status === 'scheduled' || a.status === 'checked_in'
  );
  const historyAppointments = myAppointments.filter(
    (a) => a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show'
  );

  const myNotifications = snapshot.notifications.filter(
    (n) =>
      n.targetRole === 'all' ||
      (n.targetRole === 'patient' && (!n.targetPatientId || n.targetPatientId === myPatientId))
  );

  const matchingDoctors = snapshot.doctors.filter(
    (d) => d.departmentId === departmentId || d.secondaryDepartmentIds.includes(departmentId)
  );

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await orbitApi.bookAppointment({
        patientName: patientName.trim() || user.name,
        patientEmail: patientEmail.trim() || user.email,
        patientPhone: patientPhone.trim() || undefined,
        departmentId,
        doctorId: doctorId || undefined,
        date,
        timeSlot,
        notes,
      });
      applySnapshot(
        res.snapshot,
        res.supabaseSync.synced
          ? `Booked & saved to Supabase · Digital Token ${res.token.tokenNumber} issued`
          : `Booked appointment · Digital Token ${res.token.tokenNumber} issued`
      );
      if (res.supabaseSync.synced) {
        setFeedback({
          type: 'success',
          text: `Appointment confirmed and saved to Supabase. Digital Token ${res.token.tokenNumber} is active with predicted wait ${res.token.predictedWaitMin}–${res.token.predictedWaitMax} min.`,
        });
      } else {
        setFeedback({
          type: 'warning',
          text: `Appointment confirmed locally (Digital Token ${res.token.tokenNumber} active, wait ${res.token.predictedWaitMin}–${res.token.predictedWaitMax} min). Supabase sync notice: ${res.supabaseSync.message}`,
        });
      }
      setNotes('');
      setActiveTab('overview');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to book appointment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelToken = async (tokenId: string) => {
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.updateTokenStatus(
        tokenId,
        'cancelled',
        'Cancelled by patient via portal'
      );
      applySnapshot(updated, 'Appointment token cancelled · Queue recalculated');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Cancellation failed.',
      });
    }
  };

  const showBookingOnly = activeTab === 'appointments';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">
            Patient Queue Portal · {user.isDemo ? 'Simulated Demo Record' : 'Live Session'}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
            Welcome, {user.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab(showBookingOnly ? 'overview' : 'appointments')}
            className="orbit-pill-btn inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            {showBookingOnly ? 'Back to My Token' : 'Book New Appointment'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-400/40 bg-emerald-950/45 text-emerald-200'
              : feedback.type === 'warning'
              ? 'border-amber-400/40 bg-amber-950/45 text-amber-200'
              : 'border-rose-400/40 bg-rose-950/45 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Active Digital Token Pass + Notifications */}
      {!showBookingOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Primary Active Digital Token */}
          <div className="lg:col-span-7 orbit-glass orbit-glow-cyan rounded-2xl border border-cyan-400/35 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-indigo-400/20 pb-4">
              <div className="flex items-center gap-2.5">
                <Ticket className="h-5 w-5 text-cyan-300" />
                <span className="font-display text-base font-semibold text-white">
                  Live Digital Queue Token
                </span>
              </div>
              <span className="text-xs text-cyan-300">
                Real-time WebSocket synced
              </span>
            </div>

            {primaryToken ? (
              <div className="mt-5 space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-400">Token Number</div>
                    <div className="font-mono-num text-4xl sm:text-5xl font-bold text-white tracking-tight mt-1">
                      {primaryToken.tokenNumber}
                    </div>
                    <div className="mt-2 text-xs sm:text-sm text-slate-300">
                      {deptMap.get(primaryToken.departmentId)?.name || 'Clinic'} ·{' '}
                      {doctorMap.get(primaryToken.doctorId)?.name || 'Assigned Specialist'} ·{' '}
                      {primaryToken.counterId
                        ? counterMap.get(primaryToken.counterId)?.name
                        : 'Intake Desk'}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xs text-slate-400">Consultation Status</div>
                    <div
                      className={`mt-1 text-base font-semibold ${
                        statusText(primaryToken.status).color
                      }`}
                    >
                      {statusText(primaryToken.status).label}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Doctor status:{' '}
                      <span className="text-white font-medium">
                        {doctorMap.get(primaryToken.doctorId)?.availability || 'Available'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4 Numeric Queue Indicators */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-indigo-400/20 py-5">
                  <div>
                    <div className="text-xs text-slate-400">Queue Position</div>
                    <div className="mt-1 font-mono-num text-2xl font-bold text-white">
                      {primaryToken.status === 'in_consultation'
                        ? 'Now'
                        : `#${primaryToken.queuePosition}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Patients Ahead</div>
                    <div className="mt-1 font-mono-num text-2xl font-bold text-white">
                      {primaryToken.patientsAhead}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Predicted Wait Range</div>
                    <div className="mt-1 font-mono-num text-2xl font-bold text-cyan-300">
                      {primaryToken.status === 'in_consultation'
                        ? '0m'
                        : `${primaryToken.predictedWaitMin}–${primaryToken.predictedWaitMax}m`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Estimate Confidence</div>
                    <div className="mt-1 text-base font-semibold text-white">
                      {primaryToken.confidence}
                    </div>
                  </div>
                </div>

                {/* EXPLAIN Breakdown for Patient Transparency */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200 mb-3">
                    <Info className="h-3.5 w-3.5 text-violet-300" />
                    <span>Why this waiting-time range? (ORBIT EXPLAIN)</span>
                  </div>
                  <div className="space-y-2">
                    {primaryToken.contributingFactors.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-indigo-400/15 pb-2 last:border-0"
                      >
                        <div>
                          <span className="text-white font-medium">{f.label}</span>
                          <span className="text-slate-400"> · {f.detail}</span>
                        </div>
                        <span
                          className={`font-mono-num font-semibold ${
                            f.impactMinutes > 0
                              ? 'text-amber-300'
                              : f.impactMinutes < 0
                              ? 'text-emerald-300'
                              : 'text-slate-400'
                          }`}
                        >
                          {f.impactMinutes > 0 ? `+${f.impactMinutes}m` : `${f.impactMinutes}m`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-400">
                    Deterministic baseline estimate · Updates live when hospital capacity shifts.
                  </span>
                  {primaryToken.status === 'waiting' && (
                    <button
                      type="button"
                      onClick={() => handleCancelToken(primaryToken.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/35 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/50 transition-colors"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel Token
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm text-slate-300">
                  You have no active queue token right now.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('appointments')}
                  className="orbit-pill-btn rounded-full px-5 py-2.5 text-xs font-semibold text-white transition-all"
                >
                  Book an Appointment to Generate Token
                </button>
              </div>
            )}
          </div>

          {/* Live Patient Notifications */}
          <div className="lg:col-span-5 orbit-glass rounded-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between border-b border-indigo-400/20 pb-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-violet-300" />
                <h2 className="font-display text-base font-semibold text-white">
                  Live Queue Notifications
                </h2>
              </div>
              <span className="font-mono-num text-xs text-slate-400">
                {myNotifications.length} alerts
              </span>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-[380px] pr-1">
              {myNotifications.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No notifications yet. Updates appear here automatically when clinic queues shift.
                </p>
              ) : (
                myNotifications.slice(0, 10).map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-white">{n.title}</span>
                      <span className="font-mono-num text-[11px] text-slate-400 whitespace-nowrap">
                        {formatClockTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300 leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Appointment Booking Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 orbit-glass rounded-2xl p-6">
          <div className="flex items-center gap-2 border-b border-indigo-400/20 pb-4">
            <Calendar className="h-4 w-4 text-cyan-300" />
            <h2 className="font-display text-lg font-semibold text-white">
              Book Outpatient Appointment
            </h2>
          </div>

          <form onSubmit={handleBookAppointment} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pt-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Patient Full Name
                </label>
                <input
                  id="pt-name"
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="pt-phone" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Phone Number
                </label>
                <input
                  id="pt-phone"
                  type="tel"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="+1 (555) 234-5678"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pt-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                id="pt-email"
                type="email"
                required
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                placeholder="patient@example.com"
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="pt-dept" className="block text-xs font-medium text-slate-300 mb-1.5">
                Department (6 Specialties Available)
              </label>
              <select
                id="pt-dept"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setDoctorId('');
                }}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                {snapshot.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (Avg {d.avgServiceMin}m visit · Target &lt; {d.targetWaitMin}m)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pt-doc" className="block text-xs font-medium text-slate-300 mb-1.5">
                Preferred Clinician
              </label>
              <select
                id="pt-doc"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="">Auto-assign next available covering specialist</option>
                {(matchingDoctors.length > 0 ? matchingDoctors : snapshot.doctors).map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} — {doc.specialty} ({doc.availability})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pt-date" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Appointment Date
                </label>
                <input
                  id="pt-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="pt-slot" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Time Slot
                </label>
                <select
                  id="pt-slot"
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="pt-notes" className="block text-xs font-medium text-slate-300 mb-1.5">
                Visit Reason (Optional)
              </label>
              <input
                id="pt-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Routine consultation, follow-up, lab review..."
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="orbit-pill-btn w-full rounded-full py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
            >
              {submitting ? 'Generating Digital Token...' : 'Confirm Appointment & Issue Token'}
            </button>
          </form>
        </div>

        {/* Upcoming Appointments & History */}
        <div className="lg:col-span-6 orbit-glass rounded-2xl p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between border-b border-indigo-400/20 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-300" />
                <h2 className="font-display text-base font-semibold text-white">
                  Upcoming Appointments ({upcomingAppointments.length})
                </h2>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              {upcomingAppointments.length === 0 ? (
                <p className="text-xs text-slate-400 py-4">No upcoming appointments scheduled.</p>
              ) : (
                upcomingAppointments.map((apt) => {
                  const tok = apt.tokenId
                    ? snapshot.queueTokens.find((t) => t.id === apt.tokenId)
                    : undefined;
                  return (
                    <div
                      key={apt.id}
                      className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {deptMap.get(apt.departmentId)?.name || 'Clinic'} ·{' '}
                          <span className="font-mono-num text-cyan-300">
                            {tok ? tok.tokenNumber : 'Scheduled'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {doctorMap.get(apt.doctorId)?.name} · {apt.date} at {apt.timeSlot}
                        </div>
                      </div>
                      {tok && (
                        <div className="text-right">
                          <div className="font-mono-num text-xs font-semibold text-white">
                            Wait {tok.predictedWaitMin}–{tok.predictedWaitMax}m
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Pos #{tok.queuePosition || '—'} · {tok.patientsAhead} ahead
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="border-b border-indigo-400/20 pb-3">
              <h3 className="font-display text-base font-semibold text-white">
                Appointment History ({historyAppointments.length})
              </h3>
            </div>
            <div className="mt-3 space-y-2">
              {historyAppointments.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">No past visits recorded yet.</p>
              ) : (
                historyAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between gap-3 border-b border-indigo-400/15 py-2.5 text-xs last:border-0"
                  >
                    <div>
                      <div className="text-white font-medium">
                        {deptMap.get(apt.departmentId)?.name} · {doctorMap.get(apt.doctorId)?.name}
                      </div>
                      <div className="text-slate-400">
                        {apt.date} · {apt.timeSlot} · {apt.notes}
                      </div>
                    </div>
                    <span className="font-medium capitalize text-slate-300 whitespace-nowrap">
                      {apt.status.replace('_', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
