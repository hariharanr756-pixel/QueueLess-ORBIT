import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  LayoutGrid,
  Layers,
  Menu,
  Play,
  ShieldCheck,
  Stethoscope,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import { OrbitVisualizer } from './OrbitVisualizer.tsx';
import type { UserRole } from '../../shared/types.ts';

const PILLARS = [
  {
    index: '01',
    name: 'PREDICT',
    headline: 'Estimate waiting-time ranges',
    description:
      'Calculate lower and upper waiting-time bounds from queue depth, patients ahead, clinician availability, open counters, service durations, and appointment drift — with explicit confidence bands and contributing factors.',
    accent: 'text-cyan-300',
    border: 'hover:border-cyan-400/50',
    span: 'lg:col-span-7',
  },
  {
    index: '02',
    name: 'ORCHESTRATE',
    headline: 'Recommend capacity-aware allocation',
    description:
      'Detect intake counter bottlenecks and clinician workload imbalance early, recommending standby counter activation or safe cross-clinic rebalancing with one-click operator approval.',
    accent: 'text-violet-300',
    border: 'hover:border-violet-400/50',
    span: 'lg:col-span-5',
  },
  {
    index: '03',
    name: 'PROTECT',
    headline: 'Maintain fairness and clinician-authorized priority',
    description:
      'Enforce transparent queue ordering with starvation safeguards. AI never independently decides clinical urgency — every priority override requires named clinician authorization and justification.',
    accent: 'text-blue-300',
    border: 'hover:border-blue-400/50',
    span: 'lg:col-span-5',
  },
  {
    index: '04',
    name: 'EXPLAIN',
    headline: 'Explain recommendations and maintain audit records',
    description:
      'Every wait-time shift, doctor status change, counter opening, and simulation comparison writes a structured record explaining what changed, why, contributing factors, recommended action, and approval.',
    accent: 'text-emerald-300',
    border: 'hover:border-emerald-400/50',
    span: 'lg:col-span-7',
  },
];

const SOLUTIONS: Array<{
  role: UserRole;
  title: string;
  audience: string;
  summary: string;
  capabilities: string[];
  cta: string;
}> = [
  {
    role: 'patient',
    title: 'Patient Application',
    audience: 'Transparent outpatient experience',
    summary:
      'Book appointments across six hospital departments, receive an instant digital token, and follow real-time queue position and predicted waiting-time ranges without front-desk guesswork.',
    capabilities: [
      'Department, doctor, date, and time-slot appointment booking',
      'Live digital token pass with queue position and patients ahead',
      'Lower/upper waiting-time range with plain-language contributing factors',
      'Real-time notifications when clinicians or counters update',
    ],
    cta: 'Launch Patient Demo',
  },
  {
    role: 'staff',
    title: 'Hospital Staff Interface',
    audience: 'Front desk and clinical coordination',
    summary:
      'Register walk-in patients, issue tokens, advance consultations, manage no-shows or cancellations, and toggle doctor availability with immediate hospital-wide queue recalculation.',
    capabilities: [
      'Walk-in registration with optional clinician-authorized priority',
      'One-click Call Next, Start Consultation, Complete, No-Show, Cancel',
      'Doctor availability controls (Available, Busy, On Break, Unavailable)',
      'Live queue table showing token, arrival time, type, status, and wait range',
    ],
    cta: 'Launch Staff Demo',
  },
  {
    role: 'admin',
    title: 'Administrator Command Center',
    audience: 'Real-time hospital operations & simulation',
    summary:
      'Monitor waiting load, active consultations, counter utilization, and bottlenecks across every department, and test capacity interventions inside the interactive ORBIT Simulation Studio.',
    capabilities: [
      'Real-time KPI command deck and interactive Recharts operational analytics',
      'ORBIT Simulation Studio with 6 sliders, 5 scenarios, and Before vs After comparison',
      'One-click counter activation and ORCHESTRATE recommendation approvals',
      'Full PROTECT fairness monitor and EXPLAIN audit log history',
    ],
    cta: 'Launch Admin Demo',
  },
];

const HERO_DOCK_FEATURES = [
  {
    icon: BrainCircuit,
    title: 'Predictive Waiting-Time Intelligence',
    tint: 'from-violet-500/30 to-fuchsia-500/20 border-violet-400/40 text-violet-300',
  },
  {
    icon: Layers,
    title: 'Dynamic Queue Coordination',
    tint: 'from-indigo-500/30 to-violet-500/20 border-indigo-400/40 text-indigo-300',
  },
  {
    icon: ShieldCheck,
    title: 'Fairness-Aware Operations',
    tint: 'from-cyan-500/30 to-blue-500/20 border-cyan-400/40 text-cyan-300',
  },
  {
    icon: BarChart3,
    title: 'Explainable Recommendations',
    tint: 'from-fuchsia-500/30 to-violet-500/20 border-fuchsia-400/40 text-fuchsia-300',
  },
];

