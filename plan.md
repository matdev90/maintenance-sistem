# SIMRS CareTrack — Pengembangan Multi-Layanan + Display Monitor

## Overview

Sistem tiket pemeliharaan IT dikembangkan untuk mendukung **2 jenis layanan berbeda**:

| Layanan | Kategori | Keterangan |
|---------|----------|------------|
| **SIMRS** | Hardware, Software, Jaringan, TV Kabel | Menangani seluruh kebutuhan teknologi informasi |
| **IPSRS** | Alat Kesehatan, Listrik, Properti, Lainnya | Menangani keluhan di luar TI |

Setiap layanan memiliki **Display Monitor** (TV/LCD) yang menampilkan laporan masuk secara real-time dilengkapi suara notifikasi.

---

## Tahap 1: Model Layanan + Seed Data

### 1.1 Buat Model `Layanan`

**File baru:** `models/Layanan.js`

```js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Layanan = sequelize.define('Layanan', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  nama_layanan: { type: DataTypes.STRING(100), allowNull: false },
  kode: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  deskripsi: { type: DataTypes.TEXT, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'layanans',
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

module.exports = Layanan;
```

### 1.2 Seed Data Awal

```sql
INSERT INTO layanans (nama_layanan, kode, deskripsi, is_active, created_at, updated_at) VALUES
('SIMRS', 'simrs', 'Sistem Informasi Manajemen Rumah Sakit — menangani hardware, software, jaringan, TV kabel', 1, datetime('now'), datetime('now')),
('IPSRS', 'ipsrs', 'Instalasi Pemeliharaan Sarana Rumah Sakit — menangani alat kesehatan, listrik, properti, kerusakan lainnya', 1, datetime('now'), datetime('now'));
```

---

## Tahap 2: Relasi Kategori → Layanan

### 2.1 Tambah FK ke `device_categories`

```sql
ALTER TABLE device_categories ADD COLUMN id_layanan INTEGER REFERENCES layanans(id);
```

**Update:** `models/DeviceCategory.js` — tambah field `id_layanan`

```js
id_layanan: { type: DataTypes.INTEGER, allowNull: true }
```

### 2.2 Seed Kategori per Layanan

```sql
-- SIMRS
INSERT INTO device_categories (nama_kategori, id_layanan, created_at, updated_at) VALUES
('Hardware', 1, datetime('now'), datetime('now')),
('Software', 1, datetime('now'), datetime('now')),
('Jaringan', 1, datetime('now'), datetime('now')),
('TV Kabel', 1, datetime('now'), datetime('now'));

-- IPSRS
INSERT INTO device_categories (nama_kategori, id_layanan, created_at, updated_at) VALUES
('Alat Kesehatan', 2, datetime('now'), datetime('now')),
('Listrik', 2, datetime('now'), datetime('now')),
('Properti', 2, datetime('now'), datetime('now')),
('Lainnya', 2, datetime('now'), datetime('now'));
```

### 2.3 Update Association di `models/index.js`

```js
Layanan.hasMany(DeviceCategory, { foreignKey: 'id_layanan', as: 'kategori' });
DeviceCategory.belongsTo(Layanan, { foreignKey: 'id_layanan', as: 'layanan' });
```

---

## Tahap 3: Tiket Kategori Dinamis

### 3.1 Tambah FK ke `tickets`

Saat ini `tickets.kategori` ENUM hardcode (`hardware/software/jaringan/akun/lainnya`). Perlu diganti ke FK dinamis.

```sql
ALTER TABLE tickets ADD COLUMN id_kategori INTEGER REFERENCES device_categories(id);
```

**Update:** `models/Ticket.js` — tambah field `id_kategori`, pertahankan ENUM `kategori` sementara untuk backward compatibility (akan di-deprecate).

```js
id_kategori: { type: DataTypes.INTEGER, allowNull: true }
```

**Update Association:**

```js
Ticket.belongsTo(DeviceCategory, { foreignKey: 'id_kategori', as: 'kategori' });
```

