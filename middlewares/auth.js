const bcrypt = require('bcryptjs');
const { User } = require('../models');

const SALT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

async function authenticate(req, res, next) {
  if (!req.session.token) return res.redirect('/auth/login');

  const user = await User.findByPk(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.redirect('/auth/login');
  }

  req.user = user;
  next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/auth/login');
    if (!roles.includes(req.user.role)) {
      req.flash('error', 'Anda tidak memiliki akses ke halaman ini');
      return res.redirect('/dashboard');
    }
    next();
  };
}

module.exports = { hashPassword, comparePassword, authenticate, authorize };
