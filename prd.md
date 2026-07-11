Product Requirements Document (PRD)
Nama Produk: SIMRS CareTrack (Sistem Tiket Pemeliharaan Aset IT Terintegrasi)
Versi: 1.0
Status: Draft
Tanggal: 24 Mei 2024

1. Ringkasan Eksekutif (Executive Summary)
SIMRS CareTrack adalah sistem manajemen tiket pemeliharaan perangkat IT (komputer, printer, periferal) yang dirancang khusus untuk lingkungan Rumah Sakit. Sistem ini mengintegrasikan pelaporan melalui platform chat populer (WhatsApp/Telegram) untuk meminimalkan hambatan adopsi bagi staf non-IT, serta memberikan notifikasi real-time kepada teknisi SIMRS. Tujuan utamanya adalah mengurangi Mean Time to Repair (MTTR), meningkatkan transparansi status perbaikan, dan menyediakan data analitik untuk peningkatan mutu pelayanan SIMRS.

2. Latar Belakang & Masalah (Problem Statement)
- Pelaporan Manual: Saat ini, pelaporan kerusakan sering dilakukan via telepon atau pesan pribadi yang tidak tercatat, menyebabkan hilangnya jejak audit.
- Respon Lambat: Teknisi sering melewatkan laporan karena tidak ada sistem notifikasi terpusat.
- Kurangnya Data Kinerja: Tidak ada metrik jelas mengenai seberapa cepat teknisi menangani masalah atau ruangan mana yang paling sering mengalami kerusakan.
- Hambatan Adopsi: Staf medis/nakes enggan menggunakan aplikasi baru yang rumit; mereka lebih nyaman dengan WhatsApp/Telegram.

3. Tujuan Produk (Product Goals)
1. Efisiensi Waktu: Memangkas waktu pelaporan dari rata-rata 5 menit menjadi < 1 menit melalui integrasi chat.
2. Akuntabilitas: Setiap laporan memiliki ID Tiket unik, timestamp, dan penanggung jawab jelas.
3. Notifikasi Real-Time: Teknisi menerima alert instan di HP pribadi mereka saat ada tiket baru.
4. Peningkatan Mutu: Menyediakan dashboard analitik untuk memantau KPI (Key Performance Indicator) tim SIMRS.

4. Pengguna Target (User Personas)
| Persona | Deskripsi | Kebutuhan Utama |
| :--- | :--- | :--- |
| Staf Unit (Reporter) | Perawat, Dokter, Admin Ruangan | Melapor cepat tanpa instal app baru, bisa upload foto, tahu status perbaikan. |
| Teknisi SIMRS (Resolver) | Staff IT Support | Menerima notifikasi jelas (lokasi & jenis rusak), update status mudah, riwayat aset. |
| Kepala SIMRS (Admin) | Manajer IT | Memantau beban kerja teknisi, melihat statistik kerusakan, mengelola inventaris aset. |

5. Fitur Utama (Functional Requirements)

5.1. Modul Pelaporan (Via WhatsApp/Telegram Bot)
- FR-01: Inisiasi Tiket: Pengguna dapat memulai chat dengan bot dan memilih menu "Lapor Kerusakan".
- FR-02: Input Data Cepat:
  - Pilihan Lokasi Ruangan (Dropdown/List).
  - Pilihan Kategori Perangkat (PC, Printer, Mouse, Keyboard, Jaringan, dll).
  - Upload Foto Bukti Kerusakan (Wajib/Opsional).
  - Deskripsi Singkat (Text).
- FR-03: Scan QR Code (Inovasi): Pengguna dapat scan QR Code yang tertempel di perangkat untuk mengisi otomatis ID Aset dan Lokasi.
- FR-04: Konfirmasi Tiket: Bot membalas dengan ID Tiket unik dan estimasi waktu respons.

5.2. Modul Distribusi & Notifikasi (Backend)
- FR-05: Auto-Assignment: Sistem secara otomatis menugaskan tiket ke teknisi berdasarkan:
  - Spesialisasi (misal: Printer -> Tim Hardware).
  - Beban kerja saat ini (Round-robin atau Least Loaded).
- FR-06: Notifikasi Teknisi: Mengirim pesan ke WhatsApp/Telegram teknisi yang ditugaskan berisi:
  - ID Tiket.
  - Lokasi & Jenis Kerusakan.
  - Link Aksi Cepat (Accept/Reject/Update).

5.3. Modul Penanganan (Teknisi)
- FR-07: Update Status: Teknisi dapat mengubah status tiket via link web ringan atau balasan chat:
  - Diterima -> Sedang Dikerjakan -> Menunggu Sparepart -> Selesai.
- FR-08: Catatan Perbaikan: Teknisi wajib mengisi akar penyebab masalah dan solusi yang diberikan sebelum menutup tiket.