### 3.2 Migrasi Data Lama

```sql
-- Mapping ENUM lama ke id_kategori baru
UPDATE tickets SET id_kategori = (SELECT id FROM device_categories WHERE nama_kategori = 'Hardware' LIMIT 1) WHERE kategori = 'hardware';
UPDATE tickets SET id_kategori = (SELECT id FROM device_categories WHERE nama_kategori = 'Software' LIMIT 1) WHERE kategori = 'software';
UPDATE tickets SET id_kategori = (SELECT id FROM device_categories WHERE nama_kategori = 'Jaringan' LIMIT 1) WHERE kategori = 'jaringan';
```

### 3.3 Update Form & Controller

**Files:**
- `views/tickets/create.ejs` — ganti dropdown ENUM ke dropdown dinamis (berdasarkan layanan)
- `controllers/ticketController.js` — gunakan `id_kategori` baru

---

## Tahap 4: CRUD Admin Layanan

### 4.1 Route

**File baru:** `routes/layanan.js`

| Method | Path | Keterangan |
|--------|------|------------|
| GET | `/admin/layanan` | Daftar layanan |
| GET | `/admin/layanan/create` | Form tambah |
| POST | `/admin/layanan` | Simpan |
| GET | `/admin/layanan/:id/edit` | Form edit |
| POST | `/admin/layanan/:id` | Update |
| POST | `/admin/layanan/:id/delete` | Hapus |

### 4.2 Views

**File baru:**
- `views/admin/layanan.ejs` — tabel daftar layanan + jumlah kategori
- `views/admin/layanan_form.ejs` — form tambah/edit

### 4.3 Register Route

**Update:** `server.js` — tambah `app.use('/admin/layanan', require('./routes/layanan'))`

### 4.4 Sidebar

**Update:** `views/layouts/main.ejs` — tambah menu "Layanan" di bagian Admin

---

## Tahap 5: Display Monitor

### 5.1 Route

**File baru:** `routes/display.js`

| Method | Path | Keterangan |
|--------|------|------------|
| GET | `/display/:kode_layanan` | Halaman display monitor |
| GET | `/display/:kode_layanan/data` | JSON data laporan (untuk AJAX fallback) |

**Tanpa autentikasi** — halaman publik untuk ditampilkan di TV/LCD.

### 5.2 Register Route

**Update:** `server.js`

```js
app.use('/display', require('./routes/display'));
```

### 5.3 Controller

**File baru:** `controllers/displayController.js`

```js
// GET /display/:kode_layanan
exports.index = async (req, res) => {
  const layanan = await Layanan.findOne({ where: { kode: req.params.kode_layanan } });
  if (!layanan) return res.status(404).send('Layanan tidak ditemukan');
  res.render('display/index', { layanan });
};

// GET /display/:kode_layanan/data
exports.data = async (req, res) => {
  const layanan = await Layanan.findOne({ where: { kode: req.params.kode_layanan } });
  const kategoris = await DeviceCategory.findAll({ where: { id_layanan: layanan.id } });
  const kategoriIds = kategoris.map(k => k.id);

  const reports = await Report.findAll({
    where: { id_kategori: kategoriIds, status: { [Op.notIn]: ['selesai', 'tidak_valid'] } },
    include: [...],
    order: [['createdAt', 'DESC']],
    limit: 20
  });

  const tickets = await Ticket.findAll({
    where: { id_kategori: kategoriIds, status: { [Op.notIn]: ['resolved', 'closed'] } },
    include: [...],
    order: [['createdAt', 'DESC']],
    limit: 20
  });

  res.json({ reports, tickets, stats });
};
```

### 5.4 View Display Monitor

**File baru:** `views/display/index.ejs`

Layout tampilan:

