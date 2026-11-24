import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseSyncResult } from '../shared/types.ts';

export interface SupabaseAppointmentPayload {
  id: string;
  tokenNumber: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  departmentId: string;
  departmentName: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string;
  timeSlot: string;
  notes: string;
  status: string;
  predictedWaitMin: number;
  predictedWaitMax: number;
  createdAt: string;
}

const VALID_PROJECT_ID_RE = /^[a-z0-9-]+$/i;

function resolveSupabaseUrl(): string | null {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')) {
        return parsed.origin;
      }
    } catch {
      return null;
    }
    return null;
  }

  const projectId = process.env.SUPABASE_PROJECT_ID?.trim();
  if (projectId && VALID_PROJECT_ID_RE.test(projectId)) {
    return `https://${projectId}.supabase.co`;
  }

  return null;
}

function resolveSupabaseKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    '';
  return key.length > 0 ? key : null;
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature: string | null = null;

function getSupabaseClient(): { client: SupabaseClient; projectHost: string } | null {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseKey();
  if (!url || !key) {
    return null;
  }

  const signature = `${url}:${key.slice(0, 12)}:${key.length}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedSignature = signature;
  }

  return {
    client: cachedClient,
    projectHost: new URL(url).hostname,
  };
}

export function getSupabaseConfigStatus(): { configured: boolean; projectHost: string | null } {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseKey();
  if (!url || !key) {
    return { configured: false, projectHost: null };
  }
  return {
    configured: true,
    projectHost: new URL(url).hostname,
  };
}

export async function saveAppointmentToSupabase(
  payload: SupabaseAppointmentPayload
): Promise<SupabaseSyncResult> {
  const conn = getSupabaseClient();
  if (!conn) {
    return {
      synced: false,
      status: 'not_configured',
      message:
        'Supabase environment variables (SUPABASE_URL or SUPABASE_PROJECT_ID, and SUPABASE_PUBLISHABLE_KEY) are not configured on the server yet.',
    };
  }

  try {
    const { error } = await conn.client.from('appointments').insert({
      id: payload.id,
      token_number: payload.tokenNumber,
      patient_name: payload.patientName,
      patient_email: payload.patientEmail?.trim() || null,
      patient_phone: payload.patientPhone?.trim() || null,
      department_id: payload.departmentId,
      department_name: payload.departmentName,
      doctor_id: payload.doctorId,
      doctor_name: payload.doctorName,
      appointment_date: payload.appointmentDate,
      time_slot: payload.timeSlot,
      notes: payload.notes,
      status: payload.status,
      predicted_wait_min: payload.predictedWaitMin,
      predicted_wait_max: payload.predictedWaitMax,
      created_at: payload.createdAt,
    });

    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        return {
          synced: false,
          status: 'table_missing',
          message:
            'Supabase table "public.appointments" was not found. Create it in your Supabase SQL Editor to receive bookings.',
        };
      }

      return {
        synced: false,
        status: 'error',
        message: error.message || 'Failed to save appointment to Supabase.',
      };
    }

    return {
      synced: true,
      status: 'saved',
      message: `Saved to Supabase (${conn.projectHost}).`,
      rowId: payload.id,
    };
  } catch (err) {
    return {
      synced: false,
      status: 'error',
      message: err instanceof Error ? err.message : 'Unexpected Supabase connection error.',
    };
  }
}
