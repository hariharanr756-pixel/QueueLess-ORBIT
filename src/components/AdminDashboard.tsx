import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  DoorOpen,
  Plus,
  Sliders,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import type { CounterStatus, DoctorAvailability } from '../../shared/types.ts';

export function AdminDashboard() {
  const { snapshot, activeTab, setActiveTab, applySnapshot } = useOrbit();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Resource creation forms
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptService, setNewDeptService] = useState(12);
  const [newDeptTarget, setNewDeptTarget] = useState(20);

  const [newDocName, setNewDocName] = useState('');
  const [newDocSpecialty, setNewDocSpecialty] = useState('');
  const [newDocDept, setNewDocDept] = useState('dept-derm');
  const [newDocMinutes, setNewDocMinutes] = useState(12);

  const [newCntName, setNewCntName] = useState('');
  const [newCntCode, setNewCntCode] = useState('');
  const [newCntDept, setNewCntDept] = useState('dept-gen');
  const [newCntStatus, setNewCntStatus] = useState<CounterStatus>('Open');

  const deptMap = useMemo(
    () => new Map((snapshot?.departments || []).map((d) => [d.id, d])),
    [snapshot]
  );

  if (!snapshot) {
    return (
      <div className="orbit-glass rounded-2xl p-8 text-sm text-slate-400">
        Loading Administrator Command Center...
      </div>
    );
  }

  const { analytics } = snapshot;
  const pendingRecs = snapshot.recommendations.filter((r) => r.status === 'pending');

  const queueMixData = [
    { name: 'Appointments', count: analytics.appointmentCount, color: '#A855F7' },
    { name: 'Walk-Ins', count: analytics.walkInCount, color: '#22D3EE' },
    { name: 'Completed', count: analytics.completedConsultations, color: '#34D399' },
    { name: 'No-Shows', count: analytics.noShowCount, color: '#FBBF24' },
    { name: 'Cancelled', count: analytics.cancelledCount, color: '#FB7185' },
  ];

  const handleDoctorToggle = async (docId: string, availability: DoctorAvailability) => {
    setBusyId(`doc-${docId}`);
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.updateDoctorAvailability(docId, availability);
      applySnapshot(updated, `Clinician availability set to ${availability} · Wait ranges updated`);
      setFeedback({
        type: 'success',
        text: `Recalculated hospital queue: Average predicted wait is now ${updated.analytics.avgPredictedWaitMin}–${updated.analytics.avgPredictedWaitMax} min.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update doctor.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCounterToggle = async (counterId: string, status: CounterStatus) => {
    setBusyId(`cnt-${counterId}`);
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.updateCounterStatus(counterId, status);
      applySnapshot(updated, `Counter status changed to ${status} · Queue recalculated`);
      setFeedback({
        type: 'success',
        text: `Counter updated to ${status}. Open counters: ${updated.analytics.openCounters}/${updated.analytics.totalCounters}. Avg predicted wait: ${updated.analytics.avgPredictedWaitMin}–${updated.analytics.avgPredictedWaitMax}m.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update counter.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRecommendation = async (recId: string, decision: 'approve' | 'dismiss') => {
    setBusyId(`rec-${recId}`);
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.actOnRecommendation(recId, decision);
      applySnapshot(updated, `ORCHESTRATE recommendation ${decision}d`);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to process recommendation.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.addDepartment({
        name: newDeptName,
        code: newDeptCode,
        avgServiceMin: Number(newDeptService),
        targetWaitMin: Number(newDeptTarget),
      });
      applySnapshot(updated, `Added department ${newDeptName}`);
      setNewDeptName('');
      setNewDeptCode('');
      setFeedback({ type: 'success', text: `Department added to hospital roster.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add department.' });
    }
  };

  const handleAddDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.addDoctor({
        name: newDocName,
        specialty: newDocSpecialty,
        departmentId: newDocDept,
        avgConsultationMin: Number(newDocMinutes),
      });
      applySnapshot(updated, `Added clinician ${newDocName}`);
      setNewDocName('');
      setNewDocSpecialty('');
      setFeedback({ type: 'success', text: `Clinician added and wait times recalculated.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add clinician.' });
    }
  };

  const handleAddCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const { snapshot: updated } = await orbitApi.addCounter({
        name: newCntName,
        code: newCntCode,
        departmentId: newCntDept,
        status: newCntStatus,
      });
      applySnapshot(updated, `Provisioned ${newCntName}`);
      setNewCntName('');
      setNewCntCode('');
      setFeedback({ type: 'success', text: `Intake counter provisioned.` });
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add counter.' });
    }
  };

  // Resource Management Sub-View
  if (activeTab === 'resources') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400">Administrator Resource Directory</div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
              Departments, Clinicians & Intake Counters
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="rounded-full border border-indigo-400/30 bg-[#0B1026] px-4 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400/60 hover:text-white"
          >
            Back to Command Center
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Departments */}
          <div className="orbit-glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-indigo-400/20 pb-3">
              <Building2 className="h-4 w-4 text-violet-300" />
              <h2 className="font-display font-semibold text-white">
                Departments ({snapshot.departments.length})
              </h2>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {snapshot.departments.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">
                      {d.name} <span className="font-mono-num text-cyan-300">({d.code})</span>
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      Avg {d.avgServiceMin}m · Target SLA {d.targetWaitMin}m
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddDepartment} className="space-y-2.5 border-t border-indigo-400/20 pt-4">
              <div className="text-xs font-medium text-slate-300">Add Department</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Neurology"
                  className="col-span-2 rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                />
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value)}
                  placeholder="NR"
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-white uppercase placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={newDeptService}
                  onChange={(e) => setNewDeptService(Number(e.target.value))}
                  aria-label="Average service minutes"
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 font-mono-num text-xs text-white"
                />
                <input
                  type="number"
                  min={5}
                  max={90}
                  value={newDeptTarget}
                  onChange={(e) => setNewDeptTarget(Number(e.target.value))}
                  aria-label="Target wait minutes"
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 font-mono-num text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Department
              </button>
            </form>
          </div>

          {/* Doctors */}
          <div className="orbit-glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-indigo-400/20 pb-3">
              <Stethoscope className="h-4 w-4 text-cyan-300" />
              <h2 className="font-display font-semibold text-white">
                Doctors ({snapshot.doctors.length})
              </h2>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {snapshot.doctors.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-white">{doc.name}</div>
                      <div className="text-slate-400">
                        {deptMap.get(doc.departmentId)?.name} · {doc.avgConsultationMin}m avg
                      </div>
                    </div>
                    <select
                      aria-label={`Availability for ${doc.name}`}
                      value={doc.availability}
                      onChange={(e) =>
                        handleDoctorToggle(doc.id, e.target.value as DoctorAvailability)
                      }
                      className="rounded-lg border border-indigo-400/25 bg-[#0B1026] px-2 py-1 text-xs text-white"
                    >
                      <option value="Available">Available</option>
                      <option value="Busy">Busy</option>
                      <option value="On Break">On Break</option>
                      <option value="Unavailable">Unavailable</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddDoctor} className="space-y-2.5 border-t border-indigo-400/20 pt-4">
              <div className="text-xs font-medium text-slate-300">Add Clinician</div>
              <input
                type="text"
                required
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Dr. Meera Nair"
                className="w-full rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
              <input
                type="text"
                required
                value={newDocSpecialty}
                onChange={(e) => setNewDocSpecialty(e.target.value)}
                placeholder="Clinical Dermatology"
                className="w-full rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newDocDept}
                  onChange={(e) => setNewDocDept(e.target.value)}
                  className="col-span-2 rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2 py-1.5 text-xs text-white"
                >
                  {snapshot.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={5}
                  max={45}
                  value={newDocMinutes}
                  onChange={(e) => setNewDocMinutes(Number(e.target.value))}
                  aria-label="Average consultation minutes"
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2 py-1.5 font-mono-num text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Doctor
              </button>
            </form>
          </div>

          {/* Counters */}
          <div className="orbit-glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-indigo-400/20 pb-3">
              <DoorOpen className="h-4 w-4 text-blue-300" />
              <h2 className="font-display font-semibold text-white">
                Counters ({snapshot.counters.length})
              </h2>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {snapshot.counters.map((cnt) => (
                <div
                  key={cnt.id}
                  className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{cnt.name}</div>
                    <div className="text-slate-400">
                      {deptMap.get(cnt.departmentId)?.name} · {cnt.servedToday} served
                    </div>
                  </div>
                  <select
                    aria-label={`Status for ${cnt.name}`}
                    value={cnt.status}
                    onChange={(e) => handleCounterToggle(cnt.id, e.target.value as CounterStatus)}
                    className="rounded-lg border border-indigo-400/25 bg-[#0B1026] px-2 py-1 text-xs text-white"
                  >
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddCounter} className="space-y-2.5 border-t border-indigo-400/20 pt-4">
              <div className="text-xs font-medium text-slate-300">Provision Counter</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={newCntName}
                  onChange={(e) => setNewCntName(e.target.value)}
                  placeholder="Counter 5"
                  className="col-span-2 rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                />
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={newCntCode}
                  onChange={(e) => setNewCntCode(e.target.value)}
                  placeholder="C5"
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2.5 py-1.5 text-xs text-white uppercase placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newCntDept}
                  onChange={(e) => setNewCntDept(e.target.value)}
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2 py-1.5 text-xs text-white"
                >
                  {snapshot.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newCntStatus}
                  onChange={(e) => setNewCntStatus(e.target.value as CounterStatus)}
                  className="rounded-lg border border-indigo-400/25 bg-[#070B1E] px-2 py-1.5 text-xs text-white"
                >
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Counter
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Command Center Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">
            Administrator Command Center · Simulated HACKARAVA Demo Data · Deterministic Baseline v1
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
            Hospital Operations Overview
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('simulation')}
            className="orbit-pill-btn inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0"
          >
            <Sliders className="h-4 w-4" />
            Open Simulation Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('resources')}
            className="rounded-full border border-indigo-400/30 bg-[#0B1026] px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Manage Resources
          </button>
        </div>
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

      {/* 6 Core Command KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="orbit-glass rounded-2xl p-4">
          <div className="text-xs text-slate-400">Waiting Patients</div>
          <div className="mt-2 font-mono-num text-3xl font-bold text-white">
            {analytics.totalWaiting}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {analytics.walkInCount} walk-ins · {analytics.appointmentCount} appts
          </div>
        </div>
        <div className="orbit-glass rounded-2xl p-4">
          <div className="text-xs text-slate-400">Active Consultations</div>
          <div className="mt-2 font-mono-num text-3xl font-bold text-violet-300">
            {analytics.activeConsultations}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Currently in rooms</div>
        </div>
        <div className="orbit-glass rounded-2xl p-4">
          <div className="text-xs text-slate-400">Completed Today</div>
          <div className="mt-2 font-mono-num text-3xl font-bold text-emerald-300">
            {analytics.completedConsultations}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {analytics.noShowCount} no-show · {analytics.cancelledCount} cancelled
          </div>
        </div>
        <div className="orbit-glass orbit-glow-cyan rounded-2xl border border-cyan-400/40 p-4">
          <div className="text-xs text-cyan-200">Avg Predicted Wait</div>
          <div className="mt-2 font-mono-num text-3xl font-bold text-cyan-300">
            {analytics.avgPredictedWaitMin}–{analytics.avgPredictedWaitMax}m
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Lower / upper range</div>
        </div>
        <div className="orbit-glass rounded-2xl p-4">
          <div className="text-xs text-slate-400">Available Counters</div>
          <div className="mt-2 font-mono-num text-3xl font-bold text-white">
            {analytics.openCounters}
            <span className="text-lg text-slate-500">/{analytics.totalCounters}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {analytics.totalCounters - analytics.openCounters} standby / closed
          </div>
        </div>
        <div className="orbit-glass rounded-2xl p-4">
          <div className="text-xs text-slate-400">Active Doctors</div>
          <div className="mt-2 font-mono-num text-3xl font-bold text-white">
            {analytics.activeDoctors}
            <span className="text-lg text-slate-500">/{analytics.totalDoctors}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Fairness {snapshot.fairness.fairnessIndex}/100
          </div>
        </div>
      </div>

      {/* Live Quick-Action Operations Strip */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Live Doctor Controls */}
        <div className="xl:col-span-4 orbit-glass rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-400/20">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-cyan-300" />
              <h2 className="font-display text-sm font-semibold text-white">
                Live Doctor Availability
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">Triggers recalculation</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {snapshot.doctors.map((doc) => {
              const isUnavailable = doc.availability === 'Unavailable';
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-semibold text-white">{doc.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {deptMap.get(doc.departmentId)?.name} ·{' '}
                      <span
                        className={
                          isUnavailable
                            ? 'text-rose-300 font-medium'
                            : doc.availability === 'On Break'
                            ? 'text-amber-300 font-medium'
                            : 'text-emerald-300 font-medium'
                        }
                      >
                        {doc.availability}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === `doc-${doc.id}`}
                    onClick={() =>
                      handleDoctorToggle(doc.id, isUnavailable ? 'Available' : 'Unavailable')
                    }
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isUnavailable
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'border border-rose-400/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                    }`}
                  >
                    {isUnavailable ? 'Restore Available' : 'Set Unavailable'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Counter Controls */}
        <div className="xl:col-span-4 orbit-glass rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-400/20">
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-violet-300" />
              <h2 className="font-display text-sm font-semibold text-white">
                Intake Counter Allocation
              </h2>
            </div>
            <span className="font-mono-num text-[11px] text-slate-400">
              {analytics.openCounters}/{analytics.totalCounters} Open
            </span>
          </div>
          <div className="mt-3 space-y-2.5">
            {snapshot.counters.map((cnt) => {
              const isOpen = cnt.status === 'Open';
              return (
                <div
                  key={cnt.id}
                  className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-semibold text-white">{cnt.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {deptMap.get(cnt.departmentId)?.name} ·{' '}
                      <span className={isOpen ? 'text-emerald-300 font-medium' : 'text-amber-300 font-medium'}>
                        {cnt.status}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === `cnt-${cnt.id}`}
                    onClick={() => handleCounterToggle(cnt.id, isOpen ? 'Closed' : 'Open')}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isOpen
                        ? 'border border-indigo-400/30 bg-[#0B1026] text-slate-200 hover:text-white'
                        : 'bg-cyan-600 text-white hover:bg-cyan-500'
                    }`}
                  >
                    {isOpen ? 'Close' : 'Open Counter'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live ORCHESTRATE Recommendations */}
        <div className="xl:col-span-4 orbit-glass rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-400/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <h2 className="font-display text-sm font-semibold text-white">
                ORCHESTRATE Alerts ({pendingRecs.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('intelligence')}
              className="text-[11px] font-semibold text-cyan-300 hover:underline"
            >
              View All
            </button>
          </div>
          <div className="mt-3 flex-1 space-y-2.5">
            {pendingRecs.length === 0 ? (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/35 p-4 text-xs text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-300" />
                <span>
                  All clinics are operating within balanced capacity thresholds. No urgent counter
                  rebalancing required.
                </span>
              </div>
            ) : (
              pendingRecs.slice(0, 2).map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-xl border border-indigo-400/20 bg-[#070B1E]/85 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-semibold ${
                        rec.severity === 'critical'
                          ? 'text-rose-300'
                          : rec.severity === 'warning'
                          ? 'text-amber-300'
                          : 'text-cyan-300'
                      }`}
                    >
                      {rec.severity.toUpperCase()}
                    </span>
                    {rec.estimatedWaitReductionMin > 0 && (
                      <span className="font-mono-num text-[11px] font-semibold text-emerald-300">
                        Est. −{rec.estimatedWaitReductionMin}m wait
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-white">{rec.title}</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{rec.summary}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyId === `rec-${rec.id}`}
                      onClick={() => handleRecommendation(rec.id, 'approve')}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500"
                    >
                      {rec.actionLabel}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === `rec-${rec.id}`}
                      onClick={() => handleRecommendation(rec.id, 'dismiss')}
                      className="rounded-lg border border-indigo-400/25 bg-[#0B1026] px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Interactive Recharts Analytics Suite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hourly Arrivals & Throughput */}
        <div className="lg:col-span-6 orbit-glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Hourly Arrivals & Throughput Trend
              </h2>
              <p className="text-xs text-slate-400">
                Incoming walk-ins & appointments vs completed consultations
              </p>
            </div>
            <Activity className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.hourlyArrivals} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradArrivals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A855F7" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#A855F7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.42} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1026',
                    borderColor: 'rgba(139,92,246,0.35)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#F1F5F9',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#CBD5E1' }} />
                <Area
                  type="monotone"
                  dataKey="arrivals"
                  name="Total Arrivals"
                  stroke="#A855F7"
                  strokeWidth={2}
                  fill="url(#gradArrivals)"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke="#22D3EE"
                  strokeWidth={2}
                  fill="url(#gradCompleted)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Department Predicted Wait Ranges */}
        <div className="lg:col-span-6 orbit-glass rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Department Predicted Wait Range (min)
              </h2>
              <p className="text-xs text-slate-400">
                Lower vs upper wait estimate compared to target SLA
              </p>
            </div>
            <Users className="h-4 w-4 text-violet-300" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.departmentWaitStats}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis
                  dataKey="departmentName"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
                />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1026',
                    borderColor: 'rgba(139,92,246,0.35)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#F1F5F9',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#CBD5E1' }} />
                <Bar dataKey="avgWaitMin" name="Min Wait (m)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgWaitMax" name="Max Wait (m)" fill="#A855F7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="targetWaitMin" name="SLA Target (m)" fill="#22D3EE" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Doctor Utilization */}
        <div className="lg:col-span-6 orbit-glass rounded-2xl p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-white">
            Doctor Utilization & Assigned Load (%)
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Real-time load across clinicians based on active and queued patients
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.doctorUtilization}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                <YAxis type="category" dataKey="doctorName" stroke="#cbd5e1" fontSize={11} width={110} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1026',
                    borderColor: 'rgba(139,92,246,0.35)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#F1F5F9',
                  }}
                />
                <Bar dataKey="utilizationPct" name="Utilization %" radius={[0, 6, 6, 0]}>
                  {analytics.doctorUtilization.map((entry) => (
                    <Cell
                      key={entry.doctorId}
                      fill={
                        entry.availability === 'Unavailable'
                          ? '#FB7185'
                          : entry.utilizationPct >= 85
                          ? '#FBBF24'
                          : '#22D3EE'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Queue Mix & Outcomes */}
        <div className="lg:col-span-6 orbit-glass rounded-2xl p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-white">
            Queue Composition & Visit Outcomes
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Breakdown of appointments, walk-ins, completions, no-shows, and cancellations
          </p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queueMixData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B1026',
                    borderColor: 'rgba(139,92,246,0.35)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    color: '#F1F5F9',
                  }}
                />
                <Bar dataKey="count" name="Patients" radius={[6, 6, 0, 0]}>
                  {queueMixData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
