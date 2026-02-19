import * as crypto from 'crypto';

import { logger } from '../lib/logger';

const log = logger.child({ module: 'secretStorage' });
const SECRET_PREFIX = 'enc:v1:';
const MAX_CACHE_ENTRIES = 256;

const decryptedCache = new Map<string, string>();

let cachedKey: Buffer | null = null;

function getSecretKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const raw =
    process.env.GLOBAL_INTEGRATIONS_SECRET_KEY ||
    process.env.INTEGRATION_SECRET_KEY ||
    process.env.JWT_SECRET ||
    '';
  if (!raw.trim()) {
    log.warn('No encryption secret configured! Set GLOBAL_INTEGRATIONS_SECRET_KEY or JWT_SECRET env var.');
  }
  const normalized = raw.trim().length > 0 ? raw.trim() : 'change-me-' + crypto.randomBytes(16).toString('hex');
  cachedKey = crypto.createHash('sha256').update(normalized).digest();
  return cachedKey;
}

function addToCache(encrypted: string, decrypted: string): void {
  if (!encrypted || !decrypted) {
    return;
  }
  if (decryptedCache.has(encrypted)) {
    decryptedCache.set(encrypted, decrypted);
    return;
  }
  if (decryptedCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = decryptedCache.keys().next().value;
    if (oldestKey) {
      decryptedCache.delete(oldestKey);
    }
  }
  decryptedCache.set(encrypted, decrypted);
}

function decodePayload(encrypted: string): { iv: Buffer; authTag: Buffer; ciphertext: Buffer } {
  const payload = encrypted.slice(SECRET_PREFIX.length);
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  return { iv, authTag, ciphertext };
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SECRET_PREFIX);
}

export function encryptSecret(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return '';
  }
  if (isEncryptedSecret(normalized)) {
    return normalized;
  }
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  const encoded = `${SECRET_PREFIX}${payload}`;
  addToCache(encoded, normalized);
  return encoded;
}

export function decryptSecret(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return '';
  }
  if (!isEncryptedSecret(normalized)) {
    return normalized;
  }
  const cached = decryptedCache.get(normalized);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const { iv, authTag, ciphertext } = decodePayload(normalized);
    const key = getSecretKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    addToCache(normalized, decrypted);
    return decrypted;
  } catch (error) {
    log.error({ err: error }, '[secretStorage] Failed to decrypt secret');
    return '';
  }
}

export function clearSecretCache(): void {
  decryptedCache.clear();
}