5.4. Modul Feedback & Penutupan
- FR-09: Konfirmasi Selesai: Sistem mengirim notifikasi ke Staf Unit bahwa tiket telah ditutup.
- FR-10: Rating Kepuasan: Staf Unit diminta memberikan rating (1-5 bintang) dan komentar opsional.Product Requirements Document (PRD)
Nama Produk: SIMRS CareTrack (Sistem Tiket Pemeliharaan Aset IT Terintegrasi)
Versi: 1.0
Status: Draft
Tanggal: 24 Mei 2024

1. Ringkasan Eksekutif (Executive Summary)
SIMRS CareTrack adalah sistem manajemen tiket pemeliharaan perangkat IT (komputer, printer, periferal) yang dirancang khusus untuk lingkungan Rumah Sakit. Sistem ini mengintegrasikan pelaporan melalui platform chat populer (WhatsApp/Telegram) untuk meminimalkan hambatan adopsi bagi staf non-IT, serta memberikan notifikasi real-time kepada teknisi SIMRS. Tujuan utamanya adalah mengurangi Mean Time to Repair (MTTR), meningkatkan transparansi status perbaikan, dan menyediakan data analitik untuk peningkatan mutu pelayanan SIMRS.

2. Latar Belakang & Masalah (Problem Statement)
- Pelaporan Manual: Saat ini, pelaporan kerusakan sering dilakukan via telepon atau pesan pribadi yang tidak tercatat, menyebabkan hilangnya jejak audit.
- Respon Lambat: Teknisi sering melewatkan laporan karena tidak ada sistem notifikasi terpusat.
- Kurangnya Data Kinerja: Tidak ada metrik jelas mengenai seberapa cepat teknisi menangani masalah atau ruangan mana yang paling sering mengalami kerusakan.
- Hambatan Adopsi: Staf medis/nakes enggan menggunakan aplikasi baru yang rumit; mereka lebih nyaman dengan WhatsApp/Telegram.

3. Tujuan Produk (Product Goals)
1. Efisiensi Waktu: Memangkas waktu pelaporan dari rata-rata 5 menit menjadi < 1 menit melalui integrasi chat.
2. Akuntabilitas: Setiap laporan memiliki ID Tiket unik, timestamp, dan penanggung jawab jelas.
3. Notifikasi Real-Time: Teknisi menerima alert instan di HP pribadi mereka saat ada tiket baru.
4. Peningkatan Mutu: Menyediakan dashboard analitik untuk memantau KPI (Key Performance Indicator) tim SIMRS.

4. Pengguna Target (User Personas)
| Persona | Deskripsi | Kebutuhan Utama |
| :--- | :--- | :--- |
| Staf Unit (Reporter) | Perawat, Dokter, Admin Ruangan | Melapor cepat tanpa instal app baru, bisa upload foto, tahu status perbaikan. |
| Teknisi SIMRS (Resolver) | Staff IT Support | Menerima notifikasi jelas (lokasi & jenis rusak), update status mudah, riwayat aset. |
| Kepala SIMRS (Admin) | Manajer IT | Memantau beban kerja teknisi, melihat statistik kerusakan, mengelola inventaris aset. |

5. Fitur Utama (Functional Requirements)

5.1. Modul Pelaporan (Via WhatsApp/Telegram Bot)
- FR-01: Inisiasi Tiket: Pengguna dapat memulai chat dengan bot dan memilih menu "Lapor Kerusakan".
- FR-02: Input Data Cepat:
  - Pilihan Lokasi Ruangan (Dropdown/List).
  - Pilihan Kategori Perangkat (PC, Printer, Mouse, Keyboard, Jaringan, dll).
  - Upload Foto Bukti Kerusakan (Wajib/Opsional).
  - Deskripsi Singkat (Text).
- FR-03: Scan QR Code (Inovasi): Pengguna dapat scan QR Code yang tertempel di perangkat untuk mengisi otomatis ID Aset dan Lokasi.
- FR-04: Konfirmasi Tiket: Bot membalas dengan ID Tiket unik dan estimasi waktu respons.

5.2. Modul Distribusi & Notifikasi (Backend)
- FR-05: Auto-Assignment: Sistem secara otomatis menugaskan tiket ke teknisi berdasarkan:
  - Spesialisasi (misal: Printer -> Tim Hardware).
  - Beban kerja saat ini (Round-robin atau Least Loaded).
- FR-06: Notifikasi Teknisi: Mengirim pesan ke WhatsApp/Telegram teknisi yang ditugaskan berisi:
  - ID Tiket.
  - Lokasi & Jenis Kerusakan.
  - Link Aksi Cepat (Accept/Reject/Update).

5.3. Modul Penanganan (Teknisi)
- FR-07: Update Status: Teknisi dapat mengubah status tiket via link web ringan atau balasan chat:
  - Diterima -> Sedang Dikerjakan -> Menunggu Sparepart -> Selesai.
- FR-08: Catatan Perbaikan: Teknisi wajib mengisi akar penyebab masalah dan solusi yang diberikan sebelum menutup tiket.

