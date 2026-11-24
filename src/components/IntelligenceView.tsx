import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  FileSearch,
  GitBranch,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import { getPersistenceAdapterStatus } from '../lib/firebaseAdapter.ts';

type PillarTab = 'PREDICT' | 'ORCHESTRATE' | 'PROTECT' | 'EXPLAIN';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function IntelligenceView() {
  const { snapshot, applySnapshot, markDemoStep, user } = useOrbit();
  const [pillar, setPillar] = useState<PillarTab>('PREDICT');
  const [auditFilter, setAuditFilter] = useState<'ALL' | PillarTab>('ALL');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [busyRec, setBusyRec] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const persistenceStatus = getPersistenceAdapterStatus();

  useEffect(() => {
    markDemoStep('inspectedPredictions');
    if (pillar === 'EXPLAIN') {
      markDemoStep('checkedAuditTrail');
    }
  }, [pillar, markDemoStep]);

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
      <div className="orbit-glass rounded-2xl p-8 text-sm text-slate-300">
        Loading ORBIT AI Intelligence Engine...
      </div>
    );
  }

  const activeTokens = snapshot.queueTokens
    .filter((t) => t.status === 'waiting' || t.status === 'called')
    .sort((a, b) => a.predictedWaitMax - b.predictedWaitMax);

  const selectedToken =
    activeTokens.find((t) => t.id === selectedTokenId) || activeTokens[0] || null;

  const priorityTokens = snapshot.queueTokens.filter(
    (t) => t.priorityLevel === 'clinician_priority' && Boolean(t.priorityAuthorizedBy)
  );

  const filteredAudits = snapshot.auditLogs.filter(
    (log) => auditFilter === 'ALL' || log.pillar === auditFilter
  );

  const canActOnRecommendations = user?.role === 'admin' || user?.role === 'staff';

  const handleRecAction = async (id: string, decision: 'approve' | 'dismiss') => {
    setBusyRec(id);
    setActionError(null);
    try {
      const { snapshot: updated } = await orbitApi.actOnRecommendation(id, decision);
      applySnapshot(updated, `Recommendation ${decision}d · Audit trail updated`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to apply recommendation.');
    } finally {
      setBusyRec(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Pillar Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs text-cyan-300 font-medium">
            ORBIT AI Intelligence Engine · {snapshot.modelEngine.label}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
            PREDICT · ORCHESTRATE · PROTECT · EXPLAIN
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Intelligence modules"
          className="inline-flex flex-wrap rounded-full border border-indigo-400/25 bg-[#0B1026] p-1 self-start"
        >
          {(
            [
              ['PREDICT', 'PREDICT', Cpu],
              ['ORCHESTRATE', 'ORCHESTRATE', GitBranch],
              ['PROTECT', 'PROTECT', Scale],
              ['EXPLAIN', 'EXPLAIN & Audit', FileSearch],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pillar === id}
              onClick={() => setPillar(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                pillar === id
                  ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-[0_0_20px_-4px_rgba(34,211,238,0.65)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
          {actionError}
        </div>
      )}

      {/* 1. PREDICT TAB */}
      {pillar === 'PREDICT' && (
        <div className="space-y-6">
          {/* Honest Model Architecture Disclosure */}
          <div className="rounded-2xl border border-cyan-400/35 bg-cyan-950/30 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-cyan-300">
                Engine Transparency · Deterministic Baseline Active (FastAPI Random Forest Ready)
              </div>
              <p className="text-xs text-slate-200 leading-relaxed max-w-3xl">
                Wait-time ranges below are computed by a transparent deterministic queueing baseline
                using live demo data (patients ahead, department service duration, active doctors,
                open counters, and schedule delays). We never claim an untrained model is trained AI;
                the typed endpoint contract <span className="font-mono-num font-semibold text-white">{snapshot.modelEngine.fastApiEndpointContract}</span> is ready for a trained Python FastAPI Random Forest service.
              </p>
            </div>
            <div className="text-xs text-slate-400 shrink-0">
              <div>Data Layer:</div>
              <div className="text-white font-medium">{persistenceStatus.label}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Active Token Predictions List */}
            <div className="lg:col-span-7 orbit-glass rounded-2xl p-5">
              <div className="flex items-center justify-between border-b border-indigo-400/20 pb-3">
                <h2 className="font-display text-base font-semibold text-white">
                  Live Token Wait-Time Predictions ({activeTokens.length})
                </h2>
                <span className="text-xs text-slate-400">Click any row to inspect factors</span>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-indigo-400/20 text-slate-400">
                      <th className="py-2 pr-2 font-medium">Token</th>
                      <th className="py-2 px-2 font-medium">Department</th>
                      <th className="py-2 px-2 font-medium text-right">Ahead</th>
                      <th className="py-2 px-2 font-medium text-right">Wait Range</th>
                      <th className="py-2 pl-2 font-medium text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-400/15">
                    {activeTokens.map((tok) => {
                      const active = selectedToken?.id === tok.id;
                      return (
                        <tr
                          key={tok.id}
                          onClick={() => setSelectedTokenId(tok.id)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-violet-500/15' : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <td className="py-2.5 pr-2 font-mono-num font-semibold text-white">
                            {tok.tokenNumber}
                            <div className="font-sans text-[11px] font-normal text-slate-400">
                              {tok.patientName}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-slate-200">
                            {deptMap.get(tok.departmentId)?.name}
                            <div className="text-[11px] text-slate-400">
                              {doctorMap.get(tok.doctorId)?.name}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono-num text-slate-200">
                            {tok.patientsAhead}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono-num font-semibold text-cyan-300">
                            {tok.predictedWaitMin}–{tok.predictedWaitMax}m
                          </td>
                          <td className="py-2.5 pl-2 text-right font-medium">
                            <span
                              className={
                                tok.confidence === 'High'
                                  ? 'text-emerald-300'
                                  : tok.confidence === 'Moderate'
                                  ? 'text-amber-300'
                                  : 'text-rose-300'
                              }
                            >
                              {tok.confidence}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Token Factor Attribution */}
            <div className="lg:col-span-5 orbit-glass rounded-2xl p-5 self-start">
              <div className="border-b border-indigo-400/20 pb-3">
                <h2 className="font-display text-base font-semibold text-white">
                  Contributing Factor Attribution
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Explainable lower/upper estimate breakdown
                </p>
              </div>

              {selectedToken ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-indigo-400/25 bg-[#070B1E]/90 p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono-num text-xl font-bold text-white">
                        {selectedToken.tokenNumber}
                      </div>
                      <div className="text-xs text-slate-300">
                        {selectedToken.patientName} · {deptMap.get(selectedToken.departmentId)?.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-num text-xl font-bold text-cyan-300">
                        {selectedToken.predictedWaitMin}–{selectedToken.predictedWaitMax}m
                      </div>
                      <div className="text-xs text-slate-400">
                        Confidence: {selectedToken.confidence}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {selectedToken.contributingFactors.map((factor, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-indigo-400/20 bg-[#0B1026]/80 p-3"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-white">{factor.label}</span>
                          <span
                            className={`font-mono-num font-semibold ${
                              factor.impactMinutes > 0
                                ? 'text-amber-300'
                                : factor.impactMinutes < 0
                                ? 'text-emerald-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {factor.impactMinutes > 0
                              ? `+${factor.impactMinutes} min`
                              : `${factor.impactMinutes} min`}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-300">{factor.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-6">No active tokens to inspect.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. ORCHESTRATE TAB */}
      {pillar === 'ORCHESTRATE' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="orbit-glass rounded-2xl p-5">
              <div className="text-xs text-slate-400">Clinician Capacity Ratio</div>
              <div className="mt-1 font-mono-num text-2xl font-bold text-white">
                {snapshot.analytics.activeDoctors} / {snapshot.analytics.totalDoctors} Active
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {snapshot.analytics.activeDoctors < snapshot.analytics.totalDoctors
                  ? 'Reduced clinician coverage — spillover active'
                  : 'All scheduled clinicians on duty'}
              </div>
            </div>
            <div className="orbit-glass rounded-2xl p-5 orbit-glow-cyan">
              <div className="text-xs text-slate-400">Counter Throughput Ratio</div>
              <div className="mt-1 font-mono-num text-2xl font-bold text-cyan-300">
                {snapshot.analytics.openCounters} / {snapshot.analytics.totalCounters} Open
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {snapshot.analytics.totalCounters - snapshot.analytics.openCounters} standby counter(s) available
              </div>
            </div>
            <div className="orbit-glass rounded-2xl p-5 orbit-glow-purple">
              <div className="text-xs text-slate-400">Active Recommendations</div>
              <div className="mt-1 font-mono-num text-2xl font-bold text-violet-300">
                {snapshot.recommendations.filter((r) => r.status === 'pending').length} Pending
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Requires human staff or admin approval
              </div>
            </div>
          </div>

          <div className="orbit-glass rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">
              Capacity-Aware Allocation Recommendations
            </h2>

            {snapshot.recommendations.length === 0 ? (
              <div className="rounded-xl border border-emerald-400/35 bg-emerald-950/35 p-5 text-sm text-emerald-200 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
                <span>
                  No bottlenecks detected. Department workloads and counter capacity are currently balanced.
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {snapshot.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-indigo-400/20 bg-[#0B1026]/85 p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold uppercase ${
                            rec.severity === 'critical'
                              ? 'text-rose-300'
                              : rec.severity === 'warning'
                              ? 'text-amber-300'
                              : 'text-cyan-300'
                          }`}
                        >
                          {rec.severity}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300 capitalize">Status: {rec.status}</span>
                      </div>
                      {rec.estimatedWaitReductionMin > 0 && (
                        <span className="font-mono-num text-emerald-300 font-semibold">
                          Projected wait reduction: −{rec.estimatedWaitReductionMin} min
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-base font-semibold text-white">{rec.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {rec.summary}
                    </p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                      {rec.contributingFactors.map((f, idx) => (
                        <span key={idx}>• {f}</span>
                      ))}
                    </div>

                    {rec.status === 'pending' && canActOnRecommendations ? (
                      <div className="flex flex-wrap items-center gap-2.5 pt-2">
                        <button
                          type="button"
                          disabled={busyRec === rec.id}
                          onClick={() => handleRecAction(rec.id, 'approve')}
                          className="orbit-pill-btn rounded-full px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-60"
                        >
                          Approve & Execute: {rec.actionLabel}
                        </button>
                        <button
                          type="button"
                          disabled={busyRec === rec.id}
                          onClick={() => handleRecAction(rec.id, 'dismiss')}
                          className="rounded-full border border-indigo-400/30 bg-[#070B1E] px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : rec.resolvedBy ? (
                      <div className="text-xs text-slate-400 pt-1">
                        {rec.status === 'approved' ? 'Approved' : 'Dismissed'} by {rec.resolvedBy} ·{' '}
                        {rec.resolvedAt ? formatTimestamp(rec.resolvedAt) : ''}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. PROTECT TAB */}
      {pillar === 'PROTECT' && (
        <div className="space-y-6">
          <div className="orbit-glass rounded-2xl border-emerald-400/35 p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 text-emerald-300 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Clinical Safety & Fairness Governance
                </h2>
                <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                  {snapshot.fairness.policyNote}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-indigo-400/20 pt-5">
              <div>
                <div className="text-xs text-slate-400">Hospital Fairness Index</div>
                <div className="mt-1 font-mono-num text-3xl font-bold text-emerald-300">
                  {snapshot.fairness.fairnessIndex}
                  <span className="text-base text-slate-500">/100</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Clinician-Authorized Priorities</div>
                <div className="mt-1 font-mono-num text-3xl font-bold text-amber-300">
                  {snapshot.fairness.clinicianPriorityCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Max Standard Queue Wait</div>
                <div className="mt-1 font-mono-num text-3xl font-bold text-white">
                  {snapshot.fairness.maxStandardWaitMin}m
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Starvation guard: {snapshot.fairness.starvationGuardActive ? 'Engaged' : 'Nominal'}
                </div>
              </div>
            </div>
          </div>

          <div className="orbit-glass rounded-2xl p-6">
            <h3 className="font-display text-base font-semibold text-white mb-4">
              Active Clinician-Authorized Priority Registry ({priorityTokens.length})
            </h3>
            {priorityTokens.length === 0 ? (
              <p className="text-xs text-slate-400">
                No active priority overrides. All tokens are following standard FIFO + appointment ordering.
              </p>
            ) : (
              <div className="space-y-3">
                {priorityTokens.map((tok) => (
                  <div
                    key={tok.id}
                    className="rounded-xl border border-amber-400/35 bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="font-mono-num font-semibold text-white">
                        {tok.tokenNumber} · {tok.patientName} ({deptMap.get(tok.departmentId)?.name})
                      </div>
                      <div className="text-slate-200 mt-1">
                        Justification: {tok.priorityReason}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-amber-300 font-semibold">
                        Authorized by {tok.priorityAuthorizedBy}
                      </div>
                      <div className="text-slate-300 mt-0.5">
                        Status: {tok.status.replace('_', ' ')} · Wait {tok.predictedWaitMin}–{tok.predictedWaitMax}m
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. EXPLAIN & AUDIT TRAIL TAB */}
      {pillar === 'EXPLAIN' && (
        <div className="orbit-glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-400/20 pb-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Explainability & Immutable Operational Audit Trail ({filteredAudits.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Structured log of what changed, why, contributing factors, recommended action, approval, and timestamp.
              </p>
            </div>

            <div className="inline-flex flex-wrap rounded-full border border-indigo-400/25 bg-[#070B1E] p-1">
              {(['ALL', 'PREDICT', 'ORCHESTRATE', 'PROTECT', 'EXPLAIN'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAuditFilter(f)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    auditFilter === f
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredAudits.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-indigo-400/20 bg-[#0B1026]/85 p-4 sm:p-5 space-y-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono-num font-semibold ${
                        log.pillar === 'PROTECT'
                          ? 'text-emerald-300'
                          : log.pillar === 'ORCHESTRATE'
                          ? 'text-violet-300'
                          : log.pillar === 'PREDICT'
                          ? 'text-cyan-300'
                          : 'text-sky-300'
                      }`}
                    >
                      {log.pillar}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="font-semibold text-white">{log.action}</span>
                  </div>
                  <span className="font-mono-num text-[11px] text-slate-400">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-slate-400 font-medium">What Changed</div>
                    <p className="text-slate-100 mt-0.5 leading-relaxed">{log.whatChanged}</p>
                  </div>
                  <div>
                    <div className="text-slate-400 font-medium">Why</div>
                    <p className="text-slate-300 mt-0.5 leading-relaxed">{log.why}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-indigo-400/15 pt-2.5 text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-400">Factors: </span>
                    {log.contributingFactors.join(' · ')}
                  </div>
                  <div className="text-slate-100 font-medium whitespace-nowrap">
                    {log.approval}
                  </div>
                </div>
                <div className="text-[11px] font-medium text-cyan-300">
                  Recommended Action: {log.recommendedAction}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
