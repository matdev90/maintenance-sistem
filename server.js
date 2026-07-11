require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.APP_PORT || 3000;

// Cache for settings
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60000;

async function getSettings() {
  const now = Date.now();
  if (settingsCache && (now - settingsCacheTime) < CACHE_TTL) {
    return settingsCache;
  }
  try {
    const { Setting } = require('./models');
    const allSettings = await Setting.findAll();
    const s = {};
    allSettings.forEach(x => { s[x.setting_key] = x.setting_value; });
    settingsCache = s;
    settingsCacheTime = now;
    return s;
  } catch (e) {
    return { logo_rs: '', nama_rs: 'SIMRS Maintenance' };
  }
}

function invalidateSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

module.exports = { getSettings, invalidateSettingsCache };

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'simrs-secret-' + require('crypto').randomBytes(16).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// CSRF
const { csrfProtection } = require('./middlewares/csrf');
app.use(csrfProtection);

// Flash
app.use(flash());

// Make flash, user & settings available to all views
app.use(async (req, res, next) => {
  // No cache for authenticated pages
  if (req.session && req.session.userId) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.user = req.session.user || null;
  res.locals.version = '1.0.0';
  try {
    res.locals.settings = await getSettings();
  } catch (e) {
    res.locals.settings = { logo_rs: '', nama_rs: 'SIMRS Maintenance' };
  }
  next();
});

// EJS
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/reports', require('./routes/reports'));
app.use('/admin', require('./routes/admin'));
app.use('/export', require('./routes/export'));
app.use('/notifications', require('./routes/notifications'));
app.use('/tickets', require('./routes/tickets'));
app.use('/ratings', require('./routes/ratings'));
app.use('/admin/assets', require('./routes/assets'));
app.use('/admin/shifts', require('./routes/shifts'));
app.use('/admin/pm', require('./routes/pm'));
app.use('/admin/layanan', require('./routes/layanan'));
app.use('/display', require('./routes/display'));
app.use('/', require('./routes/twoFactor'));
app.use('/', require('./routes/webhooks'));

app.get('/offline', (req, res) => {
  res.render('offline', { title: 'Laporan Offline', layout: false });
});

// Wire up cache invalidation to admin controller (breaks circular dependency)
const adminCtrl = require('./controllers/adminController');
if (adminCtrl.setInvalidateCache) adminCtrl.setInvalidateCache(invalidateSettingsCache);

