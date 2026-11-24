import { CheckCircle2, Circle, Play, RotateCcw, X } from 'lucide-react';
import { useOrbit, type DemoProgress } from '../context/OrbitContext.tsx';

interface DemoGuidePanelProps {
  open: boolean;
  onClose: () => void;
}

const DEMO_STEPS: Array<{
  key: keyof DemoProgress;
  stepNum: number;
  title: string;
  instruction: string;
  actionLabel: string;
}> = [
  {
    key: 'openedAdmin',
    stepNum: 1,
    title: 'Open Admin Command Center',
    instruction: 'Start in Administrator view showing 24 fictional patients, 3 doctors, and 4 counters.',
    actionLabel: 'Go to Admin',
  },
  {
    key: 'inspectedPredictions',
    stepNum: 2,
    title: 'Show Live Queue & Predictions',
    instruction: 'Review waiting patients, lower/upper wait ranges, and department utilization.',
    actionLabel: 'View Predictions',
  },
  {
    key: 'markedDoctorUnavailable',
    stepNum: 3,
    title: 'Mark a Doctor Unavailable',
    instruction: 'Set Dr. Rohan Verma (Cardiology) to Unavailable from Admin Quick Controls or Staff view.',
    actionLabel: 'Open Controls',
  },
  {
    key: 'sawRecalculatedWait',
    stepNum: 4,
    title: 'Demonstrate Recalculated Wait Times',
    instruction: 'Observe immediate wait-range increase and critical ORCHESTRATE alert.',
    actionLabel: 'Check Impact',
  },
  {
    key: 'openedCounter4',
    stepNum: 5,
    title: 'Open Standby Counter 4',
    instruction: 'Activate Counter 4 (Flex Standby) to relieve intake congestion and lower wait estimates.',
    actionLabel: 'Open Counter 4',
  },
  {
    key: 'comparedSimulation',
    stepNum: 6,
    title: 'Compare Before / After in Simulation Studio',
    instruction: 'Run scenarios in ORBIT Simulation Studio and compare Before vs After wait projections.',
    actionLabel: 'Open Studio',
  },
  {
    key: 'checkedAuditTrail',
    stepNum: 7,
    title: 'Show Explanations & Audit History',
    instruction: 'Inspect EXPLAIN records showing what changed, why, contributing factors, and approvals.',
    actionLabel: 'Open Audit Log',
  },
  {
    key: 'viewedPatientToken',
    stepNum: 8,
    title: 'Switch to Patient Dashboard',
    instruction: 'Switch to Ananya Sharma (Token ORB-104) to verify live updated token wait range & alerts.',
    actionLabel: 'Switch to Patient',
  },
];

export function DemoGuidePanel({ open, onClose }: DemoGuidePanelProps) {
  const { demoProgress, launchDemoRole, setActiveTab, resetDemo, user, loading } = useOrbit();

  if (!open) return null;

  const completedCount = Object.values(demoProgress).filter(Boolean).length;

  const handleJump = async (stepNum: number) => {
    if (stepNum <= 5) {
      if (user?.role !== 'admin') {
        await launchDemoRole('admin', 'overview');
      } else {
        setActiveTab('overview');
      }
    } else if (stepNum === 6) {
      if (user?.role === 'patient') {
        await launchDemoRole('admin', 'simulation');
      } else {
        setActiveTab('simulation');
      }
    } else if (stepNum === 7) {
      if (user?.role === 'patient') {
        await launchDemoRole('admin', 'intelligence');
      } else {
        setActiveTab('intelligence');
      }
    } else if (stepNum === 8) {
      await launchDemoRole('patient', 'overview');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col border-l border-indigo-500/25 bg-[#070B1E] shadow-2xl">
        <div className="flex items-center justify-between border-b border-indigo-500/20 px-5 py-4">
          <div>
            <div className="text-xs font-semibold text-cyan-300">HACKARAVA 3-Minute Demo Script</div>
            <h2 className="font-display text-lg font-bold text-white">
              Guided Live Workflow ({completedCount}/8)
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close demo guide"
            onClick={onClose}
            className="rounded-lg border border-indigo-400/25 p-1.5 text-slate-400 hover:bg-indigo-500/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#050712]/60">
          {DEMO_STEPS.map((step) => {
            const done = demoProgress[step.key];
            return (
              <div
                key={step.key}
                className={`rounded-xl border p-4 transition-colors ${
                  done
                    ? 'border-emerald-400/35 bg-emerald-950/30'
                    : 'border-indigo-400/20 bg-[#0B1026]/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {step.stepNum}. {step.title}
                      </div>
                      <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                        {step.instruction}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleJump(step.stepNum)}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="h-3 w-3" />
                    {step.actionLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-indigo-500/20 p-4 flex items-center justify-between gap-3 bg-[#070B1E]">
          <span className="text-xs text-slate-400">
            Restore 24-patient baseline anytime
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => resetDemo()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-[#0B1026] px-3 py-2 text-xs font-medium text-slate-200 hover:border-violet-400 hover:text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Demo Data
          </button>
        </div>
      </div>
    </div>
  );
}
