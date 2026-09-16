require("dotenv").config()

const { pool, initDatabase, getExpenses, getDatabaseInfo } = require("../database")

async function testConnection() {
    console.log("🔍 Menguji koneksi ke PostgreSQL...")
    const info = getDatabaseInfo()
    console.log(`📌 Info Database: ${info.type} - ${info.url}`)

    try {
        const client = await pool.connect()
        console.log("✅ Berhasil terhubung ke server PostgreSQL!")
        client.release()

        console.log("🛠️ Memeriksa & membuat tabel jika belum ada...")
        await initDatabase()
        console.log("✅ Tabel 'expenses' dan 'expense_items' siap!")

        const expenses = await getExpenses()
        console.log(`📊 Jumlah data pengeluaran saat ini: ${expenses.length} baris`)
    } catch (err) {
        console.error("\n❌ Gagal terhubung ke PostgreSQL:")
        console.error(err.message)
        console.log("\n💡 TIPS:")
        console.log("1. Pastikan Anda sudah menambahkan `DATABASE_URL` di file `.env`.")
        console.log("   Contoh: DATABASE_URL=postgresql://postgres:password@localhost:5432/expense_bot")
        console.log("2. Jika menggunakan Supabase / Neon, pastikan connection string menyertakan sslmode (biasanya sudah include).")
    } finally {
        await pool.end()
    }
}

testConnection()
