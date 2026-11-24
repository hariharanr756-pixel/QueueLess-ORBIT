import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookmarkPlus,
  GitCompare,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import {
  deriveBaselineSimulationParams,
  getPresetSimulationParams,
  runOrbitSimulation,
} from '../../shared/orbitEngine.ts';
import type { SimulationParams, SimulationPresetId } from '../../shared/types.ts';

const SCENARIO_PRESETS: Array<{
  id: SimulationPresetId;
  label: string;
  description: string;
}> = [
  {
    id: 'normal_operations',
    label: 'Normal Operations',
    description: 'Matches current live hospital baseline',
  },
  {
    id: 'patient_surge',
    label: 'Patient Surge',
    description: '+85% volume & +75% arrival spike',
  },
  {
    id: 'doctor_unavailable',
    label: 'Doctor Unavailable',
    description: '−1 active clinician on shift',
  },
  {
    id: 'additional_counter',
    label: 'Additional Counter Opened',
    description: '+1 open intake counter activated',
  },
  {
    id: 'appointment_delays',
    label: 'Appointment Delays',
    description: '+20m upstream schedule drift',
  },
];

function formatDelta(val: number, unit: string, invertGood = false): { text: string; color: string } {
  if (val === 0) return { text: `0${unit}`, color: 'text-slate-400' };
  const sign = val > 0 ? '+' : '';
  const isGood = invertGood ? val > 0 : val < 0;
  return {
    text: `${sign}${val}${unit}`,
    color: isGood ? 'text-emerald-300' : 'text-rose-300',
  };
}

