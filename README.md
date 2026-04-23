# Telegram Expense Bot

Bot Telegram cerdas untuk mencatat dan mengelola pengeluaran harian Anda dengan dukungan AI (Google Gemini) untuk membaca struk belanja otomatis.

## Fitur Utama

- **Pencatatan Manual**: Tambahkan pengeluaran secara manual melalui chat (contoh: `beli kopi 15000`).
- **Scan Struk Otomatis (AI)**: Kirim foto struk belanja, dan bot akan menggunakan Google Gemini API untuk mengekstrak informasi toko, daftar barang, dan total pengeluaran.
- **Database Lokal**: Data pengeluaran disimpan dengan aman di database SQLite lokal (mendukung pencatatan gabungan dan rincian per barang).
- **Laporan Pengeluaran**:
  - `/today` - Lihat pengeluaran hari ini.
  - `/week` - Lihat pengeluaran minggu ini.
  - `/month` - Lihat pengeluaran bulan ini.
  - `/monthlyexpense` - Lihat pengeluaran untuk bulan tertentu.

## Persyaratan (Prerequisites)

- [Node.js](https://nodejs.org/) (Versi 18 atau lebih baru disarankan)
- Akun dan Bot Telegram (Dapatkan token dari [BotFather](https://t.me/botfather))
- API Key Google Gemini
- Kredensial Service Account Google Cloud (jika menggunakan fitur Google Sheets opsional)

## Instalasi

1. Clone repositori ini atau unduh kode sumbernya:
   ```bash
   git clone https://github.com/NaufalAryaMXB/Telegram-expense-bot
   cd "Expense bot"
   ```

2. Instal dependensi:
   ```bash
   npm install
   ```

3. Buat file `.env` di root folder proyek (jangan di-commit ke Git) dan isi dengan konfigurasi berikut:
   ```env
   BOT_TOKEN=token_telegram_bot_anda
   GEMINI_API_KEY=api_key_gemini_anda
   GOOGLE_APPLICATION=nama_file_kredensial_google.json
   SHEET_ID=id_spreadsheet_google_anda
   ```

4. Pastikan file kredensial JSON Google Cloud (misalnya `expense-bot-xxxxx.json`) diletakkan di root folder proyek jika Anda menggunakan integrasi Google.

## Cara Menjalankan

Jalankan bot menggunakan perintah:
```bash
node index.js
```
Atau jika ada script di `package.json`:
```bash
npm start
```
Bot akan mulai melakukan "polling" dan siap digunakan di Telegram.

## Struktur Database (SQLite)

Bot menggunakan SQLite untuk penyimpanan data. Database akan otomatis dibuat di folder `data/` dengan nama `expense-bot.sqlite`.
Terdapat dua tabel utama:
1. `expenses`: Menyimpan rangkuman transaksi (tanggal, nama toko, daftar item gabungan, dan total).
2. `expense_items`: Menyimpan rincian per barang dari struk belanja (nama item, harga, kuantitas).

## Keamanan

- **JANGAN** pernah mengunggah file `.env` atau file kredensial `.json` ke public repository GitHub. File-file ini sudah dimasukkan ke dalam `.gitignore`.
- Bot ini dikonfigurasi khusus untuk `OWNER_ID` tertentu, sehingga orang lain tidak bisa memasukkan data pengeluaran ke database Anda.