```
┌──────────────────────────────────────────────────────────┐
│                    LAPORAN MASUK                          │
│                    SIMRS / IPSRS                          │
│                                                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐   │
│  │  BARU  │ │ PROSES │ │SELESAI │ │     TOTAL      │   │
│  │   3    │ │   5    │ │   12   │ │      20        │   │
│  └────────┘ └────────┘ └────────┘ └────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ No   │ Asal Unit  │ Kategori    │ Prioritas │ Waktu │ │
│  │──────│────────────│─────────────│───────────│───────│ │
│  │ 001  │ IGD        │ Hardware    │ KRITIS    │ 10:23 │ │
│  │ 002  │ Radiologi  │ Jaringan    │ Sedang    │ 10:15 │ │
│  │ 003  │ Farmasi    │ Software    │ Ringan    │ 09:45 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  Terakhir diperbarui: 10:23:45                           │
│  [Fullscreen]                                             │
└──────────────────────────────────────────────────────────┘
```

**Fitur:**
- **Kartu statistik** — jumlah: baru, proses, selesai, total
- **Tabel laporan** — gabungan Reports + Tickets, urutkan prioritas (kritis di atas), waktu terbaru
- **Color coding prioritas:**
  - 🔴 Kritis — merah
  - 🟠 Berat/Tinggi — oranye
  - 🟡 Sedang — kuning
  - 🟢 Ringan/Rendah — hijau
- **Auto-refresh via Socket.IO** — tanpa page reload
- **Fullscreen button** — untuk TV monitor (`document.documentElement.requestFullscreen()`)
- **Clock** — jam real-time di pojok kanan atas

### 5.5 Auto-Hide yang Selesai

Laporan yang sudah `selesai` atau `tidak_valid` otomatis hilang dari display setelah **30 detik** (fade out animation).

---

## Tahap 6: Suara Notifikasi

### 6.1 Audio File

**File baru:** `public/audio/notif-new.mp3` — suara beep/chime pendek (~1-2 detik)

### 6.2 Implementasi di Display View

```js
// Di views/display/index.ejs
var notifAudio = new Audio('/audio/notif-new.mp3');

socket.on('new_report_layanan', function(data) {
  // Tambah baris baru ke tabel
  addNewRow(data);

  // Putar suara
  notifAudio.play().catch(function() {
    // Browser memblokir autoplay — user harus klik dulu
  });

  // Update counter statistik
  updateStats(data);
});

socket.on('report_update_layanan', function(data) {
  // Update status baris yang sudah ada
  updateRow(data);
});
```

### 6.3 Auto-Play Policy

Browser memblokir autoplay audio. Solusi:
- Tampilkan tombol "Aktifkan Suara" di awal load
- Setelah user klik pertama kali, audio diizinkan untuk sesi itu
- Simpan flag di `localStorage`

```html
<button id="enableSound" class="btn btn-sm btn-outline-light position-fixed" style="bottom:20px;right:20px;z-index:9999;">
  <i class="bi bi-volume-up"></i> Aktifkan Suara
</button>
```

---

## Tahap 7: Socket.IO — Real-Time

### 7.1 Emit dari Controller

**Update:** `controllers/reportController.js` — saat laporan baru dibuat/divalidasi

```js
// Setelah simpan laporan
const io = req.app.get('socketio');
const layanan = await Layanan.findOne({
  include: [{ model: DeviceCategory, as: 'kategori', where: { id: report.id_kategori } }]
});
if (layanan) {
  io.emit('new_report_layanan', {
    kode_layanan: layanan.kode,
    report: { id: report.id, unit: unit.nama_unit, kategori: kategori.nama_kategori, ... }
  });
}
```

**Update:** `controllers/ticketController.js` — saat tiket baru dibuat

```js
const io = req.app.get('socketio');
// Emit ke display yang sesuai berdasarkan kategori tiket
io.emit('new_report_layanan', {
  kode_layanan: layananKode,
  report: { ... }
});
```

### 7.2 Event Names

| Event | Direction | Payload |
|-------|-----------|---------|
| `new_report_layanan` | Server → Display | `{ kode_layanan, report: { id, unit, kategori, prioritas, waktu, deskripsi } }` |
| `report_update_layanan` | Server → Display | `{ kode_layanan, report: { id, status } }` |
| `report_done_layanan` | Server → Display | `{ kode_layanan, report_id }` |