export function SimulationStudio() {
  const { snapshot, applySnapshot, markDemoStep } = useOrbit();

  const initialBaseline = useMemo<SimulationParams>(() => {
    if (snapshot) return deriveBaselineSimulationParams(snapshot);
    return {
      incomingPatientVolume: 15,
      doctorAvailability: 3,
      openCounters: 3,
      consultationDuration: 13,
      appointmentDelays: 5,
      patientArrivalRate: 11,
    };
  }, [snapshot]);

  const [baselineParams, setBaselineParams] = useState<SimulationParams>(initialBaseline);
  const [scenarioParams, setScenarioParams] = useState<SimulationParams>(() =>
    getPresetSimulationParams('doctor_unavailable', initialBaseline)
  );
  const [activePreset, setActivePreset] = useState<SimulationPresetId | 'custom'>('doctor_unavailable');
  const [scenarioName, setScenarioName] = useState('');
  const [showCompareDrawer, setShowCompareDrawer] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [runningServer, setRunningServer] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Instant deterministic simulation recomputation whenever sliders move
  const comparison = useMemo(
    () => runOrbitSimulation(baselineParams, scenarioParams),
    [baselineParams, scenarioParams]
  );

  const hourlyChartData = useMemo(() => {
    return comparison.before.hourlyProjection.map((b, idx) => {
      const a = comparison.after.hourlyProjection[idx];
      return {
        hour: b.hour,
        beforeWait: b.avgWaitMin,
        afterWait: a?.avgWaitMin ?? b.avgWaitMin,
        beforeQueue: b.waitingQueue,
        afterQueue: a?.waitingQueue ?? b.waitingQueue,
      };
    });
  }, [comparison]);

  const metricBarData = useMemo(
    () => [
      {
        metric: 'Min Wait (m)',
        Before: comparison.before.predictedWaitMin,
        After: comparison.after.predictedWaitMin,
      },
      {
        metric: 'Max Wait (m)',
        Before: comparison.before.predictedWaitMax,
        After: comparison.after.predictedWaitMax,
      },
      {
        metric: 'Doctor Util %',
        Before: comparison.before.doctorUtilizationPct,
        After: comparison.after.doctorUtilizationPct,
      },
      {
        metric: 'Counter Util %',
        Before: comparison.before.counterUtilizationPct,
        After: comparison.after.counterUtilizationPct,
      },
      {
        metric: 'Fairness',
        Before: comparison.before.fairnessScore,
        After: comparison.after.fairnessScore,
      },
    ],
    [comparison]
  );

  const handleSelectPreset = (presetId: SimulationPresetId) => {
    setActivePreset(presetId);
    setScenarioParams(getPresetSimulationParams(presetId, baselineParams));
    markDemoStep('comparedSimulation');
    setFeedback(null);
  };

  const updateParam = <K extends keyof SimulationParams>(key: K, value: number) => {
    setActivePreset('custom');
    setScenarioParams((prev) => ({ ...prev, [key]: value }));
    markDemoStep('comparedSimulation');
  };

  const handleSyncBaseline = () => {
    if (!snapshot) return;
    const live = deriveBaselineSimulationParams(snapshot);
    setBaselineParams(live);
    setScenarioParams(
      activePreset === 'custom'
        ? live
        : getPresetSimulationParams(activePreset, live)
    );
    setFeedback({
      type: 'success',
      text: `Baseline synchronized with live hospital state (${live.incomingPatientVolume} waiting · ${live.doctorAvailability} doctors · ${live.openCounters} open counters).`,
    });
  };

  const handleReset = () => {
    setActivePreset('normal_operations');
    setScenarioParams({ ...baselineParams });
    setFeedback(null);
  };

  const handleRunServerSimulation = async () => {
    setRunningServer(true);
    setFeedback(null);
    try {
      const res = await orbitApi.runSimulation(baselineParams, scenarioParams);
      markDemoStep('comparedSimulation');
      setFeedback({
        type: 'success',
        text: `Server simulation verified: Avg wait shifted ${res.comparison.before.avgWaitMinutes}m → ${res.comparison.after.avgWaitMinutes}m (${res.comparison.after.bottleneckType}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Simulation run failed.',
      });
    } finally {
      setRunningServer(false);
    }
  };

  const handleSaveScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed =
      scenarioName.trim() ||
      `${SCENARIO_PRESETS.find((p) => p.id === activePreset)?.label || 'Custom What-If'} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    setSavingScenario(true);
    setFeedback(null);
    try {
      const res = await orbitApi.saveScenario({
        name: trimmed,
        presetId: activePreset,
        baselineParams,
        scenarioParams,
      });
      applySnapshot(res.snapshot, `Saved scenario "${res.scenario.name}"`);
      setScenarioName('');
      markDemoStep('comparedSimulation');
      setFeedback({
        type: 'success',
        text: `Saved scenario "${res.scenario.name}" for side-by-side comparison and logged to EXPLAIN audit history.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save scenario.',
      });
    } finally {
      setSavingScenario(false);
    }
  };

  const savedScenarios = snapshot?.scenarios || [];
  const compareScenarios = useMemo(() => {
    if (selectedCompareIds.length > 0) {
      return savedScenarios.filter((s) => selectedCompareIds.includes(s.id));
    }
    return savedScenarios.slice(0, 3);
  }, [savedScenarios, selectedCompareIds]);

  const toggleCompareSelection = (id: string) => {
    setSelectedCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-4)
    );
  };

  const waitDelta = formatDelta(comparison.deltas.avgWaitDiff, 'm');
  const clearanceDelta = formatDelta(comparison.deltas.clearanceDiff, 'm');
  const docUtilDelta = formatDelta(comparison.deltas.doctorUtilDiff, '%');
  const fairnessDelta = formatDelta(comparison.deltas.fairnessDiff, ' pts', true);

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs text-cyan-300 font-semibold tracking-wide">
            ORBIT Simulation Studio · Illustrative Deterministic What-If Results
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
            Hospital Queue What-If Simulator
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Model staffing shifts, surges, counter expansions, and delays before deploying operational changes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSyncBaseline}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-[#0B1026] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5 text-cyan-300" />
            Sync Live Baseline
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-[#0B1026] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-indigo-300/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCompareDrawer((v) => !v);
              markDemoStep('comparedSimulation');
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              showCompareDrawer
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_0_20px_-4px_rgba(139,92,246,0.7)]'
                : 'border border-violet-400/40 bg-violet-950/50 text-violet-200 hover:border-violet-400/70 hover:text-white'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            Compare Scenarios ({savedScenarios.length})
          </button>
          <button
            type="button"
            disabled={runningServer}
            onClick={handleRunServerSimulation}
            className="orbit-pill-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white transition-all whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            {runningServer ? 'Running...' : 'Run Simulation'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs sm:text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-400/40 bg-emerald-950/40 text-emerald-200'
              : 'border-rose-400/40 bg-rose-950/40 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 5 One-Click Scenario Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {SCENARIO_PRESETS.map((preset) => {
          const active = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset.id)}
              className={`orbit-glass rounded-xl p-3.5 text-left transition-all ${
                active
                  ? 'border-cyan-400/70 bg-cyan-950/35 orbit-glow-cyan'
                  : 'hover:border-violet-400/45'
              }`}
            >
              <div className={`text-xs font-semibold ${active ? 'text-cyan-200' : 'text-white'}`}>
                {preset.label}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{preset.description}</div>
            </button>
          );
        })}
      </div>

      {/* Main Split: 6 Interactive Sliders + Before/After Comparison Engine */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: 6 Interactive Controls & Save Scenario */}
        <div className="xl:col-span-4 space-y-5">
          <div className="orbit-glass rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-indigo-400/20 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-cyan-300" />
                <h2 className="font-display text-base font-semibold text-white">
                  Scenario Parameters
                </h2>
              </div>
              <span className="text-[11px] text-slate-400">Live recalculation</span>
            </div>

            {[
              {
                key: 'incomingPatientVolume' as const,
                label: 'Incoming Patient Volume',
                min: 6,
                max: 80,
                step: 1,
                unit: 'pts',
              },
              {
                key: 'doctorAvailability' as const,
                label: 'Doctor Availability',
                min: 1,
                max: 6,
                step: 1,
                unit: 'doctors',
              },
              {
                key: 'openCounters' as const,
                label: 'Number of Open Counters',
                min: 1,
                max: 6,
                step: 1,
                unit: 'counters',
              },
              {
                key: 'consultationDuration' as const,
                label: 'Avg Consultation Duration',
                min: 6,
                max: 30,
                step: 1,
                unit: 'min',
              },
              {
                key: 'appointmentDelays' as const,
                label: 'Appointment Delays',
                min: 0,
                max: 45,
                step: 1,
                unit: 'min',
              },
              {
                key: 'patientArrivalRate' as const,
                label: 'Patient Arrival Rate',
                min: 4,
                max: 30,
                step: 1,
                unit: 'pts/hr',
              },
            ].map((ctrl) => {
              const baseVal = baselineParams[ctrl.key];
              const currVal = scenarioParams[ctrl.key];
              const diff = currVal - baseVal;
              return (
                <div key={ctrl.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`sim-${ctrl.key}`} className="font-medium text-slate-200">
                      {ctrl.label}
                    </label>
                    <div className="font-mono-num">
                      <span className="font-semibold text-white">
                        {currVal} {ctrl.unit}
                      </span>
                      {diff !== 0 && (
                        <span className="ml-1.5 text-[11px] font-medium text-cyan-300">
                          ({diff > 0 ? `+${diff}` : diff} vs {baseVal})
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    id={`sim-${ctrl.key}`}
                    type="range"
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    value={currVal}
                    onChange={(e) => updateParam(ctrl.key, Number(e.target.value))}
                    className="orbit-slider w-full"
                  />
                  <div className="flex justify-between text-[10px] font-mono-num text-slate-400">
                    <span>{ctrl.min}</span>
                    <span>Baseline: {baseVal}</span>
                    <span>{ctrl.max}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Scenario Form */}
          <form onSubmit={handleSaveScenario} className="orbit-glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-display font-semibold text-white">
              <BookmarkPlus className="h-4 w-4 text-violet-300" />
              Save Scenario Snapshot
            </div>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="e.g. Dr. Verma Offline + Open Counter 4"
              className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={savingScenario}
              className="w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-xs font-semibold text-white hover:from-violet-500 hover:to-indigo-500 shadow-[0_0_24px_-6px_rgba(139,92,246,0.75)] transition-all disabled:opacity-60"
            >
              {savingScenario ? 'Saving Scenario...' : 'Save Scenario for Comparison'}
            </button>
          </form>
        </div>

        {/* Right: BEFORE vs AFTER Comparisons, Charts & EXPLAIN */}
        <div className="xl:col-span-8 space-y-6">
          {/* BEFORE vs AFTER KPI Delta Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="orbit-glass rounded-2xl p-4 orbit-glow-cyan">
              <div className="text-xs text-slate-400">Predicted Wait Range</div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="font-mono-num text-xs text-slate-400">
                  {comparison.before.predictedWaitMin}–{comparison.before.predictedWaitMax}m
                </span>
                <span className="text-slate-500">→</span>
                <span className="font-mono-num text-xl font-bold text-cyan-300">
                  {comparison.after.predictedWaitMin}–{comparison.after.predictedWaitMax}m
                </span>
              </div>
              <div className={`mt-1.5 font-mono-num text-xs font-semibold ${waitDelta.color}`}>
                Avg delta: {waitDelta.text}
              </div>
            </div>

            <div className="orbit-glass rounded-2xl p-4">
              <div className="text-xs text-slate-400">Queue Clearance Time</div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="font-mono-num text-xs text-slate-400">
                  {comparison.before.queueClearanceMinutes}m
                </span>
                <span className="text-slate-500">→</span>
                <span className="font-mono-num text-xl font-bold text-white">
                  {comparison.after.queueClearanceMinutes}m
                </span>
              </div>
              <div className={`mt-1.5 font-mono-num text-xs font-semibold ${clearanceDelta.color}`}>
                Delta: {clearanceDelta.text}
              </div>
            </div>

            <div className="orbit-glass rounded-2xl p-4 orbit-glow-purple">
              <div className="text-xs text-slate-400">Doctor / Counter Load</div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="font-mono-num text-xs text-slate-400">
                  {comparison.before.doctorUtilizationPct}%
                </span>
                <span className="text-slate-500">→</span>
                <span className="font-mono-num text-xl font-bold text-violet-300">
                  {comparison.after.doctorUtilizationPct}%
                </span>
              </div>
              <div className={`mt-1.5 font-mono-num text-xs font-semibold ${docUtilDelta.color}`}>
                Doctor {docUtilDelta.text} · Counter {comparison.after.counterUtilizationPct}%
              </div>
            </div>

            <div className="orbit-glass rounded-2xl p-4">
              <div className="text-xs text-slate-400">Bottleneck & Fairness</div>
              <div className="mt-2 text-sm font-bold text-white truncate">
                {comparison.after.bottleneckType}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs gap-2">
                <span
                  className={
                    comparison.after.bottleneckSeverity === 'Critical'
                      ? 'text-rose-300 font-semibold'
                      : comparison.after.bottleneckSeverity === 'High'
                      ? 'text-amber-300 font-semibold'
                      : 'text-emerald-300 font-semibold'
                  }
                >
                  Risk: {comparison.after.bottleneckSeverity}
                </span>
                <span className={`font-mono-num ${fairnessDelta.color}`}>
                  Fairness {comparison.after.fairnessScore} ({fairnessDelta.text})
                </span>
              </div>
            </div>
          </div>

          {/* Charts: 6-Hour Wait Projection + Before/After Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="orbit-glass rounded-2xl p-5">
              <h3 className="font-display text-sm font-semibold text-white">
                6-Hour Wait-Time Trajectory (Before vs After)
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Projected average wait time (minutes) under deterministic arrival vs throughput
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlyChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0B1026',
                        borderColor: 'rgba(139,92,246,0.35)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#F1F5F9',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#CBD5E1' }} />
                    <Line
                      type="monotone"
                      dataKey="beforeWait"
                      name="BEFORE (Baseline)"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3, fill: '#94a3b8' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="afterWait"
                      name="AFTER (Scenario)"
                      stroke="#22D3EE"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#22D3EE' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="orbit-glass rounded-2xl p-5">
              <h3 className="font-display text-sm font-semibold text-white">
                Before vs After Operational Metrics
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Side-by-side comparison of wait bounds, utilization, and fairness
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metricBarData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="metric" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0B1026',
                        borderColor: 'rgba(139,92,246,0.35)',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#F1F5F9',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#CBD5E1' }} />
                    <Bar dataKey="Before" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="After" fill="#A855F7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* EXPLAIN Comparison Breakdown */}
          <div className="orbit-glass rounded-2xl border-violet-400/35 p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-400/20 pb-3">
              <h3 className="font-display text-base font-semibold text-white">
                ORBIT EXPLAIN · Simulation Impact Diagnosis
              </h3>
              <span className="font-mono-num text-xs font-semibold text-cyan-300">
                Throughput: {comparison.before.throughputPerHour} → {comparison.after.throughputPerHour} pts/hr
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-400 font-medium">What Changed</div>
                <p className="mt-1 text-slate-100 leading-relaxed">
                  {comparison.explanation.whatChanged}
                </p>
              </div>
              <div>
                <div className="text-slate-400 font-medium">Why It Happened</div>
                <p className="mt-1 text-slate-300 leading-relaxed">{comparison.explanation.why}</p>
              </div>
            </div>

            <div className="text-xs">
              <div className="text-slate-400 font-medium mb-1.5">Contributing Parameter Shifts</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-200">
                {comparison.explanation.contributingFactors.map((f, idx) => (
                  <span key={idx}>• {f}</span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-400/35 bg-cyan-950/35 p-3.5 text-xs">
              <span className="font-semibold text-cyan-300">Recommended Operational Action: </span>
              <span className="text-slate-100">{comparison.explanation.recommendedAction}</span>
            </div>

            <div className="text-[11px] text-slate-400">{comparison.explanation.modelDisclosure}</div>
          </div>
        </div>
      </div>

      {/* Saved Scenarios Comparison Matrix */}
      {(showCompareDrawer || savedScenarios.length > 0) && (
        <section className="orbit-glass rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-400/20 pb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Saved Scenarios Comparison Matrix ({savedScenarios.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select scenarios to compare side-by-side or load any saved configuration back into the simulator.
              </p>
            </div>
            <span className="text-xs text-slate-400">Illustrative simulation snapshots</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-indigo-400/20 text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Compare</th>
                  <th className="py-2.5 px-3 font-medium">Scenario Name</th>
                  <th className="py-2.5 px-3 font-medium text-right">Config (Vol/Doc/Cnt)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Before Wait</th>
                  <th className="py-2.5 px-3 font-medium text-right">After Wait</th>
                  <th className="py-2.5 px-3 font-medium text-right">Delta</th>
                  <th className="py-2.5 px-3 font-medium">Bottleneck</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-400/15">
                {savedScenarios.map((scn) => {
                  const checked =
                    selectedCompareIds.length > 0
                      ? selectedCompareIds.includes(scn.id)
                      : compareScenarios.some((c) => c.id === scn.id);
                  const d = formatDelta(scn.comparison.deltas.avgWaitDiff, 'm');
                  return (
                    <tr key={scn.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          aria-label={`Compare ${scn.name}`}
                          checked={checked}
                          onChange={() => toggleCompareSelection(scn.id)}
                          className="accent-cyan-400"
                        />
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{scn.name}</div>
                        <div className="text-[11px] text-slate-400">By {scn.createdBy}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-slate-200">
                        {scn.params.incomingPatientVolume} / {scn.params.doctorAvailability} /{' '}
                        {scn.params.openCounters}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-slate-400">
                        {scn.comparison.before.predictedWaitMin}–
                        {scn.comparison.before.predictedWaitMax}m
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-semibold text-cyan-300">
                        {scn.comparison.after.predictedWaitMin}–
                        {scn.comparison.after.predictedWaitMax}m
                      </td>
                      <td className={`py-3 px-3 text-right font-mono-num font-semibold ${d.color}`}>
                        {d.text}
                      </td>
                      <td className="py-3 px-3 text-slate-200">
                        {scn.comparison.after.bottleneckType}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setBaselineParams(scn.comparison.baselineParams);
                            setScenarioParams(scn.params);
                            setActivePreset(scn.presetId || 'custom');
                          }}
                          className="rounded-lg border border-indigo-400/30 bg-[#0B1026] px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors"
                        >
                          Load
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
