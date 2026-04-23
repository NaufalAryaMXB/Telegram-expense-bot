require("dotenv").config()

const fs = require("fs")
const path = require("path")
const { DatabaseSync } = require("node:sqlite")

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "expense-bot.sqlite")

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

function ensureDatabaseDirectory() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
}

function formatIndonesianDate(date) {
    return `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`
}

function parseIndonesianDate(value) {
    if (!value) return new Date(0)

    const parts = value.split(" ")
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

    if (value instanceof Date) return value.toISOString().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

    const parsed = parseIndonesianDate(value)
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Tanggal tidak valid: ${value}`)
    }

    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, "0")
    const day = String(parsed.getDate()).padStart(2, "0")

    return `${year}-${month}-${day}`
}

ensureDatabaseDirectory()

const db = new DatabaseSync(DB_PATH)

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 0,
        chat_id INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        store_name TEXT NOT NULL,
        items TEXT NOT NULL,
        total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
        expense_date TEXT NOT NULL,
        expense_date_label TEXT NOT NULL,
        category TEXT,
        receipt_text TEXT,
        import_hash TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user_chat_date
    ON expenses(user_id, chat_id, expense_date DESC);

    CREATE INDEX IF NOT EXISTS idx_expenses_source
    ON expenses(source, expense_date DESC);

    CREATE TABLE IF NOT EXISTS expense_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expense_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        quantity INTEGER,
        line_total INTEGER,
        raw_text TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_expense_items_expense_id
    ON expense_items(expense_id, line_number ASC);
`)

const insertExpenseStatement = db.prepare(`
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
    ) VALUES (
        @userId,
        @chatId,
        @source,
        @storeName,
        @items,
        @totalAmount,
        @expenseDate,
        @expenseDateLabel,
        @category,
        @receiptText,
        @importHash
    )
    ON CONFLICT(import_hash) DO NOTHING
`)

const selectExpensesStatement = db.prepare(`
    SELECT
        id,
        user_id AS userId,
        chat_id AS chatId,
        source,
        store_name AS toko,
        items,
        total_amount AS total,
        expense_date AS tanggalIso,
        expense_date_label AS tanggal,
        category,
        receipt_text AS receiptText,
        created_at AS createdAt,
        updated_at AS updatedAt
    FROM expenses
    ORDER BY expense_date ASC, id ASC
`)

const insertExpenseItemStatement = db.prepare(`
    INSERT INTO expense_items (
        expense_id,
        line_number,
        item_name,
        quantity,
        line_total,
        raw_text
    ) VALUES (
        @expenseId,
        @lineNumber,
        @itemName,
        @quantity,
        @lineTotal,
        @rawText
    )
`)

const selectExpenseItemsStatement = db.prepare(`
    SELECT
        id,
        expense_id AS expenseId,
        line_number AS lineNumber,
        item_name AS itemName,
        quantity,
        line_total AS lineTotal,
        raw_text AS rawText,
        created_at AS createdAt
    FROM expense_items
    WHERE expense_id = ?
    ORDER BY line_number ASC, id ASC
`)

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
    const payload = normalizeExpense(data)
    const result = insertExpenseStatement.run(payload)
    const expenseId = Number(result.lastInsertRowid || 0)

    if (result.changes > 0 && Array.isArray(data.itemDetails)) {
        for (const item of data.itemDetails) {
            insertExpenseItemStatement.run({
                expenseId,
                lineNumber: Number(item.lineNumber || 0),
                itemName: item.name || item.itemName || "Unknown",
                quantity: item.quantity ?? null,
                lineTotal: item.lineTotal ?? null,
                rawText: item.rawText || null
            })
        }
    }

    return {
        id: expenseId,
        inserted: result.changes > 0
    }
}

async function getExpenses() {
    return selectExpensesStatement.all()
}

async function getExpenseItems(expenseId) {
    return selectExpenseItemsStatement.all(expenseId)
}

function getDatabaseInfo() {
    return {
        path: DB_PATH,
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
    addExpense,
    getExpenses,
    getExpenseItems,
    getDatabaseInfo,
    formatIndonesianDate,
    parseIndonesianDate
}
