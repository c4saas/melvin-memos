import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set (32+ hex chars). Generate with: openssl rand -hex 32');
  }
  cachedKey = /^[0-9a-f]+$/i.test(raw) && raw.length >= 64
    ? Buffer.from(raw.slice(0, 64), 'hex')
    : crypto.createHash('sha256').update(raw).digest();
  if (cachedKey.length !== KEY_LEN) throw new Error('Derived key has wrong length');
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (!payload.startsWith(PREFIX)) return payload;
  const buf = Buffer.from(payload.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function isEncrypted(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.startsWith(PREFIX);
}
