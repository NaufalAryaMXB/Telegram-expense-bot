require("dotenv").config()

const path = require("path")
const fs = require("fs")
const { DatabaseSync } = require("node:sqlite")
const { pool, initDatabase } = require("../database")

const SQLITE_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "expense-bot.sqlite")

async function migrate() {
    console.log("🚀 Memulai proses migrasi dari SQLite ke PostgreSQL...")

    if (!fs.existsSync(SQLITE_PATH)) {
        console.error(`❌ File SQLite tidak ditemukan di: ${SQLITE_PATH}`)
        process.exit(1)
    }

    console.log(`📂 Membaca database SQLite: ${SQLITE_PATH}`)
    const sqliteDb = new DatabaseSync(SQLITE_PATH)

    // 1. Inisialisasi tabel PostgreSQL
    console.log("🛠️  Memastikan tabel dan skema di PostgreSQL siap...")
    await initDatabase()

    // 2. Baca data dari SQLite
    const sqliteExpenses = sqliteDb.prepare("SELECT * FROM expenses ORDER BY id ASC").all()
    const sqliteExpenseItems = sqliteDb.prepare("SELECT * FROM expense_items ORDER BY id ASC").all()

    console.log(`📊 Ditemukan data di SQLite:`)
    console.log(`   - Transaksi (expenses): ${sqliteExpenses.length} baris`)
    console.log(`   - Rincian item (expense_items): ${sqliteExpenseItems.length} baris\n`)

    if (sqliteExpenses.length === 0) {
        console.log("ℹ️ Tidak ada data expenses yang perlu dipindahkan.")
        await pool.end()
        return
    }

    const client = await pool.connect()
    try {
        await client.query("BEGIN")

        // 3. Migrasi tabel expenses
        console.log("⏳ Memindahkan data 'expenses' ke PostgreSQL...")
        let migratedExpensesCount = 0

        for (const exp of sqliteExpenses) {
            const query = `
                INSERT INTO expenses (
                    id,
                    user_id,
                    chat_id,
                    source,
                    store_name,
                    items,
                    total_amount,
                    expense_date,
                    expense_date_label,
                    category,
                    receipt_text,
                    import_hash,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO UPDATE SET
                    store_name = EXCLUDED.store_name,
                    items = EXCLUDED.items,
                    total_amount = EXCLUDED.total_amount,
                    expense_date = EXCLUDED.expense_date,
                    expense_date_label = EXCLUDED.expense_date_label,
                    category = EXCLUDED.category,
                    receipt_text = EXCLUDED.receipt_text,
                    updated_at = EXCLUDED.updated_at
            `

            const values = [
                exp.id,
                exp.user_id || 0,
                exp.chat_id || 0,
                exp.source || "manual",
                exp.store_name || "Unknown",
                exp.items || "",
                exp.total_amount || 0,
                exp.expense_date,
                exp.expense_date_label || exp.expense_date,
                exp.category || null,
                exp.receipt_text || null,
                exp.import_hash || null,
                exp.created_at || new Date().toISOString(),
                exp.updated_at || new Date().toISOString()
            ]

            await client.query(query, values)
            migratedExpensesCount++
        }

        // 4. Migrasi tabel expense_items
        console.log("⏳ Memindahkan data 'expense_items' ke PostgreSQL...")
        let migratedItemsCount = 0

        for (const item of sqliteExpenseItems) {
            const query = `
                INSERT INTO expense_items (
                    id,
                    expense_id,
                    line_number,
                    item_name,
                    quantity,
                    line_total,
                    raw_text,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE SET
                    item_name = EXCLUDED.item_name,
                    quantity = EXCLUDED.quantity,
                    line_total = EXCLUDED.line_total,
                    raw_text = EXCLUDED.raw_text
            `

            const values = [
                item.id,
                item.expense_id,
                item.line_number || 0,
                item.item_name || "Unknown",
                item.quantity ?? null,
                item.line_total ?? null,
                item.raw_text || null,
                item.created_at || new Date().toISOString()
            ]

            await client.query(query, values)
            migratedItemsCount++
        }

        // 5. Update Sequences di PostgreSQL agar auto increment ID berikutnya valid
        console.log("🔄 Memperbarui PostgreSQL sequence ID...")
        await client.query(`
            SELECT setval('expenses_id_seq', COALESCE((SELECT MAX(id) FROM expenses), 1), true);
            SELECT setval('expense_items_id_seq', COALESCE((SELECT MAX(id) FROM expense_items), 1), true);
        `)

        await client.query("COMMIT")

        console.log("\n🎉 MIGRASI BERHASIL SELESAI!")
        console.log(`   ✅ Transaksi tersimpan: ${migratedExpensesCount}`)
        console.log(`   ✅ Rincian item tersimpan: ${migratedItemsCount}`)
    } catch (error) {
        await client.query("ROLLBACK")
        console.error("\n❌ Terjadi kesalahan saat migrasi:", error)
        throw error
    } finally {
        client.release()
        await pool.end()
    }
}

migrate().catch((err) => {
    console.error("Migration failed:", err)
    process.exit(1)
})
