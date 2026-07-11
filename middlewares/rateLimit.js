const loginAttempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function rateLimiter(req, res, next) {
  const key = req.ip + ':' + (req.path || '');
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now - record.start > WINDOW_MS) {
    loginAttempts.set(key, { start: now, count: 1 });
    return next();
  }

  record.count++;
  if (record.count > MAX_ATTEMPTS) {
    const waitMin = Math.ceil((WINDOW_MS - (now - record.start)) / 60000);
    req.flash('error', `Terlalu banyak percobaan. Coba lagi dalam ${waitMin} menit.`);
    return res.redirect('/auth/login');
  }

  next();
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (now - record.start > WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}

setInterval(cleanupRateLimits, 60000);

module.exports = { rateLimiter };
