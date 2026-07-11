const { Op } = require('sequelize');
const { Unit, DeviceCategory, Setting, SlaTarget, User, TechnicianProfile, Report, Ticket, Layanan } = require('../models');
const fs = require('fs');
const path = require('path');
const { testTelegramConnection } = require('../utils/telegram');
const { log, logSetting, logCategory, logAsset } = require('../utils/logger');

let invalidateCacheFn = null;
function setInvalidateCache(fn) { invalidateCacheFn = fn; }
function invalidateCache() { if (invalidateCacheFn) invalidateCacheFn(); }

exports.settings = async (req, res) => {
  const settings = await Setting.findAll();
  const slaTargets = await SlaTarget.findAll();
  const parsed = {};
  settings.forEach(s => { parsed[s.setting_key] = s.setting_value; });
  parsed.telegram_bot_token = parsed.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '';
  parsed.telegram_chat_id = parsed.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '';
  parsed.telegram_enabled = parsed.telegram_enabled || (process.env.TELEGRAM_ENABLED === 'true' ? 'true' : 'false');
  parsed.telegram_bot_inbound = parsed.telegram_bot_inbound || (process.env.TELEGRAM_BOT_INBOUND === 'true' ? 'true' : 'false');
  parsed.telegram_webhook_url = parsed.telegram_webhook_url || process.env.TELEGRAM_WEBHOOK_URL || '';
  parsed.whatsapp_enabled = parsed.whatsapp_enabled || (process.env.WHATSAPP_ENABLED === 'true' ? 'true' : 'false');
  parsed.whatsapp_api_url = parsed.whatsapp_api_url || process.env.WHATSAPP_API_URL || '';
  parsed.whatsapp_api_key = parsed.whatsapp_api_key || process.env.WHATSAPP_API_KEY || '';
  parsed.whatsapp_phone_number_id = parsed.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  parsed.whatsapp_verify_token = parsed.whatsapp_verify_token || process.env.WHATSAPP_VERIFY_TOKEN || '';

  res.render('admin/settings', {
    title: 'Pengaturan Aplikasi',
    settings: parsed, slaTargets
  });
};

