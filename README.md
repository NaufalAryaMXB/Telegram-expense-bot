# 💸 ExpenseBot — Telegram Bot & Web Analytics Dashboard

Bot Telegram pintar untuk mencatat dan mengelola pengeluaran keuangan harian berbasis AI (**Google Gemini Vision** untuk OCR Struk), terhubung ke database **PostgreSQL**, dan dilengkapi antarmuka **Web Analytics Dashboard** mendukung penuh tampilan **Desktop** dan **Mobile-First**.

---

## ✨ Fitur Utama

### 🤖 1. Telegram Bot (Smart Input Pipeline)
- **Pencatatan Cepat Manual**: Cukup ketik pesan di Telegram, contoh: `beli kopi 15000` atau `kopi kenangan 25000 makanan`.
- **Scan Struk Otomatis (Google Gemini AI Vision)**: Kirim foto struk belanja, AI akan otomatis membaca nama merchant/toko, rincian item barang, kuantitas, harga per item, dan total nominal.
- **Laporan Instan di Chat**:
  - `/today` — Total pengeluaran hari ini.
  - `/week` — Total pengeluaran minggu ini.
  - `/month` — Total pengeluaran bulan berjalan.
  - `/monthlyexpense` — Rekap pengeluaran untuk bulan spesifik (format: `MM-YYYY`).

### 🌐 2. Web Analytics Dashboard (Minimalist Light Edition)
- **Desain Minimalis & Presisi**: Mengadopsi sistem desain *Swiss Fintech Minimalist Light* (Inter + JetBrains Mono, border hairline, tabular alignment).
- **Responsive Dual-Experience**:
  - 🖥️ **Desktop View**: Grid KPI 4-kolom berdensitas tinggi, grafik area dinamika pengeluaran harian, segmented bar distribusi kategori, kartu peringkat top vendor, dan tabel audit transaksi lengkap.
  - 📱 **Mobile View**: Tampilan kartu manifest responsif dengan nama item barang jelas, Floating Action Button (FAB) `+ New Entry`, dan Fixed Bottom Navigation Bar (*Overview, Ledger, Analytics, Vault*).
- **Proteksi Vault (AES-256 Lockscreen)**: Proteksi password master terenkripsi JWT dengan auto-lock timer countdown 15 menit.
- **Visualisasi Data Interaktif (Chart.js)**:
  - *Daily Cash Outflow*: Grafik area & garis pengeluaran per hari dengan indikator Peak, Low, dan Median.
  - *Allocation Matrix*: Distribusi anggaran per kategori dengan segmented bar dan persentase share.
  - *Primary Outflow Merchants*: Peringkat 5 toko/merchant teratas dengan progress volume bar.
- **Transactions & OCR Audit Ledger**:
  - *Live Search* instan (filter toko, barang, atau catatan OCR).
  - *Source Filter Pills*: Filter cepat (All, Telegram, AI OCR, Sheet, Web).
  - *Audit Inspection Modal*: Melihat rincian barang, kuantitas, harga per item dari tabel `expense_items`, dan teks mentah OCR asli dari Gemini AI.
  - *Full CRUD*: Tambah, Edit, dan Hapus transaksi langsung dari web browser.
  - *Export to CSV*: Unduh seluruh transaksi terfilter untuk spreadsheet/Excel.

---

## 🛠️ Tech Stack & Persyaratan Sistem