5.4. Modul Feedback & Penutupan
- FR-09: Konfirmasi Selesai: Sistem mengirim notifikasi ke Staf Unit bahwa tiket telah ditutup.
- FR-10: Rating Kepuasan: Staf Unit diminta memberikan rating (1-5 bintang) dan komentar opsional.
5.5. Modul Admin & Dashboard
- FR-11: Manajemen Aset: CRUD (Create, Read, Update, Delete) data perangkat dan lokasi.
- FR-12: Manajemen Teknisi: Menetapkan jadwal shift dan spesialisasi teknisi.
- FR-13: Dashboard Analitik:
  - Total Tiket per Hari/Bulan.
  - Average Response Time & Resolution Time.
  - Top 10 Ruangan dengan Kerusakan Terbanyak.
  - Performa Individual Teknisi.

6. Persyaratan Non-Fungsional (Non-Functional Requirements)
- NFR-01: Kecepatan: Notifikasi harus terkirim dalam waktu < 5 detik setelah tiket dibuat.
- NFR-02: Ketersediaan (Availability): Sistem harus up 99.9% selama jam operasional RS (24/7 untuk UGD).
- NFR-03: Keamanan: Data pasien tidak boleh tersimpan dalam deskripsi tiket. Akses dashboard admin dilindungi autentikasi dua faktor (2FA).
- NFR-04: Skalabilitas: Mampu menangani hingga 1.000 tiket per hari tanpa penurunan performa signifikan.
- NFR-05: Kompatibilitas: Bot harus berjalan stabil di WhatsApp Business API dan Telegram API.

7. Alur Kerja Sistem (System Workflow)

[Staf Unit] --> (Scan QR / Chat Bot) --> [WhatsApp/Telegram Gateway]
[WhatsApp/Telegram Gateway] --> (Parse Data) --> {Backend Server}
{Backend Server} --> (Simpan Tiket) --> [(Database PostgreSQL)]
{Backend Server} --> (Logika Assignment) --> [Auto-Assign Engine]
[Auto-Assign Engine] --> (Tentukan Teknisi) --> [Teknisi SIMRS]
[Teknisi SIMRS] --> (Terima Notifikasi) --> [HP Teknisi]
[HP Teknisi] --> (Update Status) --> [Backend Server]
[Backend Server] --> (Update DB) --> [(Database PostgreSQL)]
[Backend Server] --> (Notifikasi Selesai) --> [Staf Unit]
[Staf Unit] --> (Berikan Rating) --> [Dashboard Admin]

8. Stack Teknologi yang Direkomendasikan

| Komponen | Teknologi | Alasan Pemilihan |
| :--- | :--- | :--- |
| Chat Interface | WhatsApp Business API (via Fonnte/Wablas) atau Telegram Bot API | Familiar bagi pengguna, notifikasi push efektif. |
| Backend | Node.js (Express/NestJS) atau Python (FastAPI) | Performa tinggi untuk I/O operations, ekosistem library kaya. |
| Database | PostgreSQL | Relasional kuat, mendukung query kompleks untuk analitik. |
| Hosting | Cloud VPS (AWS EC2 / DigitalOcean) atau Server Lokal RS | Fleksibilitas penyimpanan data sensitif RS. |
| Frontend Admin | React.js atau Vue.js + Tailwind CSS | Responsif, cepat dikembangkan, UI modern. |
| Queue System | Redis | Untuk menangani antrian notifikasi agar tidak hilang saat traffic tinggi. |

9. Metrik Keberhasilan (Success Metrics/KPIs)
1. Adoption Rate: > 80% staf unit menggunakan sistem tiket dalam 3 bulan pertama.
2. Response Time: Rata-rata waktu tanggapan teknisi < 15 menit.
3. Resolution Time: Rata-rata waktu penyelesaian masalah < 4 jam untuk isu minor.
4. Customer Satisfaction: Rating kepuasan rata-rata > 4.5 dari 5.

10. Roadmap Pengembangan

Fase 1: MVP (Minimum Viable Product) - Bulan 1-2
- Integrasi Bot Telegram (lebih mudah setup).
- Fitur dasar: Lapor tiket, assign manual/otomatis sederhana, update status.
- Dashboard admin dasar.

Fase 2: Integrasi WhatsApp & QR Code - Bulan 3-4
- Migrasi/Tambahan integrasi WhatsApp Business API.
- Implementasi fitur Scan QR Code pada aset.
- Notifikasi otomatis ke pelapor.

Fase 3: Analitik Lanjutan & Preventif - Bulan 5-6
- Dashboard analitik mendalam.
- Fitur reminder maintenance rutin.
- Integrasi dengan modul inventaris SIMRS utama (jika ada).

11. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
| :--- | :--- | :--- |
| Gangguan Internet RS | Bot tidak bisa diakses | Sediakan fallback form web offline-mode yang sinkron saat online kembali. |
| Resistensi Staf | Tidak mau pakai sistem | Sosialisasi intensif, buat proses lapor sangat mudah (1 klik). |
| Biaya API WhatsApp | Biaya operasional tinggi | Gunakan provider lokal yang lebih murah, atau batasi penggunaan WhatsApp hanya untuk notifikasi penting, sementara laporan tetap di Telegram/Web.