exports.updateSettings = async (req, res) => {
  const { nama_rs, alamat_rs, telepon_rs } = req.body;

  if (!nama_rs || !nama_rs.trim()) {
    req.flash('error', 'Nama Rumah Sakit wajib diisi');
    return res.redirect('/admin/settings');
  }
  if (telepon_rs && telepon_rs.length > 20) {
    req.flash('error', 'Nomor telepon maksimal 20 karakter');
    return res.redirect('/admin/settings');
  }

  await Setting.upsert({ setting_key: 'nama_rs', setting_value: nama_rs.trim() });
  await Setting.upsert({ setting_key: 'alamat_rs', setting_value: (alamat_rs || '').trim() });
  await Setting.upsert({ setting_key: 'telepon_rs', setting_value: (telepon_rs || '').trim() });

  if (req.file) {
    const oldLogo = await Setting.findOne({ where: { setting_key: 'logo_rs' } });
    if (oldLogo && oldLogo.setting_value) {
      const oldPath = path.join(__dirname, '..', 'public', 'uploads', oldLogo.setting_value);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await Setting.upsert({ setting_key: 'logo_rs', setting_value: req.file.filename });
  }

  invalidateCache();
  logSetting(req.user, 'update', { bagian: 'profil_rs', nama_rs, alamat_rs, telepon_rs, logo_changed: !!req.file }, req);
  req.flash('success', 'Profil Rumah Sakit berhasil disimpan');
  res.redirect('/admin/settings');
};

exports.updateTelegram = async (req, res) => {
  const { telegram_bot_token, telegram_chat_id, telegram_enabled, telegram_bot_inbound, telegram_webhook_url } = req.body;

  if (!telegram_bot_token || !telegram_bot_token.trim()) {
    req.flash('error', 'Bot Token wajib diisi');
    return res.redirect('/admin/settings');
  }
  if (!telegram_chat_id || !telegram_chat_id.trim()) {
    req.flash('error', 'Chat ID wajib diisi');
    return res.redirect('/admin/settings');
  }
  if (!/^-?\d+$/.test(telegram_chat_id.trim())) {
    req.flash('error', 'Chat ID harus berupa angka');
    return res.redirect('/admin/settings');
  }

  await Setting.upsert({ setting_key: 'telegram_bot_token', setting_value: telegram_bot_token.trim() });
  await Setting.upsert({ setting_key: 'telegram_chat_id', setting_value: telegram_chat_id.trim() });
  await Setting.upsert({ setting_key: 'telegram_enabled', setting_value: telegram_enabled === 'true' ? 'true' : 'false' });
  await Setting.upsert({ setting_key: 'telegram_bot_inbound', setting_value: telegram_bot_inbound === 'true' ? 'true' : 'false' });
  await Setting.upsert({ setting_key: 'telegram_webhook_url', setting_value: (telegram_webhook_url || '').trim() });

  process.env.TELEGRAM_BOT_TOKEN = telegram_bot_token.trim();
  process.env.TELEGRAM_CHAT_ID = telegram_chat_id.trim();
  process.env.TELEGRAM_ENABLED = telegram_enabled === 'true' ? 'true' : 'false';
  process.env.TELEGRAM_BOT_INBOUND = telegram_bot_inbound === 'true' ? 'true' : 'false';
  process.env.TELEGRAM_WEBHOOK_URL = (telegram_webhook_url || '').trim();

  invalidateCache();
  logSetting(req.user, 'update', { bagian: 'telegram', telegram_enabled, telegram_bot_inbound }, req);
  req.flash('success', 'Pengaturan Telegram berhasil disimpan');
  res.redirect('/admin/settings');
};

exports.testTelegram = async (req, res) => {
  try {
    const result = await testTelegramConnection();
    res.json(result);
  } catch (e) {
    res.json({ ok: false, message: 'Gagal mengirim pesan test' });
  }
};

exports.updateSla = async (req, res) => {
  const { id, batas_validasi_jam, batas_investigasi_jam, batas_selesai_jam } = req.body;

  const validasi = parseInt(batas_validasi_jam);
  const investigasi = parseInt(batas_investigasi_jam);
  const selesai = parseInt(batas_selesai_jam);

  if (isNaN(validasi) || isNaN(investigasi) || isNaN(selesai)) {
    req.flash('error', 'Semua field SLA harus berupa angka');
    return res.redirect('/admin/settings');
  }
  if (validasi <= 0 || investigasi <= 0 || selesai <= 0) {
    req.flash('error', 'Batas waktu SLA harus lebih dari 0 jam');
    return res.redirect('/admin/settings');
  }
  if (validasi > investigasi) {
    req.flash('error', 'Batas validasi harus kurang dari atau sama dengan batas investigasi');
    return res.redirect('/admin/settings');
  }
  if (investigasi > selesai) {
    req.flash('error', 'Batas investigasi harus kurang dari atau sama dengan batas selesai');
    return res.redirect('/admin/settings');
  }

  const sla = await SlaTarget.findByPk(id);
  if (sla) {
    await sla.update({ batas_validasi_jam: validasi, batas_investigasi_jam: investigasi, batas_selesai_jam: selesai });
    logSetting(req.user, 'update', { bagian: 'sla', prioritas: sla.prioritas, validasi, investigasi, selesai }, req);
  }
  req.flash('success', 'Target SLA berhasil diperbarui');
  res.redirect('/admin/settings');
};

exports.updateWhatsApp = async (req, res) => {
  const { whatsapp_enabled, whatsapp_api_url, whatsapp_api_key, whatsapp_phone_number_id, whatsapp_verify_token } = req.body;

  await Setting.upsert({ setting_key: 'whatsapp_enabled', setting_value: whatsapp_enabled === 'true' ? 'true' : 'false' });
  await Setting.upsert({ setting_key: 'whatsapp_api_url', setting_value: (whatsapp_api_url || '').trim() });
  await Setting.upsert({ setting_key: 'whatsapp_api_key', setting_value: (whatsapp_api_key || '').trim() });
  await Setting.upsert({ setting_key: 'whatsapp_phone_number_id', setting_value: (whatsapp_phone_number_id || '').trim() });
  await Setting.upsert({ setting_key: 'whatsapp_verify_token', setting_value: (whatsapp_verify_token || '').trim() });

  process.env.WHATSAPP_ENABLED = whatsapp_enabled === 'true' ? 'true' : 'false';
  process.env.WHATSAPP_API_URL = (whatsapp_api_url || '').trim();
  process.env.WHATSAPP_API_KEY = (whatsapp_api_key || '').trim();
  process.env.WHATSAPP_PHONE_NUMBER_ID = (whatsapp_phone_number_id || '').trim();
  process.env.WHATSAPP_VERIFY_TOKEN = (whatsapp_verify_token || '').trim();

  invalidateCache();
  logSetting(req.user, 'update', { bagian: 'whatsapp', whatsapp_enabled }, req);
  req.flash('success', 'Pengaturan WhatsApp berhasil disimpan');
  res.redirect('/admin/settings');
};

exports.technicians = async (req, res) => {
  const technicians = await User.findAll({
    where: { role: 'teknisi' },
    include: [
      { model: TechnicianProfile, as: 'techProfile' },
      { model: Unit, as: 'unit' }
    ],
    order: [['nama_lengkap', 'ASC']]
  });

  const techData = await Promise.all(technicians.map(async (t) => {
    const activeReports = await Report.count({
      where: { id_teknisi: t.id, status: { [Op.in]: ['divalidasi', 'investigasi', 'dalam_perbaikan'] } }
    });
    const activeTickets = await Ticket.count({
      where: { id_teknisi: t.id, status: { [Op.in]: ['open', 'in_progress', 'reopened'] } }
    });
    return { ...t.toJSON(), activeReports, activeTickets, totalActive: activeReports + activeTickets };
  }));

  res.render('admin/technicians', { title: 'Manajemen Teknisi', technicians: techData });
};

exports.editTechnician = async (req, res) => {
  const technician = await User.findByPk(req.params.id, {
    include: [
      { model: TechnicianProfile, as: 'techProfile' },
      { model: Unit, as: 'unit' }
    ]
  });
  if (!technician) {
    req.flash('error', 'Teknisi tidak ditemukan');
    return res.redirect('/admin/technicians');
  }
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  res.render('admin/technician_form', { title: 'Edit Profil Teknisi', technician, units });
};

exports.updateTechnician = async (req, res) => {
  try {
    const { id } = req.params;
    const { spesialisasi, max_tugas_aktif, telegram_chat_id, whatsapp_number, is_available } = req.body;

    let profile = await TechnicianProfile.findOne({ where: { id_user: id } });
    if (!profile) {
      profile = await TechnicianProfile.create({
        id_user: parseInt(id),
        spesialisasi: (spesialisasi || '').trim(),
        max_tugas_aktif: parseInt(max_tugas_aktif) || 5,
        telegram_chat_id: (telegram_chat_id || '').trim(),
        whatsapp_number: (whatsapp_number || '').trim(),
        is_available: is_available === 'on'
      });
    } else {
      await profile.update({
        spesialisasi: (spesialisasi || '').trim(),
        max_tugas_aktif: parseInt(max_tugas_aktif) || 5,
        telegram_chat_id: (telegram_chat_id || '').trim(),
        whatsapp_number: (whatsapp_number || '').trim(),
        is_available: is_available === 'on'
      });
    }

    log(req.user, 'update', 'technician', id, { spesialisasi, max_tugas_aktif, is_available: is_available === 'on' }, req);
    req.flash('success', 'Profil teknisi berhasil diperbarui');
    res.redirect('/admin/technicians');
  } catch (err) {
    console.error('Update technician error:', err.message);
    req.flash('error', 'Gagal memperbarui profil teknisi');
    res.redirect('/admin/technicians');
  }
};

exports.units = async (req, res) => {
  const { page, q } = req.query;
  const limit = 15;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (q) where.nama_unit = { [Op.like]: '%' + q + '%' };

  const { count, rows: units } = await Unit.findAndCountAll({
    where,
    order: [['nama_unit', 'ASC']],
    limit, offset
  });
  res.render('admin/units', {
    title: 'Manajemen Unit', units,
    filters: { q },
    pagination: { total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page) || 1, limit }
  });
};