---

## Tahap 8: Sidebar & Navigasi

### 8.1 Tambah Menu Display Monitor

**Update:** `views/layouts/main.ejs` — sidebar

```html
<!-- Setelah menu Bantuan -->
<% if (user && user.role === 'admin') { %>
<div class="sidebar-heading">Display</div>
<ul class="nav flex-column">
  <li class="nav-item">
    <a class="nav-link" href="/display/simrs" target="_blank">
      <i class="bi bi-display"></i> Display SIMRS
    </a>
  </li>
  <li class="nav-item">
    <a class="nav-link" href="/display/ipsrs" target="_blank">
      <i class="bi bi-display"></i> Display IPSRS
    </a>
  </li>
</ul>
<% } %>
```

### 8.2 Tambah Menu Layanan

Sidebar Admin section — tambah sebelum "Pengaturan":

```html
<li class="nav-item">
  <a class="nav-link" href="/admin/layanan">
    <i class="bi bi-layer-group"></i> Layanan
  </a>
</li>
```

---

## Ringkasan File yang Perlu Diubah/Dibuat

### File Baru (8)

| File | Keterangan |
|------|------------|
| `models/Layanan.js` | Model Layanan |
| `routes/layanan.js` | CRUD routes layanan |
| `routes/display.js` | Display monitor routes |
| `controllers/layananController.js` | CRUD controller layanan |
| `controllers/displayController.js` | Display controller |
| `views/admin/layanan.ejs` | Daftar layanan |
| `views/admin/layanan_form.ejs` | Form layanan |
| `views/display/index.ejs` | Halaman display monitor |
| `public/audio/notif-new.mp3` | Suara notifikasi |

### File yang Diubah (10)

| File | Perubahan |
|------|-----------|
| `models/DeviceCategory.js` | Tambah `id_layanan` FK |
| `models/Ticket.js` | Tambah `id_kategori` FK |
| `models/index.js` | Associations baru (Layanan, FK kategori) |
| `server.js` | Register routes layanan + display |
| `controllers/reportController.js` | Emit socket new_report_layanan |
| `controllers/ticketController.js` | Emit socket new_report_layanan |
| `views/layouts/main.ejs` | Sidebar: menu Layanan + Display |
| `views/tickets/create.ejs` | Dropdown kategori dinamis berdasarkan layanan |
| `views/reports/create.ejs` | Dropdown kategori dinamis berdasarkan layanan |
| `public/css/display.css` | **Baru** — styling display monitor |

---

## Database Migration Script (Gabungan)

```sql
-- 1. Buat tabel layanans
CREATE TABLE layanans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_layanan VARCHAR(100) NOT NULL,
  kode VARCHAR(20) NOT NULL UNIQUE,
  deskripsi TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seed layanan
INSERT INTO layanans (nama_layanan, kode, deskripsi, created_at, updated_at) VALUES
('SIMRS', 'simrs', 'Menangani hardware, software, jaringan, TV kabel', datetime('now'), datetime('now')),
('IPSRS', 'ipsrs', 'Menangani alat kesehatan, listrik, properti, kerusakan lainnya', datetime('now'), datetime('now'));

-- 3. Tambah FK ke device_categories
ALTER TABLE device_categories ADD COLUMN id_layanan INTEGER REFERENCES layanans(id);

-- 4. Seed kategori SIMRS (id_layanan=1)
INSERT INTO device_categories (nama_kategori, id_layanan, created_at, updated_at) VALUES
('Hardware', 1, datetime('now'), datetime('now')),
('Software', 1, datetime('now'), datetime('now')),
('Jaringan', 1, datetime('now'), datetime('now')),
('TV Kabel', 1, datetime('now'), datetime('now'));

-- 5. Seed kategori IPSRS (id_layanan=2)
INSERT INTO device_categories (nama_kategori, id_layanan, created_at, updated_at) VALUES
('Alat Kesehatan', 2, datetime('now'), datetime('now')),
('Listrik', 2, datetime('now'), datetime('now')),
('Properti', 2, datetime('now'), datetime('now')),
('Lainnya', 2, datetime('now'), datetime('now'));

-- 6. Tambah FK ke tickets
ALTER TABLE tickets ADD COLUMN id_kategori INTEGER REFERENCES device_categories(id);

-- 7. Migrasi data ENUM lama ke FK
UPDATE tickets SET id_kategori = (SELECT id FROM device_categories WHERE nama_kategori = 'Hardware' AND id_layanan = 1 LIMIT 1) WHERE kategori = 'hardware';
UPDATE tickets SET id_kategori = (SELECT id FROM device_categories WHERE nama_kategori = 'Software' AND id_layanan = 1 LIMIT 1) WHERE kategori = 'software';
UPDATE tickets SET id_kategori = (SELECT id FROM device_categories WHERE nama_kategori = 'Jaringan' AND id_layanan = 1 LIMIT 1) WHERE kategori = 'jaringan';

-- 8. Migrasi kategori ENUM yang ada di reports (jika ada ENUM di reports.id_kategori →映射)
-- (reports sudah pakai FK id_kategori, jadi tidak perlu migrasi)
```

