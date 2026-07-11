const { User, Unit } = require('../models');
const { hashPassword, comparePassword } = require('../middlewares/auth');
const { logLogin, logLogout, logLoginFailed } = require('../utils/logger');

exports.loginPage = (req, res) => {
  if (req.session.token) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Login', layout: false });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    req.flash('error', 'Username dan password wajib diisi');
    return res.redirect('/auth/login');
  }

  const user = await User.findOne({
    where: { username },
    include: [{ model: Unit, as: 'unit' }]
  });

  if (!user || !comparePassword(password, user.password_hash)) {
    logLoginFailed(username, req);
    req.flash('error', 'Username atau password salah');
    return res.redirect('/auth/login');
  }

  if (user.two_factor_enabled && user.two_factor_secret) {
    req.session.pending2faUserId = user.id;
    return res.redirect('/auth/2fa-verify');
  }

  req.session.token = 'authenticated';
  req.session.userId = user.id;
  req.session.user = {
    id: user.id,
    username: user.username,
    nama_lengkap: user.nama_lengkap,
    role: user.role,
    foto: user.foto,
    id_unit: user.id_unit || null,
    unit: user.unit ? user.unit.nama_unit : null
  };

  logLogin(user, req);
  res.redirect('/dashboard');
};

exports.logout = (req, res) => {
  logLogout(req.user, req);
  req.session.destroy();
  res.redirect('/auth/login');
};
