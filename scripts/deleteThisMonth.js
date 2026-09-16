require("dotenv").config()

const { pool, initDatabase } = require("../database")

async function deleteMonth() {
    // Ambil parameter bulan dari argument CLI (misal: node scripts/deleteThisMonth.js 2026-09)
    // Default ke bulan saat ini jika tidak ada argumen
    const targetMonth = process.argv[2] || new Date().toISOString().slice(0, 7)

    console.log(`\n🔍 Memeriksa transaksi PostgreSQL untuk bulan: ${targetMonth}...`)

    await initDatabase()

    const selectQuery = `
        SELECT id, store_name, total_amount, TO_CHAR(expense_date, 'YYYY-MM-DD') AS expense_date, category
        FROM expenses 
        WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
        ORDER BY expense_date ASC, id ASC
    `

    const { rows } = await pool.query(selectQuery, [targetMonth])

    if (rows.length === 0) {
        console.log(`❌ Tidak ada data transaksi untuk bulan ${targetMonth}.\n`)
        await pool.end()
        process.exit(0)
    }

    console.table(rows)
    console.log(`Ditemukan ${rows.length} transaksi.`)

    const deleteQuery = `
        DELETE FROM expenses 
        WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
    `

    const result = await pool.query(deleteQuery, [targetMonth])
    console.log(`\n✅ BERHASIL: Menghapus ${result.rowCount} data transaksi untuk bulan ${targetMonth}.\n`)

    await pool.end()
}

deleteMonth().catch(async (err) => {
    console.error("Gagal menghapus data:", err)
    await pool.end()
    process.exit(1)
})
