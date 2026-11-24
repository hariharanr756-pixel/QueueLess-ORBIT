import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  PhoneCall,
  PlayCircle,
  Search,
  ShieldAlert,
  UserPlus,
  X,
} from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import type { DoctorAvailability, QueueToken } from '../../shared/types.ts';

const DOCTOR_STATUSES: DoctorAvailability[] = ['Available', 'Busy', 'On Break', 'Unavailable'];

function formatArrival(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function StaffDashboard() {
  const { snapshot, applySnapshot } = useOrbit();

  // Walk-in registration state
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState('dept-gen');
  const [doctorId, setDoctorId] = useState('');
  const [walkInPriority, setWalkInPriority] = useState(false);
  const [walkInAuthorizer, setWalkInAuthorizer] = useState('');
  const [walkInReason, setWalkInReason] = useState('');
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);

  // Queue filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'completed'>('active');

  // Clinician Priority Authorization Modal
  const [priorityTarget, setPriorityTarget] = useState<QueueToken | null>(null);
  const [modalAuthorizer, setModalAuthorizer] = useState('');
  const [modalReason, setModalReason] = useState('');

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const deptMap = useMemo(
    () => new Map((snapshot?.departments || []).map((d) => [d.id, d])),
    [snapshot]
  );
  const doctorMap = useMemo(
    () => new Map((snapshot?.doctors || []).map((d) => [d.id, d])),
    [snapshot]
  );

  if (!snapshot) {
    return (
      <div className="orbit-glass rounded-2xl p-8 text-sm text-slate-400">
        Loading staff coordination desk...
      </div>
    );
  }

  const filteredTokens = snapshot.queueTokens
    .filter((t) => {
      if (statusFilter === 'active') {
        if (t.status !== 'waiting' && t.status !== 'called' && t.status !== 'in_consultation') {
          return false;
        }
      } else if (statusFilter === 'completed') {
        if (t.status !== 'completed' && t.status !== 'no_show' && t.status !== 'cancelled') {
          return false;
        }
      }
      if (deptFilter !== 'all' && t.departmentId !== deptFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          t.tokenNumber.toLowerCase().includes(q) ||
          t.patientName.toLowerCase().includes(q) ||
          (doctorMap.get(t.doctorId)?.name.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const rank = (s: QueueToken['status']) =>
        s === 'in_consultation' ? 0 : s === 'called' ? 1 : s === 'waiting' ? 2 : 3;
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return (a.queuePosition || 999) - (b.queuePosition || 999);
    });

  const handleDoctorStatus = async (docId: string, availability: DoctorAvailability) => {
    setBusyAction(`doc-${docId}`);
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.updateDoctorAvailability(docId, availability);
      const docName = doctorMap.get(docId)?.name || 'Doctor';
      applySnapshot(updated, `${docName} set to ${availability} · Queue recalculated`);
      setFeedback({
        type: 'success',
        text: `${docName} updated to ${availability}. Hospital avg predicted wait is now ${updated.analytics.avgPredictedWaitMin}–${updated.analytics.avgPredictedWaitMax} min.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update doctor status.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingWalkIn(true);
    setFeedback(null);
    try {
      const res = await orbitApi.registerWalkIn({
        patientName,
        phone,
        departmentId,
        doctorId: doctorId || undefined,
        clinicianPriority: walkInPriority,
        priorityAuthorizedBy: walkInPriority ? walkInAuthorizer : undefined,
        priorityReason: walkInPriority ? walkInReason : undefined,
      });
      applySnapshot(res.snapshot, `Walk-in token ${res.token.tokenNumber} issued`);
      setFeedback({
        type: 'success',
        text: `Issued walk-in token ${res.token.tokenNumber} for ${res.token.patientName} (Predicted wait ${res.token.predictedWaitMin}–${res.token.predictedWaitMax}m).`,
      });
      setPatientName('');
      setPhone('');
      setWalkInPriority(false);
      setWalkInAuthorizer('');
      setWalkInReason('');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Walk-in registration failed.',
      });
    } finally {
      setSubmittingWalkIn(false);
    }
  };

  const handleCallNext = async () => {
    setBusyAction('call-next');
    setFeedback(null);
    try {
      const res = await orbitApi.callNext({
        departmentId: deptFilter === 'all' ? undefined : deptFilter,
      });
      applySnapshot(res.snapshot, `Called next token ${res.calledToken.tokenNumber}`);
      setFeedback({
        type: 'success',
        text: `Now calling ${res.calledToken.tokenNumber} (${res.calledToken.patientName}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'No waiting tokens to call.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleStatusChange = async (tokenId: string, status: QueueToken['status']) => {
    setBusyAction(`tok-${tokenId}`);
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.updateTokenStatus(tokenId, status);
      applySnapshot(updated, `Queue token transitioned to ${status.replace('_', ' ')}`);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Status update failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePriorityModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priorityTarget) return;
    setBusyAction(`pri-${priorityTarget.id}`);
    setFeedback(null);
    try {
      const enabling = priorityTarget.priorityLevel !== 'clinician_priority';
      const { snapshot: updated } = await orbitApi.authorizePriority(priorityTarget.id, {
        enable: enabling,
        authorizedBy: modalAuthorizer,
        reason: modalReason,
      });
      applySnapshot(
        updated,
        enabling
          ? `Clinician priority authorized for ${priorityTarget.tokenNumber}`
          : `Priority cleared for ${priorityTarget.tokenNumber}`
      );
      setPriorityTarget(null);
      setModalAuthorizer('');
      setModalReason('');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Priority update failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">
            Hospital Staff Desk · Synchronized with Patient & Admin Views
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
            Queue Operations & Clinician Coordination
          </h1>
        </div>
        <button
          type="button"
          disabled={busyAction === 'call-next'}
          onClick={handleCallNext}
          className="orbit-pill-btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <PhoneCall className="h-4 w-4" />
          Call Next Waiting Patient
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-400/40 bg-emerald-950/45 text-emerald-200'
              : 'border-rose-400/40 bg-rose-950/45 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Doctor Availability Controls */}
      <section className="orbit-glass rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-indigo-400/20">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Doctor Availability Controls
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Changing availability immediately recalculates hospital wait ranges and notifies affected patients.
            </p>
          </div>
          <span className="font-mono-num text-xs font-semibold text-cyan-300">
            {snapshot.analytics.activeDoctors}/{snapshot.analytics.totalDoctors} Active · Avg Wait{' '}
            {snapshot.analytics.avgPredictedWaitMin}–{snapshot.analytics.avgPredictedWaitMax}m
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {snapshot.doctors.map((doc) => {
            const dept = deptMap.get(doc.departmentId);
            return (
              <div
                key={doc.id}
                className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-white">{doc.name}</div>
                    <div className="text-xs text-slate-400">
                      {dept?.name || doc.specialty} · {doc.completedToday} completed
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      doc.availability === 'Available'
                        ? 'text-emerald-300'
                        : doc.availability === 'Busy'
                        ? 'text-cyan-300'
                        : doc.availability === 'On Break'
                        ? 'text-amber-300'
                        : 'text-rose-300'
                    }`}
                  >
                    {doc.availability}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {DOCTOR_STATUSES.map((st) => {
                    const active = doc.availability === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={busyAction === `doc-${doc.id}`}
                        onClick={() => handleDoctorStatus(doc.id, st)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          active
                            ? st === 'Unavailable'
                              ? 'bg-rose-600 text-white'
                              : st === 'On Break'
                              ? 'bg-amber-600 text-white'
                              : st === 'Busy'
                              ? 'bg-blue-600 text-white'
                              : 'bg-emerald-600 text-white'
                            : 'border border-indigo-400/20 bg-[#0B1026] text-slate-300 hover:text-white'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Grid: Walk-In Registration + Live Queue Console */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Walk-In Registration */}
        <section className="xl:col-span-4 orbit-glass rounded-2xl p-5 sm:p-6 self-start">
          <div className="flex items-center gap-2 pb-4 border-b border-indigo-400/20">
            <UserPlus className="h-4 w-4 text-violet-300" />
            <h2 className="font-display text-base font-semibold text-white">
              Walk-In Registration & Token
            </h2>
          </div>

          <form onSubmit={handleWalkInSubmit} className="mt-4 space-y-3.5">
            <div>
              <label htmlFor="wi-name" className="block text-xs font-medium text-slate-300 mb-1">
                Patient Full Name
              </label>
              <input
                id="wi-name"
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Rohan Deshpande"
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="wi-phone" className="block text-xs font-medium text-slate-300 mb-1">
                Phone Number (Optional)
              </label>
              <input
                id="wi-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98000 12345"
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="wi-dept" className="block text-xs font-medium text-slate-300 mb-1">
                Department
              </label>
              <select
                id="wi-dept"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                {snapshot.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wi-doc" className="block text-xs font-medium text-slate-300 mb-1">
                Assigned Doctor
              </label>
              <select
                id="wi-doc"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="">Auto-assign active department clinician</option>
                {snapshot.doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.availability})
                  </option>
                ))}
              </select>
            </div>

            {/* PROTECT Clinician-Authorized Priority Toggle */}
            <div className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3 space-y-2.5">
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={walkInPriority}
                  onChange={(e) => setWalkInPriority(e.target.checked)}
                  className="rounded border-indigo-400 bg-[#050712] accent-violet-500"
                />
                <span className="font-medium">Clinician-Authorized Priority (PROTECT)</span>
              </label>
              {walkInPriority && (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    required
                    value={walkInAuthorizer}
                    onChange={(e) => setWalkInAuthorizer(e.target.value)}
                    placeholder="Authorizing Clinician (e.g. Dr. Kavitha Rao)"
                    className="w-full rounded-lg border border-indigo-400/25 bg-[#050712] px-2.5 py-1.5 text-xs text-white focus:border-violet-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    required
                    value={walkInReason}
                    onChange={(e) => setWalkInReason(e.target.value)}
                    placeholder="Clinical justification recorded in audit log"
                    className="w-full rounded-lg border border-indigo-400/25 bg-[#050712] px-2.5 py-1.5 text-xs text-white focus:border-violet-400 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submittingWalkIn}
              className="orbit-pill-btn w-full rounded-full py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60"
            >
              {submittingWalkIn ? 'Issuing Token...' : 'Register Walk-In & Generate Token'}
            </button>
          </form>
        </section>

        {/* Live Patient Queue Table */}
        <section className="xl:col-span-8 orbit-glass rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-indigo-400/20">
            <h2 className="font-display text-base font-semibold text-white">
              Live Patient Queue ({filteredTokens.length})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search token or patient"
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none w-44"
                />
              </div>

              <select
                aria-label="Filter by department"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
              >
                <option value="all">All Departments</option>
                {snapshot.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <div className="inline-flex rounded-lg border border-indigo-400/25 bg-[#070B1E] p-0.5">
                {(
                  [
                    ['active', 'Active'],
                    ['completed', 'Closed'],
                    ['all', 'All'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      statusFilter === val
                        ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-indigo-400/20 text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Token</th>
                  <th className="py-2.5 px-3 font-medium">Patient</th>
                  <th className="py-2.5 px-3 font-medium">Arrival</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium text-right">Predicted Wait</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-400/15">
                {filteredTokens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No queue tokens match your current filters.
                    </td>
                  </tr>
                ) : (
                  filteredTokens.map((tok) => {
                    const dept = deptMap.get(tok.departmentId);
                    const doc = doctorMap.get(tok.doctorId);
                    const isPriority = tok.priorityLevel === 'clinician_priority';
                    return (
                      <tr key={tok.id} className="hover:bg-indigo-500/10 transition-colors">
                        <td className="py-3 pr-3 align-middle">
                          <div className="font-mono-num font-semibold text-white">
                            {tok.tokenNumber}
                          </div>
                          {isPriority && (
                            <div className="text-[11px] text-amber-300 font-medium">
                              Clinician Priority
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 align-middle">
                          <div className="font-medium text-white">{tok.patientName}</div>
                          <div className="text-[11px] text-slate-400">
                            {dept?.name} · {doc?.name}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-middle font-mono-num text-slate-300 whitespace-nowrap">
                          {formatArrival(tok.arrivalTime)}
                        </td>
                        <td className="py-3 px-3 align-middle text-slate-300 whitespace-nowrap">
                          {tok.type === 'appointment' ? 'Appointment' : 'Walk-In'}
                        </td>
                        <td className="py-3 px-3 align-middle whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              tok.status === 'in_consultation'
                                ? 'text-violet-300'
                                : tok.status === 'called'
                                ? 'text-amber-300'
                                : tok.status === 'waiting'
                                ? 'text-cyan-300'
                                : tok.status === 'completed'
                                ? 'text-emerald-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {tok.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-middle text-right font-mono-num font-medium text-white whitespace-nowrap">
                          {tok.status === 'waiting' || tok.status === 'called'
                            ? `${tok.predictedWaitMin}–${tok.predictedWaitMax}m`
                            : tok.status === 'in_consultation'
                            ? 'Active'
                            : '—'}
                        </td>
                        <td className="py-3 pl-3 align-middle text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {tok.status === 'waiting' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyAction === `tok-${tok.id}`}
                                  onClick={() => handleStatusChange(tok.id, 'called')}
                                  className="rounded-md border border-cyan-400/35 bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25 whitespace-nowrap"
                                >
                                  Call
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPriorityTarget(tok);
                                    setModalAuthorizer(tok.priorityAuthorizedBy || '');
                                    setModalReason(tok.priorityReason || '');
                                  }}
                                  className="rounded-md border border-amber-400/35 bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/25 whitespace-nowrap"
                                >
                                  {isPriority ? 'Edit Priority' : 'Priority'}
                                </button>
                              </>
                            )}
                            {(tok.status === 'waiting' || tok.status === 'called') && (
                              <button
                                type="button"
                                disabled={busyAction === `tok-${tok.id}`}
                                onClick={() => handleStatusChange(tok.id, 'in_consultation')}
                                className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-500 whitespace-nowrap"
                              >
                                <PlayCircle className="h-3 w-3" />
                                Start
                              </button>
                            )}
                            {tok.status === 'in_consultation' && (
                              <button
                                type="button"
                                disabled={busyAction === `tok-${tok.id}`}
                                onClick={() => handleStatusChange(tok.id, 'completed')}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 whitespace-nowrap"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Complete
                              </button>
                            )}
                            {(tok.status === 'waiting' || tok.status === 'called') && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyAction === `tok-${tok.id}`}
                                  onClick={() => handleStatusChange(tok.id, 'no_show')}
                                  className="rounded-md border border-indigo-400/25 bg-[#070B1E] px-2 py-1 text-[11px] text-slate-300 hover:border-rose-400/50 hover:text-rose-300 whitespace-nowrap"
                                >
                                  No-Show
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction === `tok-${tok.id}`}
                                  onClick={() => handleStatusChange(tok.id, 'cancelled')}
                                  className="rounded-md border border-indigo-400/25 bg-[#070B1E] px-2 py-1 text-[11px] text-slate-300 hover:text-white whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* PROTECT Clinician Priority Authorization Modal */}
      {priorityTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="orbit-glass w-full max-w-md rounded-2xl border border-amber-400/40 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-300">
                <ShieldAlert className="h-5 w-5" />
                <h3 className="font-display text-lg font-bold text-white">
                  PROTECT · Clinician Priority Authorization
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close priority modal"
                onClick={() => setPriorityTarget(null)}
                className="rounded-lg border border-indigo-400/25 p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Token{' '}
              <span className="font-mono-num text-white font-semibold">
                {priorityTarget.tokenNumber}
              </span>{' '}
              ({priorityTarget.patientName}). AI never independently assigns clinical urgency; a
              named clinician must authorize priority placement for the audit record.
            </p>

            <form onSubmit={handlePriorityModalSubmit} className="mt-4 space-y-3.5">
              <div>
                <label htmlFor="pri-auth" className="block text-xs font-medium text-slate-300 mb-1">
                  Authorizing Clinician Name
                </label>
                <input
                  id="pri-auth"
                  type="text"
                  required
                  value={modalAuthorizer}
                  onChange={(e) => setModalAuthorizer(e.target.value)}
                  placeholder="Dr. Kavitha Rao"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="pri-reason" className="block text-xs font-medium text-slate-300 mb-1">
                  Clinical Justification
                </label>
                <textarea
                  id="pri-reason"
                  rows={2}
                  required
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="e.g. Post-operative review or pediatric fever escalation"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPriorityTarget(null)}
                  className="rounded-xl border border-indigo-400/25 bg-[#070B1E] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
                >
                  {priorityTarget.priorityLevel === 'clinician_priority'
                    ? 'Remove Priority Hold'
                    : 'Authorize Priority & Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
