import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Time-based one-time passwords (RFC 6238, 6 digits, 30-second steps, SHA-1), compatible with
// Google Authenticator, Authy, 1Password and similar apps. No external dependency.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export const generateSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret, timeStep = Math.floor(Date.now() / 1000 / 30)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Accepts the current step and one step either side (clock drift). */
export function verifyTotp(secret, code) {
  const given = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  const now = Math.floor(Date.now() / 1000 / 30);
  for (const step of [now - 1, now, now + 1]) {
    const expected = totpCode(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true;
  }
  return false;
}

/** The otpauth:// URI an authenticator app understands (shown as text and as a QR by the console). */
export const otpauthUri = (secret, account, issuer = 'Bizora Platform') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
