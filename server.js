require("dotenv").config()

const express = require("express")
const cors = require("cors")
const cookieParser = require("cookie-parser")
const jwt = require("jsonwebtoken")
const path = require("path")
const {
    pool,
    initDatabase,
    addExpense,
    getExpenseItems,
    formatIndonesianDate,
    toIsoDate
} = require("./database")

const app = express()
const PORT = process.env.PORT || 3000
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin123"
const JWT_SECRET = process.env.JWT_SECRET || "expense_bot_secret_jwt_key_2026"

app.use(cors())
app.use(express.json())
app.use(cookieParser())
app.use(express.static(path.join(__dirname, "public")))

// Auth Middleware
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization
    const token =
        (authHeader && authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : null) || req.cookies?.token

    if (!token) {
        return res.status(401).json({ error: "Sesi tidak valid atau belum login." })
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        req.user = decoded
        next()
    } catch (err) {
        return res.status(401).json({ error: "Token kadaluarsa atau tidak valid." })
    }
}

// -------------------------------------------------------------
// AUTH ENDPOINTS
// -------------------------------------------------------------

app.post("/api/auth/login", (req, res) => {
    const { password } = req.body

    if (!password || password !== DASHBOARD_PASSWORD) {
        return res.status(401).json({ error: "Password yang Anda masukkan salah." })
    }

    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" })

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    })

    return res.json({
        success: true,
        token,
        message: "Login berhasil."
    })
})

app.get("/api/auth/check", requireAuth, (req, res) => {
    res.json({ authenticated: true })
})

app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token")
    res.json({ success: true, message: "Berhasil logout." })
})

// -------------------------------------------------------------
// DATA & ANALYTICS ENDPOINTS (PROTECTED)
// -------------------------------------------------------------

// 1. Get Distinct Months
app.get("/api/months", requireAuth, async (req, res) => {
    try {
        await initDatabase()
        const query = `
            SELECT DISTINCT TO_CHAR(expense_date, 'YYYY-MM') AS month
            FROM expenses
            ORDER BY month DESC;
        `
        const result = await pool.query(query)
        const months = result.rows.map((r) => r.month)

        const currentMonth = new Date().toISOString().slice(0, 7)
        if (!months.includes(currentMonth)) {
            months.unshift(currentMonth)
        }

        res.json({ months })
    } catch (err) {
        console.error("Error fetching months:", err)
        res.status(500).json({ error: "Gagal mengambil daftar bulan." })
    }
})

