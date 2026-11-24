import { useState } from 'react';
import { motion } from 'motion/react';
import { BedDouble, HeartPulse, Pill, Stethoscope } from 'lucide-react';
import type { PublicSummaryResponse } from '../lib/api.ts';

interface OrbitVisualizerProps {
  summary: PublicSummaryResponse | null;
  onInspectDemo?: () => void;
}

const FALLBACK_TOKENS = [
  { tokenNumber: 'ORB-103', dept: 'Orthopedics', wait: '1–4m', pos: 1 },
  { tokenNumber: 'ORB-104', dept: 'Dermatology', wait: '10–14m', pos: 2 },
  { tokenNumber: 'ORB-105', dept: 'General Medicine', wait: '10–14m', pos: 2 },
  { tokenNumber: 'ORB-106', dept: 'Cardiology', wait: '24–34m', pos: 3 },
];

function iconForDepartment(deptName: string, index: number) {
  const lower = deptName.toLowerCase();
  if (lower.includes('cardio')) return HeartPulse;
  if (lower.includes('ortho')) return BedDouble;
  if (lower.includes('derm') || lower.includes('ent')) return Stethoscope;
  if (lower.includes('general') || lower.includes('ped')) return Pill;
  return [BedDouble, Stethoscope, Pill, HeartPulse][index % 4];
}

