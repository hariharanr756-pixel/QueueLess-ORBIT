import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { PublicUser, UserRole } from '../shared/types.ts';

export interface StoredAccount extends PublicUser {
  passwordHash: string;
  salt: string;
  createdAt: string;
}

interface RecoveryTokenRecord {
  email: string;
  code: string;
  expiresAt: number;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

const accountsByEmail = new Map<string, StoredAccount>();
const revokedTokens = new Set<string>();
const recoveryTokens = new Map<string, RecoveryTokenRecord>();

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function toPublicUser(acc: StoredAccount): PublicUser {
  return {
    id: acc.id,
    email: acc.email,
    name: acc.name,
    role: acc.role,
    isDemo: acc.isDemo,
    patientId: acc.patientId,
    doctorId: acc.doctorId,
    title: acc.title,
  };
}

function seedDemoAccounts(): void {
  const demoSeed: Array<{
    id: string;
    email: string;
    name: string;
    role: UserRole;
    patientId?: string;
    title: string;
  }> = [
    {
      id: 'demo-admin-01',
      email: 'admin@orbit-demo.health',
      name: 'Dr. Priya Nair',
      role: 'admin',
      title: 'Hospital Operations Director (Demo)',
    },
    {
      id: 'demo-staff-01',
      email: 'staff@orbit-demo.health',
      name: 'Aarav Menon, RN',
      role: 'staff',
      title: 'Front Desk & Queue Coordinator (Demo)',
    },
    {
      id: 'demo-patient-01',
      email: 'patient@orbit-demo.health',
      name: 'Ananya Sharma',
      role: 'patient',
      patientId: 'pat-01',
      title: 'Patient Portal Member (Demo)',
    },
  ];

  // Demo accounts are accessed via explicit instant Demo Mode route (not static hardcoded credentials)
  for (const item of demoSeed) {
    const { hash, salt } = hashPassword(crypto.randomBytes(24).toString('hex'));
    accountsByEmail.set(item.email.toLowerCase(), {
      id: item.id,
      email: item.email.toLowerCase(),
      name: item.name,
      role: item.role,
      isDemo: true,
      patientId: item.patientId,
      title: item.title,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    });
  }
}

seedDemoAccounts();

export function signSessionToken(user: PublicUser): string {
  const payloadObj = {
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token: string): PublicUser | null {
  if (!token || revokedTokens.has(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    if (!parsed.email || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    const account = accountsByEmail.get(parsed.email.toLowerCase());
    if (!account) return null;
    return toPublicUser(account);
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string): void {
  if (token) {
    revokedTokens.add(token);
  }
}

export function getDemoAccountByRole(role: UserRole): StoredAccount | null {
  for (const acc of accountsByEmail.values()) {
    if (acc.isDemo && acc.role === role) {
      return acc;
    }
  }
  return null;
}

export function registerAccount(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  patientId?: string;
}): { user: PublicUser; token: string } | { error: string } {
  const emailNorm = input.email.trim().toLowerCase();
  if (accountsByEmail.has(emailNorm)) {
    return { error: 'An account with this email already exists.' };
  }
  const { hash, salt } = hashPassword(input.password);
  const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
  const account: StoredAccount = {
    id,
    email: emailNorm,
    name: input.name.trim(),
    role: input.role,
    isDemo: false,
    patientId: input.patientId,
    title:
      input.role === 'admin'
        ? 'Hospital Administrator'
        : input.role === 'staff'
        ? 'Hospital Staff Coordinator'
        : 'Registered Patient',
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };
  accountsByEmail.set(emailNorm, account);
  const pub = toPublicUser(account);
  return { user: pub, token: signSessionToken(pub) };
}

export function authenticatePasswordLogin(
  email: string,
  password: string
): { user: PublicUser; token: string } | { error: string } {
  const emailNorm = email.trim().toLowerCase();
  const acc = accountsByEmail.get(emailNorm);
  if (!acc) {
    return { error: 'Invalid email or password.' };
  }
  if (acc.isDemo) {
    return {
      error:
        'Demo accounts use instant Demo Mode sign-in. Click one of the Demo Mode role buttons or register your own account.',
    };
  }
  if (!verifyPassword(password, acc.salt, acc.passwordHash)) {
    return { error: 'Invalid email or password.' };
  }
  const pub = toPublicUser(acc);
  return { user: pub, token: signSessionToken(pub) };
}

export function requestPasswordRecovery(email: string): {
  sent: boolean;
  demoCode?: string;
  message: string;
} {
  const emailNorm = email.trim().toLowerCase();
  const acc = accountsByEmail.get(emailNorm);
  if (!acc || acc.isDemo) {
    return {
      sent: true,
      message:
        'If a registered account matches this email, a 6-digit recovery code has been prepared.',
    };
  }
  const code = String(crypto.randomInt(100000, 999999));
  recoveryTokens.set(emailNorm, {
    email: emailNorm,
    code,
    expiresAt: Date.now() + 1000 * 60 * 15,
  });
  return {
    sent: true,
    demoCode: code,
    message:
      'Recovery code generated (displayed in preview because SMTP email delivery is simulated).',
  };
}

export function completePasswordRecovery(
  email: string,
  code: string,
  newPassword: string
): { ok: boolean; message: string } {
  const emailNorm = email.trim().toLowerCase();
  const record = recoveryTokens.get(emailNorm);
  const acc = accountsByEmail.get(emailNorm);
  if (!record || !acc || acc.isDemo || record.expiresAt < Date.now() || record.code !== code.trim()) {
    return { ok: false, message: 'Invalid or expired recovery code.' };
  }
  const { hash, salt } = hashPassword(newPassword);
  acc.passwordHash = hash;
  acc.salt = salt;
  recoveryTokens.delete(emailNorm);
  return { ok: true, message: 'Password updated successfully. You may now sign in.' };
}

export interface AuthedRequest extends Request {
  user?: PublicUser;
  authToken?: string;
}

export function attachAuthUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const user = verifySessionToken(token);
    if (user) {
      req.user = user;
      req.authToken = token;
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in or launch Demo Mode.' });
    return;
  }
  next();
}

export function requireRole(allowed: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowed.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}
