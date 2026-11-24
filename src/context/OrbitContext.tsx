import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  HospitalStateSnapshot,
  PublicUser,
  UserRole,
} from '../../shared/types.ts';
import { orbitApi, setAuthToken, type PublicSummaryResponse } from '../lib/api.ts';

export type WorkspaceTab =
  | 'overview'
  | 'queue'
  | 'appointments'
  | 'resources'
  | 'intelligence'
  | 'simulation';

export type AppRoute = 'landing' | 'auth' | 'workspace';

export interface DemoProgress {
  openedAdmin: boolean;
  inspectedPredictions: boolean;
  markedDoctorUnavailable: boolean;
  sawRecalculatedWait: boolean;
  openedCounter4: boolean;
  comparedSimulation: boolean;
  checkedAuditTrail: boolean;
  viewedPatientToken: boolean;
}

const INITIAL_DEMO_PROGRESS: DemoProgress = {
  openedAdmin: false,
  inspectedPredictions: false,
  markedDoctorUnavailable: false,
  sawRecalculatedWait: false,
  openedCounter4: false,
  comparedSimulation: false,
  checkedAuditTrail: false,
  viewedPatientToken: false,
};

interface OrbitContextValue {
  route: AppRoute;
  setRoute: (r: AppRoute) => void;
  activeTab: WorkspaceTab;
  setActiveTab: (t: WorkspaceTab) => void;
  user: PublicUser | null;
  snapshot: HospitalStateSnapshot | null;
  publicSummary: PublicSummaryResponse | null;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  lastSyncEvent: string | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  demoProgress: DemoProgress;
  markDemoStep: (step: keyof DemoProgress) => void;
  launchDemoRole: (role: UserRole, targetTab?: WorkspaceTab) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerUser: (input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshState: () => Promise<void>;
  applySnapshot: (snap: HospitalStateSnapshot, banner?: string) => void;
  resetDemo: () => Promise<void>;
}

const OrbitContext = createContext<OrbitContextValue | null>(null);

export function OrbitProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<AppRoute>('landing');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [snapshot, setSnapshot] = useState<HospitalStateSnapshot | null>(null);
  const [publicSummary, setPublicSummary] = useState<PublicSummaryResponse | null>(null);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [lastSyncEvent, setLastSyncEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoProgress, setDemoProgress] = useState<DemoProgress>(INITIAL_DEMO_PROGRESS);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showSyncBanner = useCallback((text: string) => {
    setLastSyncEvent(text);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setLastSyncEvent(null);
    }, 4500);
  }, []);

  const markDemoStep = useCallback((step: keyof DemoProgress) => {
    setDemoProgress((prev) => (prev[step] ? prev : { ...prev, [step]: true }));
  }, []);

  const fetchPublicSummary = useCallback(async () => {
    try {
      const data = await orbitApi.getPublicSummary();
      setPublicSummary(data);
    } catch {
      // Non-blocking on initial boot
    }
  }, []);

  const applySnapshot = useCallback(
    (snap: HospitalStateSnapshot, banner?: string) => {
      setSnapshot(snap);
      // Also mirror live public summary stats so landing page stays live
      setPublicSummary({
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

      // Automatically detect 3-minute demo milestones
      const anyDocOffline = snap.doctors.some(
        (d) => d.availability === 'Unavailable' || d.availability === 'On Break'
      );
      const counter4Open = snap.counters.some((c) => c.id === 'cnt-04' && c.status === 'Open');
      if (anyDocOffline) {
        setDemoProgress((prev) => ({
          ...prev,
          markedDoctorUnavailable: true,
          sawRecalculatedWait: true,
        }));
      }
      if (counter4Open) {
        setDemoProgress((prev) => ({ ...prev, openedCounter4: true }));
      }
      if (banner) {
        showSyncBanner(banner);
      }
    },
    [showSyncBanner]
  );

  // WebSocket real-time synchronization
  useEffect(() => {
    fetchPublicSummary();

    let unmounted = false;
    const connectWs = () => {
      if (unmounted) return;
      setWsStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!unmounted) setWsStatus('connected');
      };

      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as {
            type?: string;
            summary?: string;
            snapshot?: HospitalStateSnapshot;
          };
          if (msg.snapshot) {
            applySnapshot(
              msg.snapshot,
              msg.type === 'state:sync' ? msg.summary : undefined
            );
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (unmounted) return;
        setWsStatus('disconnected');
        reconnectTimerRef.current = window.setTimeout(connectWs, 2500);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      wsRef.current?.close();
    };
  }, [applySnapshot, fetchPublicSummary]);

  const refreshState = useCallback(async () => {
    const snap = await orbitApi.getState();
    applySnapshot(snap);
  }, [applySnapshot]);

  const launchDemoRole = useCallback(
    async (role: UserRole, targetTab?: WorkspaceTab) => {
      setLoading(true);
      setError(null);
      try {
        const res = await orbitApi.demoLogin(role);
        setAuthToken(res.token);
        setUser(res.user);
        const snap = await orbitApi.getState();
        applySnapshot(snap, `Switched to ${res.user.name} (${role.toUpperCase()} Demo Mode)`);
        setRoute('workspace');
        setActiveTab(targetTab || 'overview');
        if (role === 'admin') {
          markDemoStep('openedAdmin');
          markDemoStep('inspectedPredictions');
        }
        if (role === 'patient') {
          markDemoStep('viewedPatientToken');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start demo session.');
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot, markDemoStep]
  );

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await orbitApi.login(email, password);
        setAuthToken(res.token);
        setUser(res.user);
        const snap = await orbitApi.getState();
        applySnapshot(snap, `Signed in as ${res.user.name}`);
        setRoute('workspace');
        setActiveTab('overview');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot]
  );

  const registerUser = useCallback(
    async (input: { name: string; email: string; password: string; role: UserRole }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await orbitApi.register(input);
        setAuthToken(res.token);
        setUser(res.user);
        const snap = await orbitApi.getState();
        applySnapshot(snap, `Account created for ${res.user.name}`);
        setRoute('workspace');
        setActiveTab('overview');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed.');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot]
  );

  const logout = useCallback(async () => {
    try {
      await orbitApi.logout();
    } catch {
      // Best-effort server revoke
    }
    setAuthToken(null);
    setUser(null);
    setRoute('landing');
    setActiveTab('overview');
  }, []);

  const resetDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { snapshot: fresh } = await orbitApi.resetDemoData();
      setDemoProgress(INITIAL_DEMO_PROGRESS);
      if (user?.role === 'admin') {
        setDemoProgress((prev) => ({ ...prev, openedAdmin: true, inspectedPredictions: true }));
      }
      applySnapshot(fresh, 'Demo Data restored (24 patients · 3 doctors · 4 counters)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset demo data.');
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, user]);

  return (
    <OrbitContext.Provider
      value={{
        route,
        setRoute,
        activeTab,
        setActiveTab,
        user,
        snapshot,
        publicSummary,
        wsStatus,
        lastSyncEvent,
        loading,
        error,
        clearError: () => setError(null),
        demoProgress,
        markDemoStep,
        launchDemoRole,
        loginWithPassword,
        registerUser,
        logout,
        refreshState,
        applySnapshot,
        resetDemo,
      }}
    >
      {children}
    </OrbitContext.Provider>
  );
}

export function useOrbit(): OrbitContextValue {
  const ctx = useContext(OrbitContext);
  if (!ctx) {
    throw new Error('useOrbit must be used inside OrbitProvider');
  }
  return ctx;
}