* **Runtime & Backend**: [Node.js](https://nodejs.org/) (v18+) & [Express.js](https://expressjs.com/)
* **Database**: [PostgreSQL](https://www.postgresql.org/) (didukung Neon, Supabase, Railway, Docker, atau PostgreSQL lokal)
* **AI & Vision OCR**: [Google Gemini API](https://aistudio.google.com/)
* **Telegram Integration**: `node-telegram-bot-api`
* **Frontend UI**: HTML5, Vanilla CSS / Tailwind CSS, Vanilla JS, Chart.js, Google Material Symbols
* **Tooling**: `concurrently`, `dotenv`, `jsonwebtoken`, `axios`, `pg`

---

## 📦 Instalasi & Konfigurasi

### 1. Clone Repositori & Install Dependensi
```bash
git clone https://github.com/NaufalAryaMXB/Telegram-expense-bot.git
cd "Expense bot"
npm install
```

### 2. Konfigurasi File `.env`
Buat file `.env` di root folder proyek:

```env
# Bot Telegram & AI
BOT_TOKEN=token_telegram_bot_anda
GEMINI_API_KEY=api_key_google_gemini_anda
OWNER_ID=id_telegram_pemilik (opsional)

# Database PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/expense_bot

# Web Dashboard Settings
PORT=3000
DASHBOARD_PASSWORD=admin123
JWT_SECRET=rahasia_jwt_anda_yang_aman

# Google Sheets Integration (Opsional)
GOOGLE_APPLICATION=expense-bot-xxxxx.json
SHEET_ID=id_spreadsheet_google_anda
```

---

## 🚀 Cara Menjalankan

| Perintah | Deskripsi |
|---|---|
| `npm run dev` | **Menjalankan Telegram Bot & Web Dashboard sekaligus secara bersamaan** |
| `npm start` | Menjalankan Telegram Bot saja (Polling mode) |
| `npm run dashboard` | Menjalankan Web Dashboard saja di `http://localhost:3000` |
| `npm run test:db` | Menguji koneksi database PostgreSQL & inisialisasi tabel |
| `npm run migrate:postgres` | Menyalin seluruh data historis dari SQLite lama ke PostgreSQL |
| `npm run delete:month` | Menghapus data transaksi bulan berjalan (atau: `node scripts/deleteThisMonth.js YYYY-MM`) |
| `npm run import:sheets` | Import data pengeluaran dari Google Sheets ke database |

> **Tips Cepat Windows**: Klik ganda file `run.bat` untuk langsung menjalankan bot dan web dashboard.

---

## 🗄️ Struktur Database (PostgreSQL)

Skema database dibuat secara otomatis saat pertama kali aplikasi dijalankan:

### 1. Tabel `expenses` (Catatan Transaksi Utama)
| Kolom | Tipe | Deskripsi |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | ID unik transaksi |
| `user_id` | VARCHAR | ID pengguna Telegram |
| `chat_id` | VARCHAR | ID chat Telegram |
| `source` | VARCHAR | Sumber input (`manual`, `receipt`, `sheet_import`, `dashboard`) |
| `store_name` | VARCHAR | Nama toko / merchant |
| `items` | TEXT | Rincian barang / deskripsi singkat |
| `total_amount` | BIGINT | Total nominal transaksi (Rupiah) |
| `expense_date` | DATE | Tanggal transaksi (`YYYY-MM-DD`) |
| `expense_date_label` | VARCHAR | Tanggal lokal Indonesia (contoh: `12 September 2026`) |
| `category` | VARCHAR | Kategori (Makanan, Belanja, Transportasi, Tagihan, dll.) |
| `receipt_text` | TEXT | Teks mentah hasil pembacaan OCR Google Gemini |
| `import_hash` | VARCHAR | Hash unik pencegah duplikasi |
| `created_at` / `updated_at` | TIMESTAMP | Waktu pencatatan |

### 2. Tabel `expense_items` (Rincian Item Struk OCR)
| Kolom | Tipe | Deskripsi |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | ID unik baris item |
| `expense_id` | INTEGER REFERENCES expenses(id) | Foreign key ke tabel `expenses` (`ON DELETE CASCADE`) |
| `line_number` | INTEGER | Urutan baris pada struk |
| `item_name` | VARCHAR | Nama barang / item |
| `quantity` | NUMERIC | Jumlah kuantitas barang |
| `line_total` | BIGINT | Total harga baris barang tersebut |
| `raw_text` | TEXT | Teks baris asli hasil OCR |

---

## 🔒 Keamanan

- **Zero API Key Leak**: Kredensial `.env` dan file `.json` service account telah terdaftar di `.gitignore`.
- **JWT Vault Authentication**: Halaman web dilindungi oleh token autentikasi JWT berbasis cookie/header dengan proteksi auto-lock.
- **Owner-Only Telegram Bot**: Akses Telegram Bot dapat dikunci khusus untuk user ID pemilik.