app.get('/', (req, res) => {
  if (req.session.token) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

// Sync DB & seed
const { sequelize, Setting, Unit, DeviceCategory, SlaTarget, User, TechnicianProfile, Layanan } = require('./models');
const { QueryTypes } = require('sequelize');
const { hashPassword } = require('./middlewares/auth');

async function initDb() {
  try {
    await sequelize.sync({ force: false });
    console.log('Database synced');

    // Ensure new columns exist (for existing databases)
    const tableInfo = await sequelize.query("PRAGMA table_info(tickets)", { type: QueryTypes.SELECT });
    const ticketCols = tableInfo.map(c => c.name);
    if (!ticketCols.includes('id_kategori')) {
      await sequelize.query("ALTER TABLE tickets ADD COLUMN id_kategori INTEGER REFERENCES device_categories(id)");
      console.log('Added id_kategori column to tickets');
    }

    const catTableInfo = await sequelize.query("PRAGMA table_info(device_categories)", { type: QueryTypes.SELECT });
    const catCols = catTableInfo.map(c => c.name);
    if (!catCols.includes('id_layanan')) {
      await sequelize.query("ALTER TABLE device_categories ADD COLUMN id_layanan INTEGER REFERENCES layanans(id)");
      console.log('Added id_layanan column to device_categories');
    }

    const shiftTableInfo = await sequelize.query("PRAGMA table_info(shift_schedules)", { type: QueryTypes.SELECT });
    const shiftCols = shiftTableInfo.map(c => c.name);
    if (!shiftCols.includes('id_layanan')) {
      await sequelize.query("ALTER TABLE shift_schedules ADD COLUMN id_layanan INTEGER REFERENCES layanans(id)");
      console.log('Added id_layanan column to shift_schedules');
    }

    const unitCount = await Unit.count();
    if (unitCount === 0) {
      await Unit.bulkCreate([
        { nama_unit: 'IGD' }, { nama_unit: 'Rawat Inap' }, { nama_unit: 'Poliklinik' },
        { nama_unit: 'Farmasi' }, { nama_unit: 'Radiologi' }, { nama_unit: 'Laboratorium' },
        { nama_unit: 'OK' }, { nama_unit: 'ICU' }, { nama_unit: 'NICU' }, { nama_unit: 'Administrasi' }
      ]);
      console.log('Units seeded');
    }

    const layananCount = await Layanan.count();
    if (layananCount === 0) {
      await Layanan.bulkCreate([
        { nama_layanan: 'SIMRS', kode: 'simrs', deskripsi: 'Sistem Informasi Manajemen Rumah Sakit — menangani hardware, software, jaringan, TV kabel' },
        { nama_layanan: 'IPSRS', kode: 'ipsrs', deskripsi: 'Instalasi Pemeliharaan Sarana Rumah Sakit — menangani alat kesehatan, listrik, properti, kerusakan lainnya' }
      ]);
      console.log('Layanan seeded');
    }

    const catCount = await DeviceCategory.count();
    if (catCount === 0) {
      const simrs = await Layanan.findOne({ where: { kode: 'simrs' } });
      const ipsrs = await Layanan.findOne({ where: { kode: 'ipsrs' } });
      await DeviceCategory.bulkCreate([
        { nama_kategori: 'Hardware', id_layanan: simrs.id },
        { nama_kategori: 'Software', id_layanan: simrs.id },
        { nama_kategori: 'Jaringan', id_layanan: simrs.id },
        { nama_kategori: 'TV Kabel', id_layanan: simrs.id },
        { nama_kategori: 'Alat Kesehatan', id_layanan: ipsrs.id },
        { nama_kategori: 'Listrik', id_layanan: ipsrs.id },
        { nama_kategori: 'Properti', id_layanan: ipsrs.id },
        { nama_kategori: 'Lainnya', id_layanan: ipsrs.id }
      ]);
      console.log('Categories seeded');
    } else {
      // Ensure layanan categories exist for existing databases
      const simrs = await Layanan.findOne({ where: { kode: 'simrs' } });
      const ipsrs = await Layanan.findOne({ where: { kode: 'ipsrs' } });
      if (simrs && ipsrs) {
        const simrsCats = ['Hardware', 'Software', 'Jaringan', 'TV Kabel'];
        const ipsrsCats = ['Alat Kesehatan', 'Listrik', 'Properti', 'Lainnya'];
        for (const nama of simrsCats) {
          const exists = await DeviceCategory.findOne({ where: { nama_kategori: nama, id_layanan: simrs.id } });
          if (!exists) await DeviceCategory.create({ nama_kategori: nama, id_layanan: simrs.id });
        }
        for (const nama of ipsrsCats) {
          const exists = await DeviceCategory.findOne({ where: { nama_kategori: nama, id_layanan: ipsrs.id } });
          if (!exists) await DeviceCategory.create({ nama_kategori: nama, id_layanan: ipsrs.id });
        }
        console.log('Layanan categories ensured');
      }
    }

    // Migrate existing tickets: ENUM kategori -> id_kategori FK
    const unmappedTickets = await sequelize.query(
      "SELECT id, kategori FROM tickets WHERE id_kategori IS NULL AND kategori IS NOT NULL",
      { type: QueryTypes.SELECT }
    );
    if (unmappedTickets.length > 0) {
      const simrs = await Layanan.findOne({ where: { kode: 'simrs' } });
      for (const t of unmappedTickets) {
        const kategoriMap = {
          'hardware': 'Hardware', 'software': 'Software',
          'jaringan': 'Jaringan', 'akun': 'Lainnya', 'lainnya': 'Lainnya'
        };
        const nama = kategoriMap[t.kategori] || 'Lainnya';
        const cat = await DeviceCategory.findOne({ where: { nama_kategori: nama, id_layanan: simrs.id } });
        if (cat) {
          await sequelize.query("UPDATE tickets SET id_kategori = ? WHERE id = ?", {
            replacements: [cat.id, t.id]
          });
        }
      }
      console.log('Ticket categories migrated to FK');
    }

    const slaCount = await SlaTarget.count();
    if (slaCount === 0) {
      await SlaTarget.bulkCreate([
        { prioritas: 'ringan', batas_validasi_jam: 48, batas_investigasi_jam: 72, batas_selesai_jam: 120 },
        { prioritas: 'sedang', batas_validasi_jam: 24, batas_investigasi_jam: 48, batas_selesai_jam: 72 },
        { prioritas: 'berat', batas_validasi_jam: 8, batas_investigasi_jam: 24, batas_selesai_jam: 48 },
        { prioritas: 'kritis', batas_validasi_jam: 2, batas_investigasi_jam: 4, batas_selesai_jam: 24 }
      ]);
      console.log('SLA targets seeded');
    }

    const settingsCount = await Setting.count();
    if (settingsCount === 0) {
      await Setting.bulkCreate([
        { setting_key: 'nama_rs', setting_value: 'RSUD Contoh' },
        { setting_key: 'alamat_rs', setting_value: 'Jl. Kesehatan No. 1' },
        { setting_key: 'telepon_rs', setting_value: '(021) 12345678' },
        { setting_key: 'logo_rs', setting_value: '' },
        { setting_key: 'telegram_bot_token', setting_value: '' },
        { setting_key: 'telegram_chat_id', setting_value: '' },
        { setting_key: 'telegram_enabled', setting_value: 'false' },
        { setting_key: 'telegram_bot_inbound', setting_value: 'false' },
        { setting_key: 'telegram_webhook_url', setting_value: '' },
        { setting_key: 'whatsapp_enabled', setting_value: 'false' },
        { setting_key: 'whatsapp_api_url', setting_value: '' },
        { setting_key: 'whatsapp_api_key', setting_value: '' },
        { setting_key: 'whatsapp_phone_number_id', setting_value: '' },
        { setting_key: 'whatsapp_verify_token', setting_value: '' }
      ]);
      console.log('Settings seeded');
    }

    const userCount = await User.count();
    if (userCount === 0) {
      const adminUser = await User.create({
        username: 'admin',
        password_hash: hashPassword('admin123'),
        nama_lengkap: 'Administrator',
        role: 'admin'
      });
      const teknisiUser = await User.create({
        username: 'teknisi1',
        password_hash: hashPassword('teknisi123'),
        nama_lengkap: 'Teknisi Satu',
        role: 'teknisi'
      });
      await User.create({
        username: 'pelapor1',
        password_hash: hashPassword('pelapor123'),
        nama_lengkap: 'Pelapor Unit IGD',
        role: 'pelapor',
        id_unit: 1
      });

      await TechnicianProfile.create({
        id_user: teknisiUser.id,
        spesialisasi: 'komputer,printer,jaringan',
        max_tugas_aktif: 5,
        is_available: true
      });

      console.log('Users & technician profiles seeded');
    }
  } catch (err) {
    console.error('DB init error:', err.message);
  }
  // Load telegram settings from DB into process.env
  const tgToken = await Setting.findOne({ where: { setting_key: 'telegram_bot_token' } });
  const tgChatId = await Setting.findOne({ where: { setting_key: 'telegram_chat_id' } });
  const tgEnabled = await Setting.findOne({ where: { setting_key: 'telegram_enabled' } });
  const tgInbound = await Setting.findOne({ where: { setting_key: 'telegram_bot_inbound' } });
  const tgWebhook = await Setting.findOne({ where: { setting_key: 'telegram_webhook_url' } });
  if (tgToken) process.env.TELEGRAM_BOT_TOKEN = tgToken.setting_value;
  if (tgChatId) process.env.TELEGRAM_CHAT_ID = tgChatId.setting_value;
  if (tgEnabled) process.env.TELEGRAM_ENABLED = tgEnabled.setting_value;
  if (tgInbound) process.env.TELEGRAM_BOT_INBOUND = tgInbound.setting_value;
  if (tgWebhook) process.env.TELEGRAM_WEBHOOK_URL = tgWebhook.setting_value;

  // Load WhatsApp settings
  const waEnabled = await Setting.findOne({ where: { setting_key: 'whatsapp_enabled' } });
  const waApiUrl = await Setting.findOne({ where: { setting_key: 'whatsapp_api_url' } });
  const waApiKey = await Setting.findOne({ where: { setting_key: 'whatsapp_api_key' } });
  const waPhoneId = await Setting.findOne({ where: { setting_key: 'whatsapp_phone_number_id' } });
  const waVerify = await Setting.findOne({ where: { setting_key: 'whatsapp_verify_token' } });
  if (waEnabled) process.env.WHATSAPP_ENABLED = waEnabled.setting_value;
  if (waApiUrl) process.env.WHATSAPP_API_URL = waApiUrl.setting_value;
  if (waApiKey) process.env.WHATSAPP_API_KEY = waApiKey.setting_value;
  if (waPhoneId) process.env.WHATSAPP_PHONE_NUMBER_ID = waPhoneId.setting_value;
  if (waVerify) process.env.WHATSAPP_VERIFY_TOKEN = waVerify.setting_value;

  // Invalidate settings cache
  settingsCache = null;
  settingsCacheTime = 0;
}

// 404 handler
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Halaman Tidak Ditemukan', layout: false });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err.message || err);
  try {
    req.flash('error', 'Terjadi kesalahan: ' + (err.message || 'Unknown error'));
    res.redirect(req.get('Referer') || '/dashboard');
  } catch (e) {
    res.status(500).send('Internal Server Error');
  }
});

// Prevent crash on unhandled promise rejections (e.g., FK constraint in async controllers)
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.stack || err.message || err);
  process.exitCode = 1;
});

initDb().then(() => {
  const { initSocketIO } = require('./utils/socket');
  initSocketIO(server);

  const { startSlaMonitor } = require('./utils/slaMonitor');
  startSlaMonitor(300000);

  const { setupTelegramWebhook } = require('./utils/telegramBot');
  setupTelegramWebhook(app);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Akses dari komputer lain: http://<IP-ADDRESS>:${PORT}`);
  });
});