---

## URL Endpoints

| URL | Keterangan | Autentikasi |
|-----|-----------|-------------|
| `/admin/layanan` | Daftar layanan | Admin |
| `/admin/layanan/create` | Form tambah layanan | Admin |
| `/admin/layanan/:id/edit` | Form edit layanan | Admin |
| `/display/simrs` | Display monitor SIMRS | Publik |
| `/display/ipsrs` | Display monitor IPSRS | Publik |
| `/display/:kode/data` | JSON data (AJAX fallback) | Publik |

---

## Display Monitor — Spesifikasi Visual

### Ukuran & Font

```css
body { font-family: 'Segoe UI', sans-serif; background: #0a0e27; color: #fff; }

.stat-card {
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  min-width: 140px;
}

.stat-card .stat-number {
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 1;
}

.stat-card .stat-label {
  font-size: 0.85rem;
  opacity: 0.7;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.table-display {
  font-size: 1rem;
}

.table-display th {
  background: rgba(255,255,255,0.05);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 0.8rem;
}

.table-display td {
  padding: 0.75rem 1rem;
  vertical-align: middle;
}

/* Prioritas badges */
.badge-kritis { background: #dc3545; }
.badge-berat  { background: #fd7e14; }
.badge-sedang { background: #ffc107; color: #333; }
.badge-ringan { background: #28a745; }
```

### Animasi

```css
/* Baris baru masuk */
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
.row-new { animation: slideIn 0.5s ease-out; }

/* Baris selesai — fade out lalu hapus */
@keyframes fadeOut {
  from { opacity: 1; }
  to   { opacity: 0; transform: translateX(20px); }
}
.row-done { animation: fadeOut 1s ease-in forwards; }
```

### Jam Real-Time

```html
<div id="clock" class="text-end" style="font-size:1.5rem; font-weight:700;"></div>
<script>
setInterval(function() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');
}, 1000);
</script>
```

---

## Checklist Implementasi

- [ ] Tahap 1: Model Layanan + seed data
- [ ] Tahap 2: Relasi kategori → layanan (FK + seed)
- [ ] Tahap 3: Tiket kategori dinamis (migrasi ENUM → FK)
- [ ] Tahap 4: CRUD admin layanan (routes, views, controller)
- [ ] Tahap 5: Display monitor (routes, views, controller, Socket.IO)
- [ ] Tahap 6: Suara notifikasi (audio file + auto-play handling)
- [ ] Tahap 7: Socket.IO event wiring (report/ticket controller → display)
- [ ] Tahap 8: Sidebar & navigasi update
- [ ] Testing: Buat laporan → cek display muncul + suara
- [ ] Testing: Validasi laporan → cek display update status
- [ ] Testing: Cek display IPSRS hanya tampilkan kategori IPSRS