exports.createUnit = async (req, res) => {
  res.render('admin/unit_form', { title: 'Tambah Unit', unit: null });
};

exports.editUnit = async (req, res) => {
  const unit = await Unit.findByPk(req.params.id);
  if (!unit) { req.flash('error', 'Unit tidak ditemukan'); return res.redirect('/admin/units'); }
  res.render('admin/unit_form', { title: 'Edit Unit', unit });
};

exports.storeUnit = async (req, res) => {
  const { nama_unit } = req.body;
  if (!nama_unit || !nama_unit.trim()) {
    req.flash('error', 'Nama unit wajib diisi');
    return res.redirect('/admin/units/create');
  }
  await Unit.create({ nama_unit: nama_unit.trim() });
  log(req.user, 'create', 'unit', null, { nama_unit }, req);
  req.flash('success', 'Unit berhasil ditambahkan');
  res.redirect('/admin/units');
};

exports.updateUnit = async (req, res) => {
  const { nama_unit } = req.body;
  if (!nama_unit || !nama_unit.trim()) {
    req.flash('error', 'Nama unit wajib diisi');
    return res.redirect('/admin/units');
  }
  const unit = await Unit.findByPk(req.params.id);
  if (unit) {
    const nama_lama = unit.nama_unit;
    await unit.update({ nama_unit: nama_unit.trim() });
    log(req.user, 'update', 'unit', unit.id, { nama_lama, nama_baru: nama_unit.trim() }, req);
    req.flash('success', 'Unit berhasil diperbarui');
  }
  res.redirect('/admin/units');
};