export function OrbitVisualizer({ summary, onInspectDemo }: OrbitVisualizerProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const deptLookup = new Map(
    (summary?.departments || []).map((d) => [d.id, d.name])
  );

  const liveTokens =
    summary && summary.sampleTokens.length > 0
      ? summary.sampleTokens.slice(0, 4).map((t) => ({
          tokenNumber: t.tokenNumber,
          dept: deptLookup.get(t.departmentId) || 'General Medicine',
          wait: `${t.predictedWaitMin}–${t.predictedWaitMax}m`,
          pos: t.queuePosition,
        }))
      : FALLBACK_TOKENS;

  const activeToken = liveTokens[selectedIdx % liveTokens.length];
  const waitingTotal = summary
    ? summary.analytics.totalWaiting + summary.analytics.activeConsultations + summary.analytics.completedConsultations
    : 24;
  const displayPatients = summary ? Math.max(summary.analytics.totalWaiting, waitingTotal) : 24;
  const totalCounters = summary ? summary.analytics.totalCounters : 4;

  // Coordinates matching the 4 floating cards around the central holographic hospital
  const nodePositions = [
    { top: '7%', left: '66%', iconBg: 'from-violet-600/40 to-fuchsia-600/30 text-violet-200 border-violet-400/40' },
    { top: '42%', left: '84%', iconBg: 'from-indigo-600/40 to-cyan-600/30 text-cyan-200 border-cyan-400/40' },
    { top: '75%', left: '54%', iconBg: 'from-violet-600/40 to-cyan-500/30 text-cyan-200 border-violet-400/40' },
    { top: '34%', left: '12%', iconBg: 'from-fuchsia-600/40 to-violet-600/30 text-fuchsia-200 border-fuchsia-400/40' },
  ];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[430px] sm:min-h-[470px] lg:h-full select-none">
      {/* Radiant Cosmic Halo Behind Hologram */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[340px] w-[340px] sm:h-[400px] sm:w-[400px] rounded-full bg-gradient-to-tr from-violet-600/25 via-indigo-500/15 to-cyan-400/25 blur-3xl"
      />

      {/* Orbital Container */}
      <div className="relative flex h-[360px] w-full max-w-[540px] sm:h-[420px] items-center justify-center">
        {/* Concentric Tilted Holographic Orbit Rings */}
        <motion.svg
          viewBox="0 0 460 360"
          className="pointer-events-none absolute inset-0 h-full w-full"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: [0.88, 1, 0.88] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <defs>
            <linearGradient id="orbitNeonA" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#D946EF" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="orbitNeonB" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#A855F7" stopOpacity="0.35" />
            </linearGradient>
            <radialGradient id="holoDiscGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.48" />
              <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#050712" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Outer elliptical halo track */}
          <ellipse
            cx="230"
            cy="182"
            rx="168"
            ry="136"
            fill="none"
            stroke="url(#orbitNeonA)"
            strokeWidth="1.5"
            strokeDasharray="6 8"
          />
          {/* Secondary tilted ring */}
          <ellipse
            cx="230"
            cy="185"
            rx="132"
            ry="104"
            fill="none"
            stroke="url(#orbitNeonB)"
            strokeWidth="1.25"
            strokeDasharray="24 10"
          />
          {/* Holographic base pad glow */}
          <ellipse cx="230" cy="236" rx="92" ry="32" fill="url(#holoDiscGrad)" />
          <ellipse
            cx="230"
            cy="236"
            rx="72"
            ry="23"
            fill="none"
            stroke="#22D3EE"
            strokeOpacity="0.65"
            strokeWidth="1.5"
          />
          <ellipse
            cx="230"
            cy="236"
            rx="54"
            ry="16"
            fill="none"
            stroke="#A855F7"
            strokeOpacity="0.7"
            strokeWidth="1.25"
          />

          {/* Glowing Orbiting Nodes */}
          <circle cx="92" cy="110" r="4.5" fill="#22D3EE" />
          <circle cx="92" cy="110" r="10" fill="#22D3EE" fillOpacity="0.22" />
          <circle cx="366" cy="112" r="4" fill="#D946EF" />
          <circle cx="366" cy="112" r="10" fill="#D946EF" fillOpacity="0.24" />
          <circle cx="115" cy="264" r="4.5" fill="#38BDF8" />
          <circle cx="115" cy="264" r="11" fill="#38BDF8" fillOpacity="0.24" />
          <circle cx="348" cy="252" r="3.5" fill="#22D3EE" />
        </motion.svg>

        {/* Isometric Holographic 3D Hospital Centerpiece SVG */}
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative z-10 flex items-center justify-center cursor-pointer"
          onClick={onInspectDemo}
          title="Click to launch live hospital command center"
        >
          <svg
            viewBox="0 0 220 200"
            className="h-44 w-48 sm:h-52 sm:w-56 drop-shadow-[0_0_26px_rgba(34,211,238,0.45)]"
          >
            <defs>
              <linearGradient id="hospWallLeft" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0.25" />
              </linearGradient>
              <linearGradient id="hospWallRight" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#818CF8" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#A855F7" stopOpacity="0.28" />
              </linearGradient>
              <linearGradient id="hospRoof" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#C084FC" stopOpacity="0.4" />
              </linearGradient>
            </defs>

            {/* Left Wing */}
            <polygon points="38,96 76,78 76,136 38,154" fill="url(#hospWallLeft)" stroke="#38BDF8" strokeWidth="1.2" />
            <polygon points="38,96 76,78 96,88 58,106" fill="url(#hospRoof)" stroke="#67E8F9" strokeWidth="1.1" />
            {/* Left wing windows */}
            {[0, 1, 2].map((row) =>
              [0, 1].map((col) => (
                <polygon
                  key={`lw-${row}-${col}`}
                  points={`${44 + col * 13},${108 + row * 12 - col * 5} ${52 + col * 13},${104 + row * 12 - col * 5} ${52 + col * 13},${111 + row * 12 - col * 5} ${44 + col * 13},${115 + row * 12 - col * 5}`}
                  fill="#67E8F9"
                  fillOpacity="0.72"
                />
              ))
            )}

            {/* Right Wing */}
            <polygon points="144,78 182,96 182,154 144,136" fill="url(#hospWallRight)" stroke="#A855F7" strokeWidth="1.2" />
            <polygon points="124,88 144,78 182,96 162,106" fill="url(#hospRoof)" stroke="#C084FC" strokeWidth="1.1" />
            {/* Right wing windows */}
            {[0, 1, 2].map((row) =>
              [0, 1].map((col) => (
                <polygon
                  key={`rw-${row}-${col}`}
                  points={`${152 + col * 13},${104 + row * 12 + col * 5} ${160 + col * 13},${108 + row * 12 + col * 5} ${160 + col * 13},${115 + row * 12 + col * 5} ${152 + col * 13},${111 + row * 12 + col * 5}`}
                  fill="#C4B5FD"
                  fillOpacity="0.72"
                />
              ))
            )}

            {/* Center Main Tower */}
            <polygon points="68,52 110,32 110,148 68,168" fill="url(#hospWallLeft)" stroke="#22D3EE" strokeWidth="1.5" />
            <polygon points="110,32 152,52 152,168 110,148" fill="url(#hospWallRight)" stroke="#C084FC" strokeWidth="1.5" />
            <polygon points="68,52 110,32 152,52 110,72" fill="url(#hospRoof)" stroke="#67E8F9" strokeWidth="1.4" />

            {/* Center tower illuminated windows */}
            {[0, 1, 2, 3].map((row) => (
              <g key={`cw-${row}`}>
                <polygon
                  points={`76,${82 + row * 14} 86,${77 + row * 14} 86,${84 + row * 14} 76,${89 + row * 14}`}
                  fill="#67E8F9"
                  fillOpacity="0.82"
                />
                <polygon
                  points={`93,${74 + row * 14} 103,${69 + row * 14} 103,${76 + row * 14} 93,${81 + row * 14}`}
                  fill="#67E8F9"
                  fillOpacity="0.82"
                />
              </g>
            ))}

            {/* Glowing Medical Cross on Right-Center Facade */}
            <g transform="translate(120, 62)">
              <path
                d="M10 0 H18 V10 H28 V18 H18 V28 H10 V18 H0 V10 H10 Z"
                fill="#22D3EE"
                stroke="#ECFEFF"
                strokeWidth="0.9"
              />
            </g>

            {/* Front Entrance Canopy */}
            <polygon points="88,136 110,125 132,136 110,147" fill="url(#hospRoof)" stroke="#22D3EE" strokeWidth="1.3" />
            <polygon points="88,136 110,147 110,168 88,157" fill="#0F172A" fillOpacity="0.72" stroke="#38BDF8" strokeWidth="1.1" />
            <polygon points="110,147 132,136 132,157 110,168" fill="#1E1B4B" fillOpacity="0.72" stroke="#A855F7" strokeWidth="1.1" />
          </svg>
        </motion.div>

        {/* 4 Floating Token Cards Around the Orbit Ring */}
        {liveTokens.map((tok, i) => {
          const pos = nodePositions[i];
          const Icon = iconForDepartment(tok.dept, i);
          const isSelected = i === selectedIdx % liveTokens.length;
          return (
            <motion.button
              key={tok.tokenNumber}
              type="button"
              onClick={() => setSelectedIdx(i)}
              style={{
                top: pos.top,
                left: pos.left,
                transform: 'translate(-50%, -50%)',
              }}
              animate={{ y: [0, i % 2 === 0 ? -4 : 4, 0] }}
              transition={{ duration: 4.5 + i * 0.6, repeat: Infinity, ease: 'easeInOut' }}
              className={`orbit-glass absolute z-20 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                isSelected
                  ? 'border-cyan-400/70 shadow-[0_0_26px_rgba(34,211,238,0.28)]'
                  : 'border-indigo-400/25 hover:border-violet-400/60'
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${pos.iconBg}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-mono-num text-[11px] font-semibold text-white whitespace-nowrap">
                  {tok.tokenNumber}
                </div>
                <div className="text-[11px] text-slate-300 whitespace-nowrap truncate max-w-[105px]">
                  {tok.dept}
                </div>
                <div className="font-mono-num text-xs font-semibold text-cyan-300 whitespace-nowrap">
                  {tok.wait}
                </div>
              </div>
            </motion.button>
          );
        })}

        {/* Bottom-Right Live Queue Counter Chip */}
        <button
          type="button"
          onClick={onInspectDemo}
          className="orbit-glass absolute bottom-1 right-2 sm:right-4 z-20 rounded-xl border border-indigo-400/30 px-4 py-2.5 text-left hover:border-cyan-400/60 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span>Live Queue</span>
            <span className="text-slate-400 font-normal">· #{activeToken.tokenNumber}</span>
          </div>
          <div className="mt-0.5 font-mono-num text-xs text-slate-300">
            {displayPatients} Patients <span className="text-slate-500 px-1">|</span> {totalCounters} Counters
          </div>
        </button>
      </div>
    </div>
  );
}
