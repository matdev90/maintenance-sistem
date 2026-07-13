-- ============================================================
-- SIMRS Maintenance - Database Schema (SQLite-compatible)
-- ============================================================

-- TABEL USERS
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nama_lengkap VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'pelapor' CHECK(role IN ('admin','teknisi','pelapor')),
  id_unit INTEGER DEFAULT NULL,
  foto VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_unit) REFERENCES units(id) ON DELETE SET NULL
);

-- TABEL UNITS
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_unit VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL DEVICE_CATEGORIES
CREATE TABLE IF NOT EXISTS device_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_kategori VARCHAR(100) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL REPORTS
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_unit INTEGER NOT NULL,
  id_kategori INTEGER DEFAULT NULL,
  nama_perangkat VARCHAR(150) NOT NULL,
  deskripsi TEXT,
  prioritas VARCHAR(20) NOT NULL DEFAULT 'ringan' CHECK(prioritas IN ('ringan','sedang','berat','kritis')),
  status VARCHAR(30) NOT NULL DEFAULT 'dilaporkan' CHECK(status IN ('dilaporkan','divalidasi','investigasi','dalam_perbaikan','selesai','tidak_dapat_diperbaiki','tidak_valid')),
  foto VARCHAR(255) DEFAULT NULL,
  id_pelapor INTEGER NOT NULL,
  id_validator INTEGER DEFAULT NULL,
  id_investigator INTEGER DEFAULT NULL,
  id_teknisi INTEGER DEFAULT NULL,
  tgl_validasi DATETIME DEFAULT NULL,
  tgl_investigasi DATETIME DEFAULT NULL,
  tgl_mulai_perbaikan DATETIME DEFAULT NULL,
  tgl_selesai DATETIME DEFAULT NULL,
  catatan_teknisi TEXT DEFAULT NULL,
  alasan_tidak_valid TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_unit) REFERENCES units(id) ON DELETE CASCADE,
  FOREIGN KEY (id_kategori) REFERENCES device_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (id_pelapor) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (id_validator) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (id_investigator) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (id_teknisi) REFERENCES users(id) ON DELETE SET NULL
);

-- TABEL REPORT_TRACKINGS
CREATE TABLE IF NOT EXISTS report_trackings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_report INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  catatan TEXT,
  id_user INTEGER DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_report) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE SET NULL
);

-- TABEL SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL SLA_TARGETS
CREATE TABLE IF NOT EXISTS sla_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prioritas VARCHAR(20) NOT NULL UNIQUE CHECK(prioritas IN ('ringan','sedang','berat','kritis')),
  batas_validasi_jam INTEGER NOT NULL DEFAULT 24,
  batas_investigasi_jam INTEGER NOT NULL DEFAULT 48,
  batas_selesai_jam INTEGER NOT NULL DEFAULT 72,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_user INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255) DEFAULT NULL,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_user) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- SEEDER: Data Awal
-- ============================================================
INSERT INTO units (nama_unit) VALUES
('IGD'), ('Rawat Inap'), ('Poliklinik'), ('Farmasi'), ('Radiologi'),
('Laboratorium'), ('OK'), ('ICU'), ('NICU'), ('Administrasi');

INSERT INTO device_categories (nama_kategori) VALUES
('AC'), ('TV'), ('Infus Pump'), ('Bed Pasien'), ('Monitor Pasien'),
('Ventilator'), ('Komputer'), ('Printer'), ('Lampu Operasi'), ('Lainnya');

INSERT INTO sla_targets (prioritas, batas_validasi_jam, batas_investigasi_jam, batas_selesai_jam) VALUES
('ringan', 48, 72, 120),
('sedang', 24, 48, 72),
('berat', 8, 24, 48),
('kritis', 2, 4, 24);

INSERT INTO settings (setting_key, setting_value) VALUES
('nama_rs', 'RSUD Contoh'),
('alamat_rs', 'Jl. Kesehatan No. 1'),
('telepon_rs', '(021) 12345678'),
('logo_rs', '');

-- Password default: admin123 (bcrypt hash)
INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Administrator', 'admin'),
('teknisi1', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Teknisi Satu', 'teknisi');
