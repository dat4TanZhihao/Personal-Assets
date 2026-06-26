import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { ApiError } from '../../shared/src/errors';

const sessionCookieName = 'pat_session';
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export const ownerUserId = 'owner';

export type Session = {
  userId: string;
  expiresAt: number;
};

export async function verifyOwnerPassword(password: string): Promise<boolean> {
  const hash = process.env.OWNER_PASSWORD_HASH;
  if (hash) {
    return verifyScryptPassword(password, hash);
  }

  const plain = process.env.OWNER_PASSWORD;
  if (!plain) {
    throw new ApiError('AUTH_NOT_CONFIGURED', 'Owner password is not configured', { status: 500 });
  }
  return timingSafeStringEqual(password, plain);
}

export function createSessionCookie(userId = ownerUserId): string {
  const expiresAt = Date.now() + sessionTtlMs;
  const payload = base64urlEncode(JSON.stringify({ userId, expiresAt } satisfies Session));
  const signature = sign(payload);
  return serializeCookie(sessionCookieName, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureSessionCookie(),
    path: '/',
    maxAge: Math.floor(sessionTtlMs / 1000)
  });
}

export function clearSessionCookie(): string {
  return serializeCookie(sessionCookieName, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureSessionCookie(),
    path: '/',
    maxAge: 0
  });
}

export function readSessionFromRequest(request: Request): Session | undefined {
  const rawCookie = request.headers.get('cookie') ?? '';
  const token = parseCookies(rawCookie)[sessionCookieName];
  if (!token) {
    return undefined;
  }
  return verifySessionToken(token);
}

export function requireSession(request: Request): Session {
  const session = readSessionFromRequest(request);
  if (!session) {
    throw new ApiError('UNAUTHENTICATED', 'Login is required', { status: 401 });
  }
  return session;
}

export function verifySessionToken(token: string): Session | undefined {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !timingSafeStringEqual(signature, sign(payload))) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(base64urlDecode(payload)) as Partial<Session>;
    if (parsed.userId !== ownerUserId || typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) {
      return undefined;
    }
    return { userId: parsed.userId, expiresAt: parsed.expiresAt };
  } catch {
    return undefined;
  }
}

async function verifyScryptPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  let salt: string;
  let expectedHex: string;
  let cost = 16384;
  let blockSize = 8;
  let parallelization = 1;

  if (parts.length === 3 && parts[0] === 'scrypt') {
    [, salt, expectedHex] = parts;
  } else if (parts.length === 6 && parts[0] === 'scrypt') {
    cost = Number(parts[1]);
    blockSize = Number(parts[2]);
    parallelization = Number(parts[3]);
    salt = parts[4];
    expectedHex = parts[5];
  } else if (encoded.startsWith('scrypt:')) {
    const legacy = encoded.split(':');
    salt = legacy[1];
    expectedHex = legacy[2];
  } else {
    throw new ApiError('INVALID_PASSWORD_HASH', 'Owner password hash format is invalid', { status: 500 });
  }

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length, { N: cost, r: blockSize, p: parallelization }) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function scrypt(password: string, salt: string, keyLength: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new ApiError('SESSION_NOT_CONFIGURED', 'Session secret is not configured', { status: 500 });
  }
  return 'dev-session-secret';
}

function secureSessionCookie(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === 'true') {
    return true;
  }
  if (process.env.SESSION_COOKIE_SECURE === 'false') {
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(header.split(';').map((part) => {
    const [name, ...rest] = part.trim().split('=');
    return [name, decodeURIComponent(rest.join('='))];
  }).filter(([name]) => name));
}

function serializeCookie(name: string, value: string, options: {
  httpOnly: boolean;
  sameSite: 'Lax';
  secure: boolean;
  path: string;
  maxAge: number;
}): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`
  ];
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, Buffer.concat([right, randomBytes(Math.max(0, left.length - right.length))]).subarray(0, left.length));
    return false;
  }
  return timingSafeEqual(left, right);
}

function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}
