# SIMRS CareTrack

Sistem manajemen tiket pemeliharaan aset IT dan IPSRS untuk lingkungan rumah sakit. Mendukung pelaporan real-time via WhatsApp/Telegram, display monitor TV/LCD, dan dashboard analitik.

## Fitur

- **Multi-Layanan** — SIMRS (IT) dan IPSRS (Alkes, Listrik, Properti)
- **Pelaporan** — Via WhatsApp Bot, Telegram Bot, atau form web
- **Display Monitor** — TV/LCD real-time menampilkan laporan masuk per layanan
- **Notifikasi** — Real-time via Socket.IO + suara
- **Auto-Assignment** — Distribusi tiket ke teknisi berdasarkan beban kerja
- **QR Code** — Scan aset untuk auto-fill laporan
- **SLA Monitor** — Tracking response & resolution time
- **2FA** — Autentikasi dua faktor untuk admin

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js, Express, EJS |
| Database | SQLite / MySQL via Sequelize |
| Real-time | Socket.IO |
| Chat Bot | whatsapp-web.js, Telegraf |
| Auth | bcryptjs, speakeasy (2FA) |

## Mulai

```bash
git clone https://github.com/matdev90/maintenance-sistem.git
cd maintenance-sistem
npm install
cp .env.example .env   # sesuaikan konfigurasi
npm start
```

## Struktur

```
├── controllers/    # Logic bisnis
├── models/         # Sequelize models
├── routes/         # Express routes
├── views/          # EJS templates
├── middlewares/    # Auth, CSRF, Rate limit
├── utils/          # Bot, scheduler, helpers
├── migrations/     # SQL schema
└── config/         # Konfigurasi database
```

## Lisensi

MIT
