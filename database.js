require("dotenv").config()

const { Pool } = require("pg")

const connectionString = process.env.DATABASE_URL
const useSsl =
    process.env.PGSSL === "true" ||
    (Boolean(connectionString) &&
        (connectionString.includes("sslmode=require") ||
            !connectionString.includes("localhost") &&
            !connectionString.includes("127.0.0.1")))

const poolConfig = connectionString
    ? {
          connectionString,
          ssl: useSsl ? { rejectUnauthorized: false } : false
      }
    : {
          host: process.env.PGHOST || "localhost",
          user: process.env.PGUSER || "postgres",
          password: process.env.PGPASSWORD || "postgres",
          database: process.env.PGDATABASE || "expense_bot",
          port: parseInt(process.env.PGPORT || "5432", 10),
          ssl: useSsl ? { rejectUnauthorized: false } : false
      }

const pool = new Pool(poolConfig)

const BULAN = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember"
]

function formatIndonesianDate(date) {
    return `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`
}

function parseIndonesianDate(value) {
    if (!value) return new Date(0)

    const parts = String(value).trim().split(" ")
    if (parts.length !== 3) return new Date(value)

    const day = parseInt(parts[0], 10)
    const month = BULAN.indexOf(parts[1])
    const year = parseInt(parts[2], 10)

    return new Date(year, month, day)
}

function toIsoDate(value) {
    if (!value) {
        const now = new Date()
        return now.toISOString().slice(0, 10)
    }

    if (value instanceof Date) {
        const year = value.getFullYear()
        const month = String(value.getMonth() + 1).padStart(2, "0")
        const day = String(value.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
    }

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10)
    }

    const parsed = parseIndonesianDate(value)
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Tanggal tidak valid: ${value}`)
    }

    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, "0")
    const day = String(parsed.getDate()).padStart(2, "0")

    return `${year}-${month}-${day}`
}

let isInitialized = false
let initPromise = null

async function initDatabase() {
    if (isInitialized) return
    if (initPromise) return initPromise

    initPromise = (async () => {
        const client = await pool.connect()
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS expenses (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL DEFAULT 0,
                    chat_id BIGINT NOT NULL DEFAULT 0,
                    source VARCHAR(50) NOT NULL DEFAULT 'manual',
                    store_name VARCHAR(255) NOT NULL,
                    items TEXT NOT NULL,
                    total_amount BIGINT NOT NULL CHECK(total_amount >= 0),
                    expense_date DATE NOT NULL,
                    expense_date_label VARCHAR(100) NOT NULL,
                    category VARCHAR(100),
                    receipt_text TEXT,
                    import_hash VARCHAR(255) UNIQUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_expenses_user_chat_date
                ON expenses(user_id, chat_id, expense_date DESC);

                CREATE INDEX IF NOT EXISTS idx_expenses_source
                ON expenses(source, expense_date DESC);

                CREATE TABLE IF NOT EXISTS expense_items (
                    id SERIAL PRIMARY KEY,
                    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
                    line_number INTEGER NOT NULL,
                    item_name VARCHAR(255) NOT NULL,
                    quantity INTEGER,
                    line_total BIGINT,
                    raw_text TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_expense_items_expense_id
                ON expense_items(expense_id, line_number ASC);
            `)
            isInitialized = true
        } finally {
            client.release()
        }
    })()

    return initPromise
}

function normalizeExpense(data = {}) {
    const totalAmount = Number(String(data.total ?? 0).replace(/[^\d-]/g, ""))
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        throw new Error("Nominal pengeluaran tidak valid.")
    }

    const expenseDate = toIsoDate(data.expenseDate || data.tanggal)
    const dateForLabel = new Date(`${expenseDate}T00:00:00`)

    return {
        userId: Number(data.userId || 0),
        chatId: Number(data.chatId || 0),
        source: data.source || "manual",
        storeName: data.toko || "Unknown",
        items: data.items || "",
        totalAmount,
        expenseDate,
        expenseDateLabel: data.tanggal || formatIndonesianDate(dateForLabel),
        category: data.category || null,
        receiptText: data.receiptText || null,
        importHash: data.importHash || null
    }
}

async function addExpense(data) {
    await initDatabase()
    const payload = normalizeExpense(data)

    const insertExpenseQuery = `
        INSERT INTO expenses (
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
            import_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (import_hash) DO NOTHING
        RETURNING id;
    `

    const values = [
        payload.userId,
        payload.chatId,
        payload.source,
        payload.storeName,
        payload.items,
        payload.totalAmount,
        payload.expenseDate,
        payload.expenseDateLabel,
        payload.category,
        payload.receiptText,
        payload.importHash
    ]

    const result = await pool.query(insertExpenseQuery, values)
    const insertedRow = result.rows[0]
    const expenseId = insertedRow ? insertedRow.id : 0

    if (expenseId && Array.isArray(data.itemDetails) && data.itemDetails.length > 0) {
        for (const item of data.itemDetails) {
            await pool.query(
                `
                INSERT INTO expense_items (
                    expense_id,
                    line_number,
                    item_name,
                    quantity,
                    line_total,
                    raw_text
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `,
                [
                    expenseId,
                    Number(item.lineNumber || 0),
                    item.name || item.itemName || "Unknown",
                    item.quantity ?? null,
                    item.lineTotal ?? null,
                    item.rawText || null
                ]
            )
        }
    }

    return {
        id: expenseId,
        inserted: Boolean(expenseId)
    }
}

async function getExpenses() {
    await initDatabase()
    const query = `
        SELECT
            id,
            user_id AS "userId",
            chat_id AS "chatId",
            source,
            store_name AS toko,
            items,
            total_amount AS total,
            TO_CHAR(expense_date, 'YYYY-MM-DD') AS "tanggalIso",
            expense_date_label AS tanggal,
            category,
            receipt_text AS "receiptText",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM expenses
        ORDER BY expense_date ASC, id ASC
    `
    const result = await pool.query(query)
    return result.rows.map(row => ({
        ...row,
        total: Number(row.total)
    }))
}

async function getExpenseItems(expenseId) {
    await initDatabase()
    const query = `
        SELECT
            id,
            expense_id AS "expenseId",
            line_number AS "lineNumber",
            item_name AS "itemName",
            quantity,
            line_total AS "lineTotal",
            raw_text AS "rawText",
            created_at AS "createdAt"
        FROM expense_items
        WHERE expense_id = $1
        ORDER BY line_number ASC, id ASC
    `
    const result = await pool.query(query, [expenseId])
    return result.rows.map(row => ({
        ...row,
        lineTotal: row.lineTotal !== null ? Number(row.lineTotal) : null
    }))
}

function getDatabaseInfo() {
    return {
        type: "PostgreSQL",
        url: connectionString ? "(configured via DATABASE_URL)" : `postgres://${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "expense_bot"}`,
        table: "expenses",
        columns: [
            "id",
            "user_id",
            "chat_id",
            "source",
            "store_name",
            "items",
            "total_amount",
            "expense_date",
            "expense_date_label",
            "category",
            "receipt_text",
            "import_hash",
            "created_at",
            "updated_at"
        ],
        detailTable: "expense_items"
    }
}

module.exports = {
    pool,
    initDatabase,
    addExpense,
    getExpenses,
    getExpenseItems,
    getDatabaseInfo,
    formatIndonesianDate,
    parseIndonesianDate,
    toIsoDate
}