// 2. Get KPI Stats
app.get("/api/stats", requireAuth, async (req, res) => {
    try {
        await initDatabase()
        const targetMonth = req.query.month || new Date().toISOString().slice(0, 7)

        // Hitung bulan sebelumnya untuk komparasi
        const [year, month] = targetMonth.split("-").map(Number)
        const prevDate = new Date(year, month - 2, 1)
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`

        // Total bulan ini
        const currentStatsQuery = `
            SELECT 
                COUNT(*) AS total_tx,
                COALESCE(SUM(total_amount), 0) AS total_amount,
                COALESCE(AVG(total_amount), 0) AS avg_amount,
                COUNT(DISTINCT expense_date) AS active_days
            FROM expenses
            WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1;
        `
        const currentStats = await pool.query(currentStatsQuery, [targetMonth])
        const current = currentStats.rows[0]

        // Total bulan lalu
        const prevStatsQuery = `
            SELECT COALESCE(SUM(total_amount), 0) AS total_amount
            FROM expenses
            WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1;
        `
        const prevStats = await pool.query(prevStatsQuery, [prevMonth])
        const prev = prevStats.rows[0]

        // Top Merchant
        const topStoreQuery = `
            SELECT store_name, COUNT(*) as tx_count, SUM(total_amount) as total_spent
            FROM expenses
            WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
            GROUP BY store_name
            ORDER BY total_spent DESC
            LIMIT 1;
        `
        const topStoreRes = await pool.query(topStoreQuery, [targetMonth])
        const topStore = topStoreRes.rows[0] || { store_name: "-", total_spent: 0, tx_count: 0 }

        const currentTotal = Number(current.total_amount)
        const prevTotal = Number(prev.total_amount)
        let percentChange = 0
        if (prevTotal > 0) {
            percentChange = Math.round(((currentTotal - prevTotal) / prevTotal) * 100)
        }

        const daysCount = Number(current.active_days) || 1
        const dailyAverage = Math.round(currentTotal / daysCount)

        res.json({
            month: targetMonth,
            prevMonth,
            totalSpent: currentTotal,
            prevTotalSpent: prevTotal,
            percentChange,
            totalTransactions: Number(current.total_tx),
            dailyAverage,
            topStore: {
                name: topStore.store_name,
                total: Number(topStore.total_spent),
                count: Number(topStore.tx_count)
            }
        })
    } catch (err) {
        console.error("Error fetching stats:", err)
        res.status(500).json({ error: "Gagal mengambil statistik." })
    }
})

// 3. Charts Data: Daily Trend
app.get("/api/charts/daily", requireAuth, async (req, res) => {
    try {
        await initDatabase()
        const targetMonth = req.query.month || new Date().toISOString().slice(0, 7)

        const query = `
            SELECT 
                TO_CHAR(expense_date, 'YYYY-MM-DD') AS date,
                TO_CHAR(expense_date, 'DD') AS day,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
            FROM expenses
            WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
            GROUP BY expense_date
            ORDER BY expense_date ASC;
        `
        const result = await pool.query(query, [targetMonth])
        res.json({
            month: targetMonth,
            daily: result.rows.map((r) => ({
                date: r.date,
                day: Number(r.day),
                total: Number(r.total),
                count: Number(r.count)
            }))
        })
    } catch (err) {
        console.error("Error fetching daily chart data:", err)
        res.status(500).json({ error: "Gagal mengambil data grafik harian." })
    }
})

// 4. Charts Data: Category & Store Breakdown
app.get("/api/charts/breakdown", requireAuth, async (req, res) => {
    try {
        await initDatabase()
        const targetMonth = req.query.month || new Date().toISOString().slice(0, 7)

        // Breakdown Kategori
        const catQuery = `
            SELECT 
                COALESCE(category, 'Lainnya') AS category,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
            FROM expenses
            WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
            GROUP BY category
            ORDER BY total DESC;
        `
        const catRes = await pool.query(catQuery, [targetMonth])

        // Top 5 Stores
        const storeQuery = `
            SELECT 
                store_name,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
            FROM expenses
            WHERE TO_CHAR(expense_date, 'YYYY-MM') = $1
            GROUP BY store_name
            ORDER BY total DESC
            LIMIT 5;
        `
        const storeRes = await pool.query(storeQuery, [targetMonth])

        res.json({
            categories: catRes.rows.map((r) => ({
                category: r.category,
                total: Number(r.total),
                count: Number(r.count)
            })),
            stores: storeRes.rows.map((r) => ({
                store: r.store_name,
                total: Number(r.total),
                count: Number(r.count)
            }))
        })
    } catch (err) {
        console.error("Error fetching breakdown chart data:", err)
        res.status(500).json({ error: "Gagal mengambil breakdown kategori & toko." })
    }
})

// 5. Get Expenses with Search, Filter & Pagination
app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
        await initDatabase()
        const targetMonth = req.query.month
        const search = req.query.search ? `%${req.query.search.trim()}%` : null
        const source = req.query.source || null
        const category = req.query.category || null
        const page = Math.max(1, parseInt(req.query.page || "1", 10))
        const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || "20", 10)))
        const offset = (page - 1) * limit

        let conditions = []
        let params = []
        let paramIndex = 1

        if (targetMonth) {
            conditions.push(`TO_CHAR(expense_date, 'YYYY-MM') = $${paramIndex++}`)
            params.push(targetMonth)
        }

        if (search) {
            conditions.push(
                `(store_name ILIKE $${paramIndex} OR items ILIKE $${paramIndex} OR receipt_text ILIKE $${paramIndex})`
            )
            params.push(search)
            paramIndex++
        }

        if (source && source !== "all") {
            conditions.push(`source = $${paramIndex++}`)
            params.push(source)
        }

        if (category && category !== "all") {
            conditions.push(`category = $${paramIndex++}`)
            params.push(category)
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

        // Count Total
        const countQuery = `SELECT COUNT(*) FROM expenses ${whereClause}`
        const countRes = await pool.query(countQuery, params)
        const total = parseInt(countRes.rows[0].count, 10)

        // Fetch paginated data
        const dataQuery = `
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
                created_at AS "createdAt"
            FROM expenses
            ${whereClause}
            ORDER BY expense_date DESC, id DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `
        params.push(limit, offset)

        const dataRes = await pool.query(dataQuery, params)

        res.json({
            expenses: dataRes.rows.map((row) => ({
                ...row,
                total: Number(row.total)
            })),
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        })
    } catch (err) {
        console.error("Error fetching expenses list:", err)
        res.status(500).json({ error: "Gagal mengambil daftar pengeluaran." })
    }
})

// 6. Get Single Expense Details & Items
app.get("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)
        const expenseQuery = `
            SELECT 
                id,
                source,
                store_name AS toko,
                items,
                total_amount AS total,
                TO_CHAR(expense_date, 'YYYY-MM-DD') AS "tanggalIso",
                expense_date_label AS tanggal,
                category,
                receipt_text AS "receiptText",
                created_at AS "createdAt"
            FROM expenses
            WHERE id = $1
        `
        const expRes = await pool.query(expenseQuery, [id])
        if (expRes.rows.length === 0) {
            return res.status(404).json({ error: "Transaksi tidak ditemukan." })
        }

        const expense = expRes.rows[0]
        const items = await getExpenseItems(id)

        res.json({
            ...expense,
            total: Number(expense.total),
            itemDetails: items
        })
    } catch (err) {
        console.error("Error fetching single expense:", err)
        res.status(500).json({ error: "Gagal mengambil detail transaksi." })
    }
})

// 7. Add New Expense
app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
        const { toko, items, total, tanggal, category, source, itemDetails } = req.body

        if (!total || isNaN(Number(total)) || Number(total) < 0) {
            return res.status(400).json({ error: "Nominal pengeluaran harus berupa angka positif." })
        }

        const result = await addExpense({
            source: source || "dashboard",
            toko: toko || "Manual",
            items: items || "-",
            total: Number(total),
            tanggal: tanggal || formatIndonesianDate(new Date()),
            category: category || null,
            itemDetails: Array.isArray(itemDetails) ? itemDetails : []
        })

        res.json({ success: true, id: result.id, message: "Pengeluaran berhasil ditambahkan." })
    } catch (err) {
        console.error("Error adding expense:", err)
        res.status(500).json({ error: err.message || "Gagal menambah transaksi." })
    }
})

// 8. Update Expense
app.put("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)
        const { toko, items, total, tanggal, category } = req.body

        if (!total || isNaN(Number(total)) || Number(total) < 0) {
            return res.status(400).json({ error: "Nominal pengeluaran tidak valid." })
        }

        const isoDate = toIsoDate(tanggal)
        const dateForLabel = new Date(`${isoDate}T00:00:00`)
        const label = formatIndonesianDate(dateForLabel)

        const updateQuery = `
            UPDATE expenses
            SET 
                store_name = $1,
                items = $2,
                total_amount = $3,
                expense_date = $4,
                expense_date_label = $5,
                category = $6,
                updated_at = NOW()
            WHERE id = $7
            RETURNING id;
        `
        const values = [
            toko || "Manual",
            items || "-",
            Number(total),
            isoDate,
            label,
            category || null,
            id
        ]

        const result = await pool.query(updateQuery, values)
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Transaksi tidak ditemukan." })
        }

        res.json({ success: true, message: "Transaksi berhasil diperbarui." })
    } catch (err) {
        console.error("Error updating expense:", err)
        res.status(500).json({ error: err.message || "Gagal memperbarui transaksi." })
    }
})

// 9. Delete Expense
app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)
        const deleteQuery = `DELETE FROM expenses WHERE id = $1 RETURNING id;`
        const result = await pool.query(deleteQuery, [id])

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Transaksi tidak ditemukan." })
        }

        res.json({ success: true, message: "Transaksi berhasil dihapus." })
    } catch (err) {
        console.error("Error deleting expense:", err)
        res.status(500).json({ error: "Gagal menghapus transaksi." })
    }
})

// Start Server
app.listen(PORT, async () => {
    try {
        await initDatabase()
        console.log(`\n=================================================`)
        console.log(`🌐 Expense Bot Dashboard Server Berjalan!`)
        console.log(`🔗 URL: http://localhost:${PORT}`)
        console.log(`🔑 Password Default: ${DASHBOARD_PASSWORD}`)
        console.log(`=================================================\n`)
    } catch (err) {
        console.error("Gagal inisialisasi database di server:", err.message)
    }
})
