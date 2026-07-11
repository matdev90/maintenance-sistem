const crypto = require('crypto');

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function validateCsrf(req, res, next) {
  const token = req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    req.flash('error', 'Sesi tidak valid. Silakan coba lagi.');
    return res.redirect('back');
  }
  next();
}

module.exports = { csrfProtection, validateCsrf, generateCsrfToken };