exports.destroyUnit = async (req, res) => {
  try {
    const unit = await Unit.findByPk(req.params.id);
    if (unit) {
      log(req.user, 'delete', 'unit', unit.id, { nama_unit: unit.nama_unit }, req);
      await unit.destroy();
    }
    req.flash('success', 'Unit berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Tidak dapat menghapus unit: data ini masih digunakan oleh laporan lain');
  }
  res.redirect('/admin/units');
};

exports.categories = async (req, res) => {
  const { page, q } = req.query;
  const limit = 15;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (q) where.nama_kategori = { [Op.like]: '%' + q + '%' };

  const { count, rows: categories } = await DeviceCategory.findAndCountAll({
    where,
    include: [{ model: Layanan, as: 'layanan' }],
    order: [['nama_kategori', 'ASC']],
    limit, offset
  });
  res.render('admin/categories', {
    title: 'Kategori Perangkat', categories,
    filters: { q },
    pagination: { total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page) || 1, limit }
  });
};

exports.createCategory = async (req, res) => {
  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });
  res.render('admin/category_form', { title: 'Tambah Kategori', category: null, layanans });
};

exports.editCategory = async (req, res) => {
  const cat = await DeviceCategory.findByPk(req.params.id);
  if (!cat) { req.flash('error', 'Kategori tidak ditemukan'); return res.redirect('/admin/categories'); }
  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });
  res.render('admin/category_form', { title: 'Edit Kategori', category: cat, layanans });
};

exports.storeCategory = async (req, res) => {
  const { nama_kategori, id_layanan } = req.body;
  if (!nama_kategori || !nama_kategori.trim()) {
    req.flash('error', 'Nama kategori wajib diisi');
    return res.redirect('/admin/categories/create');
  }
  const newCat = await DeviceCategory.create({ nama_kategori: nama_kategori.trim(), id_layanan: id_layanan || null });
  logCategory(req.user, 'create', newCat.id, { nama_kategori, id_layanan }, req);
  req.flash('success', 'Kategori berhasil ditambahkan');
  res.redirect('/admin/categories');
};

exports.updateCategory = async (req, res) => {
  const { nama_kategori, id_layanan } = req.body;
  if (!nama_kategori || !nama_kategori.trim()) {
    req.flash('error', 'Nama kategori wajib diisi');
    return res.redirect('/admin/categories');
  }
  const cat = await DeviceCategory.findByPk(req.params.id);
  if (cat) {
    const nama_lama = cat.nama_kategori;
    await cat.update({ nama_kategori: nama_kategori.trim(), id_layanan: id_layanan || null });
    logCategory(req.user, 'update', cat.id, { nama_lama, nama_baru: nama_kategori.trim(), id_layanan }, req);
    req.flash('success', 'Kategori berhasil diperbarui');
  }
  res.redirect('/admin/categories');
};

exports.bantuan = async (req, res) => {
  res.render('admin/bantuan', { title: 'Panduan Penggunaan Aplikasi' });
};

exports.destroyCategory = async (req, res) => {
  try {
    const cat = await DeviceCategory.findByPk(req.params.id);
    if (cat) {
      logCategory(req.user, 'delete', cat.id, { nama_kategori: cat.nama_kategori }, req);
      await cat.destroy();
    }
    req.flash('success', 'Kategori berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Tidak dapat menghapus kategori: data ini masih digunakan oleh laporan lain');
  }
  res.redirect('/admin/categories');
};

exports.setInvalidateCache = setInvalidateCache;
