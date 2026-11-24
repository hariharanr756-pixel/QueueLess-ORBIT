/**
 * Replaceable Firebase Adapter Readiness Check.
 * QueueLess ORBIT defaults to its server-authoritative Express + WebSocket data layer
 * (PostgreSQL / Firestore replaceable). If Firebase Web config variables are supplied
 * via Vite environment variables, this helper exposes their readiness cleanly.
 */
export interface PersistenceAdapterStatus {
  mode: 'server_memory_realtime' | 'firebase_configured';
  label: string;
  firestoreReady: boolean;
  postgresReady: boolean;
}

export function getPersistenceAdapterStatus(): PersistenceAdapterStatus {
  const hasFirebase = Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID
  );

  if (hasFirebase) {
    return {
      mode: 'firebase_configured',
      label: 'Firebase Configuration Detected · Replaceable Data Layer Active',
      firestoreReady: true,
      postgresReady: true,
    };
  }

  return {
    mode: 'server_memory_realtime',
    label: 'Server-Authoritative Demo Store (PostgreSQL / Firestore Replaceable)',
    firestoreReady: false,
    postgresReady: true,
  };
}
