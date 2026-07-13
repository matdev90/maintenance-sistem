const { User } = require('../models');
const { generateSecret, verifyTOTP, generateQRCodeDataUri } = require('../utils/totp');
const qrcode = require('qrcode');
const { log } = require('../utils/logger');

exports.setupPage = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    req.flash('error', 'User tidak ditemukan');
    return res.redirect('/dashboard');
  }

  let qrDataUri = null;
  let secret = user.two_factor_secret;

  if (!secret) {
    secret = generateSecret();
    user.two_factor_secret = secret;
    await user.save();
  }

  try {
    const otpauth = generateQRCodeDataUri(secret, user.username, 'SIMRS CareTrack');
    qrDataUri = await qrcode.toDataURL(otpauth);
  } catch (e) {
    console.error('QR gen error:', e.message);
  }

  res.render('admin/2fa-setup', {
    title: 'atur 2FA',
    secret,
    qrDataUri,
    twoFactorEnabled: user.two_factor_enabled
  });
};

exports.enable = async (req, res) => {
  const { token } = req.body;
  const user = await User.findByPk(req.user.id);

  if (!user || !user.two_factor_secret) {
    req.flash('error', 'Setup 2FA belum dilakukan');
    return res.redirect('/admin/2fa');
  }

  if (!verifyTOTP(user.two_factor_secret, token)) {
    req.flash('error', 'Kode OTP tidak valid. Coba lagi.');
    return res.redirect('/admin/2fa');
  }

  user.two_factor_enabled = true;
  await user.save();

  log(req.user, 'enable', '2fa', user.id, null, req);
  req.flash('success', '2FA berhasil diaktifkan!');
  res.redirect('/admin/2fa');
};

exports.disable = async (req, res) => {
  const { token } = req.body;
  const user = await User.findByPk(req.user.id);

  if (!user || !user.two_factor_enabled) {
    req.flash('error', '2FA belum aktif');
    return res.redirect('/admin/2fa');
  }

  if (!verifyTOTP(user.two_factor_secret, token)) {
    req.flash('error', 'Kode OTP tidak valid. Coba lagi.');
    return res.redirect('/admin/2fa');
  }

  user.two_factor_enabled = false;
  await user.save();

  log(req.user, 'disable', '2fa', user.id, null, req);

  req.flash('success', '2FA berhasil dinonaktifkan.');
  res.redirect('/admin/2fa');
};

exports.verifyLogin = async (req, res) => {
  const { token } = req.body;
  const userId = req.session.pending2faUserId;

  if (!userId) {
    return res.redirect('/auth/login');
  }

  const user = await User.findByPk(userId);
  if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
    req.session.pending2faUserId = null;
    return res.redirect('/auth/login');
  }

  if (!verifyTOTP(user.two_factor_secret, token)) {
    req.flash('error', 'Kode OTP tidak valid.');
    return res.redirect('/auth/2fa-verify');
  }

  req.session.pending2faUserId = null;
  req.session.token = 'authenticated';
  req.session.userId = user.id;
  req.session.user = {
    id: user.id,
    username: user.username,
    nama_lengkap: user.nama_lengkap,
    role: user.role,
    foto: user.foto
  };

  res.redirect('/dashboard');
};

exports.verifyPage = (req, res) => {
  if (!req.session.pending2faUserId) {
    return res.redirect('/auth/login');
  }
  res.render('auth/2fa-verify', { title: 'Verifikasi 2FA', layout: false });
};
