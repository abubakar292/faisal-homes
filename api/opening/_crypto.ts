import crypto from 'node:crypto';

export interface OpeningSecurityRecord {
  saltB64: string;
  hashB64: string;
  iterations: number;
  failedAttempts: number;
  lockedUntil: number | null;
  lockCount: number;
  updatedAt: string;
}

export interface TokenPayload {
  exp: number;
  nonce: string;
}

const DEFAULT_ITERATIONS = 210000;
const SALT_BYTES = 16;
const TOKEN_VALIDITY_MS = 12 * 60 * 60 * 1000; // 12 hours
const BASE_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_BYTES);
}

export function hashPin(pin: string, salt: Buffer, iterations = DEFAULT_ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(pin, salt, iterations, 32, 'sha256');
}

export function verifyPinHash(
  pin: string,
  saltB64: string,
  hashB64: string,
  iterations = DEFAULT_ITERATIONS
): boolean {
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expectedHash = Buffer.from(hashB64, 'base64');
    const actualHash = hashPin(pin, salt, iterations);
    if (actualHash.length !== expectedHash.length) {
      return false;
    }
    return crypto.timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

export function createRecord(pin: string): OpeningSecurityRecord {
  const salt = generateSalt();
  const hash = hashPin(pin, salt, DEFAULT_ITERATIONS);
  return {
    saltB64: salt.toString('base64'),
    hashB64: hash.toString('base64'),
    iterations: DEFAULT_ITERATIONS,
    failedAttempts: 0,
    lockedUntil: null,
    lockCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function getSecretKey(): string {
  const secret = process.env.OPENING_TOKEN_SECRET;
  if (secret && secret.trim().length >= 16) {
    return secret.trim();
  }
  return 'default-dev-opening-token-secret-faisal-homes-secure-32chars';
}

export function createToken(): { token: string; exp: number } {
  const exp = Date.now() + TOKEN_VALIDITY_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: TokenPayload = { exp, nonce };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = getSecretKey();
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const token = `${payloadB64}.${signature}`;

  return { token, exp };
}

export function verifyToken(token: unknown): { valid: boolean; exp?: number } {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false };
  }

  const [payloadB64, signature] = parts;
  const secret = getSecretKey();
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload: TokenPayload = JSON.parse(payloadJson);

    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return { valid: false };
    }

    return { valid: true, exp: payload.exp };
  } catch {
    return { valid: false };
  }
}

export function calculateLockout(lockRound: number): number {
  const multiplier = Math.pow(2, Math.max(0, lockRound - 1));
  const ms = BASE_LOCKOUT_MS * multiplier;
  return Math.min(ms, MAX_LOCKOUT_MS);
}
