# Rencana Pengembangan: Self-Registrasi Bot untuk Pelapor

## Latar Belakang

Saat ini, pelapor (staf unit) hanya bisa membuat laporan melalui web app. Padahal flow `/lapor` di Telegram Bot dan WhatsApp Bot sudah lengkap dan siap digunakan oleh siapapun yang terautentikasi. Masalahnya: **registrasi bot hanya untuk teknisi**, sehingga pelapor tidak bisa mendaftar secara mandiri.

## Kondisi Saat Ini

| Aspek | Telegram | WhatsApp |
|-------|----------|----------|
| Flow `/lapor` via bot | Berfungsi penuh - wizard multi-step (pilih unit → kategori → perangkat → deskripsi → prioritas) | Berfungsi penuh - wizard sama seperti Telegram |
| Flow `/tiket` via bot | Berfungsi penuh | Berfungsi penuh |
| Flow `/status` via bot | Berfungsi penuh - menampilkan laporan/tiket aktif milik user | Berfungsi penuh |
| Command `/register` | Ada, tapi **hanya untuk role `teknisi`** | Tidak ada sama sekali |
| Registrasi pelapor | Admin harus buat manual user dg username `tg_<chat_id>` | Admin harus buat manual user dg username `wa_<no_hp>` |
| Penyimpanan chat ID | Tersimpan di `TechnicianProfile.telegram_chat_id` (khusus teknisi) | Tersimpan di `TechnicianProfile.whatsapp_number` (khusus teknisi) |

## Perubahan yang Diperlukan

### 1. Ubah `/register` di Telegram Bot agar Menerima Semua Role

**File:** `utils/telegramBot.js`

- Hapus filter `if (user.role !== 'teknisi')` yang menolak pelapor
- Untuk pelapor: simpan `telegram_chat_id` langsung di user (bukan di TechnicianProfile)

### 2. Tambah Command `/register` di WhatsApp Bot

**File:** `utils/whatsappBot.js`

- Saat ini tidak ada command register sama sekali
- Tambah flow registrasi seperti Telegram, simpan `whatsapp_number` di user

### 3. Simpan Chat ID Pelapor

**Opsi A (direkomendasikan):** Tambah kolom ke tabel `users`

```sql
ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(50);
ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(20);
```

Atau update `models/User.js`:

```js
telegram_chat_id: { type: DataTypes.STRING(50), allowNull: true },
whatsapp_number: { type: DataTypes.STRING(20), allowNull: true }
```

**Opsi B:** Buat model `UserProfile` generic yang bisa dipakai semua role.

### 4. Filter Menu Berdasarkan Role

Saat ini pelapor yang terdaftar melihat semua command termasuk `/tiket` dan `/aset`. Perlu role-based menu filtering.

### 5. UI Admin untuk Atur Chat ID Pelapor

**File:** `views/admin/user_form.ejs`

- Tambah field `Telegram Chat ID` dan `WhatsApp Number` di form edit user
- Simpan ke kolom baru di tabel users

### 6. Update Dokumentasi Bantuan

**File:** `views/admin/bantuan.ejs`

- Tambah section cara daftar & pakai bot untuk pelapor

## File yang akan Diubah

| File | Perubahan |
|------|-----------|
| `utils/telegramBot.js` | Relax `/register`, simpan chat ID untuk pelapor |
| `utils/whatsappBot.js` | Tambah command `/register`, simpan whatsapp number |
| `models/User.js` | Tambah field `telegram_chat_id`, `whatsapp_number` |
| `views/admin/user_form.ejs` | Tambah field chat ID / WA number |
| `views/admin/bantuan.ejs` | Tambah panduan pelapor via bot |
| `server.js` | Migrasi tambah kolom jika perlu |

## Prioritas

1. ✅ Model: tambah kolom `telegram_chat_id` & `whatsapp_number` ke User
2. ✅ Telegram: relax `/register` untuk semua role
3. ✅ WhatsApp: tambah command `/register`
4. ✅ Admin UI: field chat ID di form user
5. ✅ Bantuan: update dokumentasi
