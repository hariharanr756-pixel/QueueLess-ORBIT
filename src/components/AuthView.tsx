import React, { useState } from 'react';
import { ArrowLeft, KeyRound, ShieldCheck, Stethoscope, UserCheck, Users } from 'lucide-react';
import { useOrbit } from '../context/OrbitContext.tsx';
import { orbitApi } from '../lib/api.ts';
import type { UserRole } from '../../shared/types.ts';

type AuthMode = 'login' | 'register' | 'recover';

export function AuthView() {
  const { setRoute, launchDemoRole, loginWithPassword, registerUser, loading, error, clearError } =
    useOrbit();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [localError, setLocalError] = useState<string | null>(null);

  // Recovery flow state
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'confirm'>('request');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryDemoCode, setRecoveryDemoCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    setRecoveryMessage(null);
    clearError();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      await loginWithPassword(email, password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to sign in.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    try {
      await registerUser({ name, email, password, role });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to create account.');
    }
  };

  const handleRecoveryRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setRecoveryMessage(null);
    setSubmitting(true);
    try {
      const res = await orbitApi.requestRecovery(email);
      setRecoveryMessage(res.message);
      if (res.demoCode) {
        setRecoveryDemoCode(res.demoCode);
        setRecoveryStep('confirm');
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Recovery request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      const res = await orbitApi.confirmRecovery(email, recoveryCode, recoveryNewPassword);
      setRecoveryMessage(res.message);
      setRecoveryDemoCode(null);
      setRecoveryStep('request');
      setMode('login');
      setPassword('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen orbit-cosmic-bg text-slate-100 flex flex-col">
      <header className="border-b border-indigo-500/20 bg-[#050712]/80 backdrop-blur-xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRoute('landing')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-cyan-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to QueueLess ORBIT
        </button>
        <span className="font-display text-base font-bold text-white">
          QueueLess <span className="text-cyan-300">ORBIT</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid w-full grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Instant Demo Mode Launcher */}
          <div className="lg:col-span-6 orbit-glass rounded-2xl border border-cyan-400/25 p-6 sm:p-8">
            <div className="text-xs font-semibold text-cyan-300">
              Instant Demo Mode · Fictional Records
            </div>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-white">
              Enter any role dashboard in one click
            </h1>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Explore synchronized real-time coordination across 24 simulated patients, 3 doctors,
              and 4 counters without creating an account first.
            </p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => launchDemoRole('admin', 'overview')}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#080D22]/85 p-4 text-left hover:border-violet-400/60 hover:bg-violet-950/35 transition-colors flex items-center justify-between gap-4 disabled:opacity-60"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/35 bg-violet-500/20 text-violet-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-white">
                      Administrator Command Center
                    </div>
                    <div className="text-xs text-slate-400">
                      Dr. Priya Nair · Operations Director · KPIs, Analytics, Simulation Studio
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-violet-300 whitespace-nowrap">
                  Enter Demo
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => launchDemoRole('staff', 'overview')}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#080D22]/85 p-4 text-left hover:border-cyan-400/60 hover:bg-cyan-950/30 transition-colors flex items-center justify-between gap-4 disabled:opacity-60"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/35 bg-cyan-500/20 text-cyan-300">
                    <Stethoscope className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-white">
                      Hospital Staff Interface
                    </div>
                    <div className="text-xs text-slate-400">
                      Aarav Menon, RN · Walk-ins, Call-Next, Doctor Availability Controls
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-cyan-300 whitespace-nowrap">
                  Enter Demo
                </span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => launchDemoRole('patient', 'overview')}
                className="w-full rounded-xl border border-indigo-400/25 bg-[#080D22]/85 p-4 text-left hover:border-blue-400/60 hover:bg-blue-950/30 transition-colors flex items-center justify-between gap-4 disabled:opacity-60"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/35 bg-blue-500/20 text-blue-300">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display font-semibold text-white">
                      Patient Application
                    </div>
                    <div className="text-xs text-slate-400">
                      Ananya Sharma · Active Token ORB-104 · Appointment Booking & Wait Range
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-blue-300 whitespace-nowrap">
                  Enter Demo
                </span>
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-indigo-400/20 bg-[#070B1E]/80 p-4 text-xs text-slate-300 flex items-start gap-3">
              <Users className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
              <span>
                Demo sessions issue signed server-side Bearer tokens held in browser memory only.
                You can switch roles anytime inside the workspace to observe live WebSocket sync.
              </span>
            </div>
          </div>

          {/* Right: Standard Registration, Sign In & Password Recovery */}
          <div className="lg:col-span-6 orbit-glass rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-1 rounded-full border border-indigo-400/25 bg-[#070B1E] p-1">
              {(
                [
                  ['login', 'Sign In'],
                  ['register', 'Register'],
                  ['recover', 'Password Recovery'],
                ] as Array<[AuthMode, string]>
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => switchMode(tabId)}
                  className={`flex-1 rounded-full py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    mode === tabId
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {displayError && (
              <div className="mt-5 rounded-xl border border-rose-400/40 bg-rose-950/50 px-4 py-3 text-xs text-rose-200">
                {displayError}
              </div>
            )}

            {recoveryMessage && (
              <div className="mt-5 rounded-xl border border-emerald-400/40 bg-emerald-950/50 px-4 py-3 text-xs text-emerald-200 space-y-1">
                <div>{recoveryMessage}</div>
                {recoveryDemoCode && (
                  <div className="font-mono-num text-sm font-semibold text-white">
                    Simulated Preview Code: {recoveryDemoCode}
                  </div>
                )}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="auth-login-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="auth-login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@hospital.org"
                    className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-login-pass" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <input
                    id="auth-login-pass"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="orbit-pill-btn w-full rounded-full py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                </button>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <button
                    type="button"
                    onClick={() => switchMode('recover')}
                    className="hover:text-cyan-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="hover:text-white transition-colors"
                  >
                    Create new account
                  </button>
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="auth-reg-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="auth-reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Arjun Nair or Patient Name"
                    className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="auth-reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-reg-role" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Account Role
                  </label>
                  <select
                    id="auth-reg-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="patient">Patient (Book appointments & track tokens)</option>
                    <option value="staff">Hospital Staff (Queue desk & doctor status)</option>
                    <option value="admin">Administrator (Command center & simulation)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="auth-reg-pass" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password (minimum 6 characters)
                  </label>
                  <input
                    id="auth-reg-pass"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="orbit-pill-btn w-full rounded-full py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            )}

            {mode === 'recover' && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <KeyRound className="h-4 w-4 text-cyan-300" />
                  <span>
                    {recoveryStep === 'request'
                      ? 'Enter your registered email to issue a time-limited recovery code.'
                      : 'Enter the 6-digit recovery code and your new password.'}
                  </span>
                </div>

                {recoveryStep === 'request' ? (
                  <form onSubmit={handleRecoveryRequest} className="space-y-4">
                    <div>
                      <label htmlFor="rec-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                        Registered Email
                      </label>
                      <input
                        id="rec-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="orbit-pill-btn w-full rounded-full py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
                    >
                      {submitting ? 'Generating Code...' : 'Send Recovery Code'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleRecoveryConfirm} className="space-y-4">
                    <div>
                      <label htmlFor="rec-code" className="block text-xs font-medium text-slate-300 mb-1.5">
                        6-Digit Recovery Code
                      </label>
                      <input
                        id="rec-code"
                        type="text"
                        required
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                        placeholder="123456"
                        className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 font-mono-num text-sm text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="rec-pass" className="block text-xs font-medium text-slate-300 mb-1.5">
                        New Password
                      </label>
                      <input
                        id="rec-pass"
                        type="password"
                        required
                        minLength={6}
                        value={recoveryNewPassword}
                        onChange={(e) => setRecoveryNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className="w-full rounded-xl border border-indigo-400/25 bg-[#070B1E] px-3.5 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-60"
                    >
                      {submitting ? 'Updating Password...' : 'Reset Password'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