export function LandingPage() {
  const { setRoute, launchDemoRole, publicSummary, loading } = useOrbit();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('#home');
  const [activeSolutionRole, setActiveSolutionRole] = useState<UserRole>('admin');

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  const selectedSolution =
    SOLUTIONS.find((s) => s.role === activeSolutionRole) || SOLUTIONS[2];

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(null);
    setContactSubmitting(true);
    try {
      const res = await orbitApi.submitContact({
        name: contactName,
        email: contactEmail,
        organization: contactOrg,
        message: contactMsg,
      });
      setContactSuccess(`${res.message} Reference ID: ${res.id}`);
      setContactName('');
      setContactEmail('');
      setContactOrg('');
      setContactMsg('');
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div id="home" className="min-h-screen orbit-cosmic-bg text-slate-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-indigo-500/15 bg-[#050712]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8 h-20">
          {/* Zone 1: Brand Lockup with Neon Medical Cross */}
          <a
            href="#home"
            onClick={() => setActiveNav('#home')}
            className="flex items-center gap-3 whitespace-nowrap shrink-0 group"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/40 bg-gradient-to-br from-violet-600/30 to-cyan-500/20 shadow-[0_0_20px_rgba(139,92,246,0.45)]">
              <svg viewBox="0 0 28 28" className="h-6 w-6">
                <defs>
                  <linearGradient id="crossBrand" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A855F7" />
                    <stop offset="100%" stopColor="#22D3EE" />
                  </linearGradient>
                </defs>
                <path
                  d="M10 3 H18 V10 H25 V18 H18 V25 H10 V18 H3 V10 H10 Z"
                  fill="none"
                  stroke="url(#crossBrand)"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="font-display text-lg font-bold tracking-tight leading-tight">
              <span className="block text-white">QueueLess</span>
              <span className="block text-xs font-extrabold tracking-[0.14em] bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                ORBIT
              </span>
            </div>
          </a>

          {/* Zone 2: Floating Glass Navigation Pill */}
          <nav
            aria-label="Primary"
            className="hidden lg:flex items-center gap-6 rounded-full border border-indigo-400/20 bg-[#0B1026]/80 px-7 py-2.5 text-sm font-medium text-slate-300 shadow-[0_8px_32px_rgba(5,7,18,0.6)] backdrop-blur-xl"
          >
            {[
              ['#home', 'Home'],
              ['#how-it-works', 'How It Works'],
              ['#intelligence', 'Intelligence'],
              ['#solutions', 'Solutions'],
              ['#contact', 'Contact'],
            ].map(([href, label]) => {
              const isActive = activeNav === href;
              return (
                <a
                  key={href}
                  href={href}
                  onClick={() => setActiveNav(href)}
                  className={`relative py-0.5 transition-colors whitespace-nowrap shrink-0 ${
                    isActive ? 'text-white font-semibold' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute -bottom-1.5 left-0 right-0 h-[2.5px] rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 shadow-[0_0_10px_#22d3ee]" />
                  )}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Actions */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setRoute('auth')}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-[#0B1026]/80 px-4 py-2 text-sm font-medium text-slate-200 hover:border-cyan-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <User className="h-4 w-4 text-slate-300" />
              Sign In
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => launchDemoRole('admin', 'overview')}
              className="orbit-pill-btn inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden rounded-xl border border-indigo-400/30 bg-[#0B1026]/80 p-2 text-slate-200 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-indigo-500/20 bg-[#080C1E]/95 backdrop-blur-xl px-4 py-4 space-y-3 shadow-2xl">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Home', '#home'],
                ['How It Works', '#how-it-works'],
                ['Intelligence', '#intelligence'],
                ['Solutions', '#solutions'],
                ['Contact', '#contact'],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => {
                    setActiveNav(href);
                    setMobileMenuOpen(false);
                  }}
                  className="rounded-xl px-3 py-2 text-slate-200 hover:bg-violet-500/15 hover:text-white"
                >
                  {label}
                </a>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t border-indigo-500/20">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setRoute('auth');
                }}
                className="flex-1 rounded-full border border-indigo-400/30 bg-[#0B1026] py-2 text-sm font-medium text-slate-200"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  launchDemoRole('admin', 'overview');
                }}
                className="orbit-pill-btn flex-1 rounded-full py-2 text-sm font-semibold text-white"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section with Luminous Particle Wave Backdrop */}
      <section className="relative overflow-hidden">
        {/* Ambient cosmic nebulas */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-[460px] w-[520px] rounded-full bg-violet-600/22 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-16 right-0 h-[440px] w-[540px] rounded-full bg-cyan-500/16 blur-[130px]"
        />

        {/* Luminous Flowing Particle Wave SVG across Hero Lower Edge */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 340"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-64 sm:h-72 w-full opacity-75"
        >
          <defs>
            <linearGradient id="waveNeon1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.65" />
              <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.65" />
            </linearGradient>
            <radialGradient id="waveGlowFill" cx="50%" cy="100%" r="70%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#050712" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M0,210 C240,120 420,280 720,220 C1020,160 1210,120 1440,195 L1440,340 L0,340 Z"
            fill="url(#waveGlowFill)"
          />
          {[0, 14, 28, 42, 56].map((offset, idx) => (
            <path
              key={idx}
              d={`M0,${205 + offset} C260,${115 + offset} 450,${275 + offset * 0.5} 740,${215 + offset * 0.6} C1030,${155 + offset * 0.7} 1230,${125 + offset} 1440,${190 + offset}`}
              fill="none"
              stroke="url(#waveNeon1)"
              strokeWidth={idx === 0 ? '1.6' : '1'}
              strokeDasharray="2 7"
              strokeOpacity={0.75 - idx * 0.12}
            />
          ))}
        </svg>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-12 lg:pt-14 lg:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Hero Left Copy */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="lg:col-span-6 flex flex-col justify-center"
            >
              {/* Bracketed Neon Pillar Frame */}
              <div className="inline-flex items-center self-start rounded-xl border border-violet-400/40 bg-[#0D1330]/80 px-4 py-2 text-[11px] sm:text-xs font-semibold tracking-[0.18em] text-slate-200 shadow-[0_0_24px_rgba(139,92,246,0.28)]">
                PREDICT <span className="mx-2 text-cyan-300">·</span> ORCHESTRATE{' '}
                <span className="mx-2 text-violet-300">·</span> PROTECT{' '}
                <span className="mx-2 text-cyan-300">·</span> EXPLAIN
              </div>

              <h1 className="mt-6 font-display text-4xl sm:text-5xl lg:text-[3.85rem] font-extrabold tracking-tight text-white leading-[1.06] max-w-2xl">
                Healthcare queues,{' '}
                <span className="block">intelligently</span>
                <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
                  orchestrated.
                </span>
              </h1>

              <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                Predict patient waiting times, coordinate hospital resources, and create a more
                transparent healthcare experience through intelligent queue management.
              </p>

              {/* Primary CTA Row */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => launchDemoRole('admin', 'overview')}
                  className="orbit-pill-btn inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Launch Live Demo
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2.5 rounded-full border border-indigo-400/35 bg-[#0C122B]/80 px-6 py-3.5 text-sm font-semibold text-slate-100 hover:border-cyan-400/60 hover:bg-[#121A3D] transition-colors whitespace-nowrap shrink-0 backdrop-blur-md"
                >
                  <LayoutGrid className="h-4 w-4 text-cyan-300" />
                  Explore Platform
                </a>
              </div>

              {/* Secondary Simulation Link + Quick Role Links */}
              <div className="mt-5 flex flex-wrap items-center gap-5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => launchDemoRole('admin', 'simulation')}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                >
                  <BarChart3 className="h-4 w-4 text-violet-400" />
                  Open Simulation Studio
                </button>
                <span className="text-slate-600" aria-hidden="true">|</span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => launchDemoRole('patient', 'appointments')}
                  className="text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Book Outpatient Appointment
                </button>
              </div>

              {/* Instant Demo Role Strip */}
              <div className="mt-7 pt-5 border-t border-indigo-400/20 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                <span>Instant HACKARAVA Demo Access:</span>
                <button
                  type="button"
                  onClick={() => launchDemoRole('admin')}
                  className="font-medium text-slate-200 hover:text-cyan-300 underline underline-offset-4 transition-colors"
                >
                  Administrator
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => launchDemoRole('staff')}
                  className="font-medium text-slate-200 hover:text-cyan-300 underline underline-offset-4 transition-colors"
                >
                  Hospital Staff
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => launchDemoRole('patient')}
                  className="font-medium text-slate-200 hover:text-cyan-300 underline underline-offset-4 transition-colors"
                >
                  Patient Portal
                </button>
              </div>
            </motion.div>

            {/* Hero Right Holographic Orbit */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="lg:col-span-6"
            >
              <OrbitVisualizer
                summary={publicSummary}
                onInspectDemo={() => launchDemoRole('admin', 'overview')}
              />
            </motion.div>
          </div>

          {/* Bottom Hero 4-Feature Glowing Glass Dock (Matches Screenshot Footer Strip) */}
          <div className="orbit-glass relative z-10 mt-10 rounded-2xl border border-indigo-400/25 px-5 py-4 sm:px-7 sm:py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-0 lg:divide-x lg:divide-indigo-400/20">
              {HERO_DOCK_FEATURES.map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className={`flex items-center gap-3.5 ${
                      idx > 0 ? 'lg:pl-6' : ''
                    } ${idx < HERO_DOCK_FEATURES.length - 1 ? 'lg:pr-6' : ''}`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${feat.tint}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-slate-100 leading-snug">
                      {feat.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Full-Width Live Demo Telemetry Strip */}
          <div className="orbit-glass mt-6 rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-indigo-400/20 text-xs text-slate-400">
              <span>Live Operational Snapshot · Simulated HACKARAVA Demo Dataset</span>
              <span className="font-mono-num text-cyan-300">
                24 Fictional Patients · 6 Clinical Departments · Deterministic Baseline
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-slate-400">Active Waiting Patients</div>
                <div className="mt-1 font-mono-num text-2xl sm:text-3xl font-bold text-white">
                  {publicSummary ? publicSummary.analytics.totalWaiting : 15}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Across scheduled & walk-in queues
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Predicted Wait Range</div>
                <div className="mt-1 font-mono-num text-2xl sm:text-3xl font-bold text-cyan-300">
                  {publicSummary
                    ? `${publicSummary.analytics.avgPredictedWaitMin}–${publicSummary.analytics.avgPredictedWaitMax}m`
                    : '14–22m'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Lower / upper confidence interval
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Active Clinicians</div>
                <div className="mt-1 font-mono-num text-2xl sm:text-3xl font-bold text-white">
                  {publicSummary
                    ? `${publicSummary.analytics.activeDoctors} / ${publicSummary.analytics.totalDoctors}`
                    : '3 / 3'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Live availability synchronization
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Open Intake Counters</div>
                <div className="mt-1 font-mono-num text-2xl sm:text-3xl font-bold text-violet-300">
                  {publicSummary
                    ? `${publicSummary.analytics.openCounters} / ${publicSummary.analytics.totalCounters}`
                    : '3 / 4'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Standby counter ready for surge
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four Pillars Section (How It Works + Intelligence) */}
      <section id="how-it-works" className="border-t border-indigo-500/20 bg-[#070B1C] py-16 sm:py-20">
        <div id="intelligence" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-cyan-300">
              ORBIT Intelligence Architecture
            </p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-white">
              Four connected pillars built for transparent clinical operations.
            </h2>
            <p className="mt-3 text-slate-300 text-base leading-relaxed">
              Every queue recalculation links deterministic wait-time bounds, capacity allocation
              guidance, clinician-authorized fairness rules, and auditable explanations.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.name}
                className={`${pillar.span} orbit-glass rounded-2xl p-7 transition-colors ${pillar.border}`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-mono-num font-semibold tracking-wider ${pillar.accent}`}>
                    {pillar.index}. {pillar.name}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl sm:text-2xl font-semibold text-white">
                  {pillar.headline}
                </h3>
                <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>

          {/* Simulation Studio Spotlight Banner */}
          <div className="mt-8 rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-[#0E183A] via-[#131438] to-[#1D1240] p-7 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 shadow-[0_0_40px_-14px_rgba(34,211,238,0.28)]">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold text-cyan-300">
                Flagship Operational Workbench
              </div>
              <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-white">
                ORBIT Simulation Studio — Test what-if scenarios before queues stall.
              </h3>
              <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
                Adjust incoming patient volume, doctor availability, open counters, consultation
                duration, appointment delays, and arrival rates. Compare BEFORE vs AFTER outcomes
                across five hospital scenarios and save configurations for executive review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => launchDemoRole('admin', 'simulation')}
              className="orbit-pill-btn inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0"
            >
              Launch Simulation Studio
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Three Product Interfaces Showcase */}
      <section id="solutions" className="border-t border-indigo-500/20 bg-[#050712] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.16em] text-cyan-300">
                Role-Synchronized Workspaces
              </p>
              <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold text-white">
                Three dedicated interfaces synchronized in real time.
              </h2>
            </div>

            {/* Interactive Role Switcher */}
            <div
              role="tablist"
              aria-label="Product interfaces"
              className="inline-flex rounded-full border border-indigo-400/25 bg-[#0B1026] p-1 self-start"
            >
              {(
                [
                  ['patient', 'Patient'],
                  ['staff', 'Hospital Staff'],
                  ['admin', 'Administrator'],
                ] as Array<[UserRole, string]>
              ).map(([role, label]) => (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={activeSolutionRole === role}
                  onClick={() => setActiveSolutionRole(role)}
                  className={`rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeSolutionRole === role
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Active Interface Deep Dive */}
            <div className="lg:col-span-7 orbit-glass rounded-2xl p-7 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-cyan-300">
                  {selectedSolution.audience}
                </div>
                <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-white">
                  {selectedSolution.title}
                </h3>
                <p className="mt-3 text-slate-300 leading-relaxed">
                  {selectedSolution.summary}
                </p>

                <ul className="mt-6 space-y-3">
                  {selectedSolution.capabilities.map((cap) => (
                    <li key={cap} className="flex items-start gap-3 text-sm text-slate-200">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-6 border-t border-indigo-400/20 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => launchDemoRole(selectedSolution.role, 'overview')}
                  className="orbit-pill-btn inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0"
                >
                  {selectedSolution.cta}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRoute('auth')}
                  className="text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                >
                  Or register a personal account
                </button>
              </div>
            </div>

            {/* All Three Quick Cards */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {SOLUTIONS.map((sol) => {
                const Icon =
                  sol.role === 'patient'
                    ? UserCheck
                    : sol.role === 'staff'
                    ? Stethoscope
                    : Activity;
                const active = sol.role === activeSolutionRole;
                return (
                  <button
                    key={sol.role}
                    type="button"
                    onClick={() => setActiveSolutionRole(sol.role)}
                    className={`w-full text-left rounded-2xl border p-5 transition-all ${
                      active
                        ? 'orbit-glass border-cyan-400/60 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
                        : 'border-indigo-400/20 bg-[#0A0F24]/70 hover:border-violet-400/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-400/30 bg-[#12193A] text-cyan-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-display font-semibold text-white">{sol.title}</div>
                          <div className="text-xs text-slate-400">{sol.audience}</div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-cyan-300 whitespace-nowrap">
                        {active ? 'Viewing' : 'Preview'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="border-t border-indigo-500/20 bg-[#070B1C] py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="orbit-glass rounded-2xl p-7 sm:p-10">
            <div className="max-w-xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Contact the QueueLess ORBIT team
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Interested in integrating QueueLess ORBIT with your EHR, FastAPI ML pipeline, or
                outpatient department? Send us a note.
              </p>
            </div>

            <form onSubmit={handleContactSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Dr. Meenakshi Krishnan"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Work Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="operations@hospital.org"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="contact-org" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Hospital or Organization
                </label>
                <input
                  id="contact-org"
                  type="text"
                  required
                  value={contactOrg}
                  onChange={(e) => setContactOrg(e.target.value)}
                  placeholder="Metro Care Multi-Specialty Hospital"
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="contact-msg" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Message
                </label>
                <textarea
                  id="contact-msg"
                  rows={3}
                  required
                  value={contactMsg}
                  onChange={(e) => setContactMsg(e.target.value)}
                  placeholder="Tell us about your outpatient volume, departments, or integration needs..."
                  className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {contactError && (
                <div className="sm:col-span-2 rounded-xl border border-rose-400/40 bg-rose-950/50 px-4 py-2.5 text-xs text-rose-200">
                  {contactError}
                </div>
              )}
              {contactSuccess && (
                <div className="sm:col-span-2 rounded-xl border border-emerald-400/40 bg-emerald-950/50 px-4 py-2.5 text-xs text-emerald-200">
                  {contactSuccess}
                </div>
              )}

              <div className="sm:col-span-2 flex items-center justify-between gap-4 pt-1">
                <span className="text-xs text-slate-400">
                  Validated server-side via Express API.
                </span>
                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="orbit-pill-btn rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {contactSubmitting ? 'Sending...' : 'Send Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-indigo-500/20 bg-[#040610] py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            <span className="font-display font-semibold text-white">QueueLess ORBIT</span> ·
            PREDICT. ORCHESTRATE. PROTECT. EXPLAIN. · HACKARAVA Hackathon Edition
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => launchDemoRole('admin')}
              className="hover:text-cyan-300 transition-colors"
            >
              Admin Demo
            </button>
            <button
              type="button"
              onClick={() => launchDemoRole('staff')}
              className="hover:text-cyan-300 transition-colors"
            >
              Staff Demo
            </button>
            <button
              type="button"
              onClick={() => launchDemoRole('patient')}
              className="hover:text-cyan-300 transition-colors"
            >
              Patient Demo
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
