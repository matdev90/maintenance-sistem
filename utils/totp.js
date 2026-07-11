const crypto = require('crypto');

const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = 'sha1';

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substr(i, 5).padEnd(5, '0');
    result += alphabet[parseInt(chunk, 2)];
  }
  return result;
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of encoded.toUpperCase()) {
    const val = alphabet.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret, time) {
  const epoch = Math.floor((time || Date.now() / 1000) / PERIOD);
  const epochBuffer = Buffer.alloc(8);
  epochBuffer.writeUInt32BE(0, 0);
  epochBuffer.writeUInt32BE(epoch, 4);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac(ALGORITHM, key).update(epochBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % Math.pow(10, DIGITS)).padStart(DIGITS, '0');
}

function verifyTOTP(secret, token, window) {
  window = window || 1;
  const now = Date.now() / 1000;
  for (let i = -window; i <= window; i++) {
    if (generateTOTP(secret, now + i * PERIOD) === token) {
      return true;
    }
  }
  return false;
}

function generateQRCodeDataUri(secret, username, issuer) {
  const otpauth = `otpauth://totp/${encodeURIComponent(issuer || 'SIMRS CareTrack')}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer || 'SIMRS CareTrack')}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
  return otpauth;
}

module.exports = { generateSecret, generateTOTP, verifyTOTP, generateQRCodeDataUri };
