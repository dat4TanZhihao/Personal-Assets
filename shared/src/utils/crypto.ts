import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { ApiError } from '../errors';

const ALGORITHM = 'aes-256-gcm';

export function encryptSecret(plainText: string, keyMaterial: string): string {
  const key = normalizeKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string, keyMaterial: string): string {
  const key = normalizeKey(keyMaterial);
  const [ivRaw, tagRaw, encryptedRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new ApiError('INVALID_SECRET_PAYLOAD', 'Encrypted secret payload is malformed', { status: 400 });
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '****';
  }
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

function normalizeKey(keyMaterial: string): Buffer {
  if (!keyMaterial) {
    throw new ApiError('MISSING_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY is required for token encryption', { status: 500 });
  }
  const raw = Buffer.from(keyMaterial, isLikelyBase64(keyMaterial) ? 'base64' : 'utf8');
  if (raw.length === 32) {
    return raw;
  }
  return createHash('sha256').update(raw).digest();
}

function isLikelyBase64(value: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0;
}
