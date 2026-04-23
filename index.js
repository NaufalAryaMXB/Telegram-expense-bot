require("dotenv").config()

const TelegramBot = require("node-telegram-bot-api")
const { addExpense, getExpenses, getDatabaseInfo, formatIndonesianDate, parseIndonesianDate } = require("./database")
const { analyzeReceipt } = require("./gemini")
const downloadImage = require("./utils/downloadImage")
const { parseReceiptItems, parseCurrency } = require("./parser")

const OWNER_ID = 6172060334
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const userState = {}

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

function formatUserError(err, fallbackMessage) {
    const message = err?.message || ""

    if (message.includes("Google Sheets tidak bisa dihubungi")) {
        return "Google Sheets sedang tidak bisa dihubungi. Cek koneksi internet atau DNS lalu coba lagi."
    }

    if (message.includes("Autentikasi Google gagal")) {
        return "Autentikasi Google gagal. Cek tanggal dan jam perangkat, lalu pastikan file service account masih valid."
    }

    if (message.includes("Nominal pengeluaran tidak valid")) {
        return "❌ Nominal pengeluaran tidak valid."
    }

    return fallbackMessage
}

function buildReceiptExpenseRows({ toko, total, itemDetails, basePayload }) {
    if (!Array.isArray(itemDetails) || itemDetails.length === 0) {
        return [
            {
                ...basePayload,
                toko,
                items: "Item struk tidak terbaca",
                total
            }
        ]
    }

    const grandTotal = parseCurrency(total)
    const knownTotal = itemDetails.reduce((sum, item) => sum + (item.lineTotal || 0), 0)
    const missingItems = itemDetails.filter((item) => !item.lineTotal)
    const remainder = Math.max(grandTotal - knownTotal, 0)
    const sharedAmount = missingItems.length > 0 ? Math.floor(remainder / missingItems.length) : 0
    let leftover = missingItems.length > 0 ? remainder - (sharedAmount * missingItems.length) : 0

    return itemDetails.map((item) => {
        let itemTotal = item.lineTotal || 0

        if (!item.lineTotal && missingItems.length > 0) {
            itemTotal = sharedAmount
            if (leftover > 0) {
                itemTotal += 1
                leftover -= 1
            }
        }

        return {
            ...basePayload,
            toko,
            items: item.name,
            total: String(itemTotal),
            receiptText: item.rawText
        }
    })
}

const databaseInfo = getDatabaseInfo()
console.log(`Bot berjalan dengan SQLite di ${databaseInfo.path}`)

bot.on("polling_error", (err) => {
    console.log("Polling error:", err?.message || err)
})

bot.onText(/^\/start$/, (msg) => {
    const chatId = msg.chat.id

    bot.sendMessage(
        chatId,
        `Halo 👋

Saya bisa membantu mencatat pengeluaran kamu.

Kamu bisa:
• ketik pengeluaran, contoh: beli kopi 15000
• kirim foto struk

Ketik /help untuk melihat panduan lengkap.`
    )
})

bot.on("message", async (msg) => {
    if (msg.from.id !== OWNER_ID) {
        bot.sendMessage(msg.chat.id, "Bot ini hanya untuk penggunaan pribadi.")
        return
    }

    const chatId = msg.chat.id
    const text = msg.text

    if (!text || text.startsWith("/")) return

    if (userState[chatId] === "WAITING_MONTH") {
        const match = text.match(/^(\d{2})-(\d{4})$/)

        if (!match) {
            bot.sendMessage(chatId, "❌ Format salah. Gunakan MM-YYYY.")
            return
        }

        try {
            const month = match[1]
            const year = match[2]
            const monthName = BULAN[Number(month) - 1]
            const rows = await getExpenses()

            let total = 0
            let list = []

            rows.forEach((row) => {
                if (!row?.tanggal) return

                if (row.tanggal.includes(`${monthName} ${year}`)) {
                    const amount = parseCurrency(row.total)
                    total += amount
                    list.push(`- ${row.items} - Rp ${amount.toLocaleString("id-ID")}`)
                }
            })

            bot.sendMessage(
                chatId,
                `📊 Pengeluaran ${monthName} ${year}

💰 Total: Rp ${total.toLocaleString("id-ID")}

${list.length ? list.join("\n") : "Tidak ada data."}`
            )
        } catch (err) {
            console.log(err)
            bot.sendMessage(chatId, formatUserError(err, "❌ Gagal mengambil data bulanan."))
        } finally {
            delete userState[chatId]
        }

        return
    }

    const parts = text.split(" ")
    const total = parts.pop()

    if (isNaN(total)) {
        bot.sendMessage(chatId, "❌ Format salah. Contoh: beli kopi 15000")
        return
    }

    const items = parts.join(" ")

    try {
        await addExpense({
            userId: msg.from.id,
            chatId,
            source: "manual",
            toko: "Manual",
            total,
            items,
            tanggal: formatIndonesianDate(new Date())
        })

        bot.sendMessage(
            chatId,
            `✅ Tersimpan!

📝 ${items}
💰 Rp ${Number(total).toLocaleString("id-ID")}`
        )
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, formatUserError(err, "❌ Gagal menyimpan."))
    }
})

bot.on("photo", async (msg) => {
    const chatId = msg.chat.id

    bot.sendMessage(chatId, "📷 Membaca struk...")

    try {
        const photo = msg.photo[msg.photo.length - 1]
        const file = await bot.getFile(photo.file_id)
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
        const base64 = await downloadImage(fileUrl)
        const result = await analyzeReceipt(base64)

        bot.sendMessage(chatId, `📄 Hasil scan:\n\n${result}`)

        const toko = result.match(/TOKO:\s*(.*)/)?.[1] || "Unknown"
        const totalText = result.match(/TOTAL:\s*(.*)/)?.[1] || "0"
        const total = totalText.replace(/[^\d]/g, "")
        const itemsRaw = result.match(/ITEMS:\s*([\s\S]*?)TANGGAL:/)?.[1] || ""
        const itemDetails = parseReceiptItems(itemsRaw)
        const expenseRows = buildReceiptExpenseRows({
            toko,
            total,
            itemDetails,
            basePayload: {
                userId: msg.from.id,
                chatId,
                source: "receipt",
                tanggal: formatIndonesianDate(new Date()),
                receiptText: result
            }
        })

        for (const row of expenseRows) {
            await addExpense(row)
        }

        bot.sendMessage(
            chatId,
            `✅ Struk berhasil disimpan ke database SQLite.

Item tersimpan: ${expenseRows.length}`
        )
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, formatUserError(err, "❌ Gagal membaca struk."))
    }
})

bot.onText(/^\/today$/, async (msg) => {
    if (msg.from.id !== OWNER_ID) {
        bot.sendMessage(msg.chat.id, "Bot ini hanya untuk pemilik.")
        return
    }

    const chatId = msg.chat.id

    try {
        const rows = await getExpenses()
        const todayStr = formatIndonesianDate(new Date())

        let total = 0
        let list = []

        rows.forEach((row) => {
            if (!row?.tanggal) return

            if (row.tanggal === todayStr) {
                const amount = parseCurrency(row.total)
                total += amount
                list.push(`- ${row.items} - Rp ${amount.toLocaleString("id-ID")}`)
            }
        })

        bot.sendMessage(
            chatId,
            `📊 Pengeluaran Hari Ini

💰 Total: Rp ${total.toLocaleString("id-ID")}

${list.length ? list.join("\n") : "Belum ada pengeluaran."}`
        )
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, formatUserError(err, "❌ Gagal mengambil data hari ini."))
    }
})

bot.onText(/^\/month$/, async (msg) => {
    if (msg.from.id !== OWNER_ID) {
        bot.sendMessage(msg.chat.id, "Bot ini hanya untuk pemilik.")
        return
    }

    const chatId = msg.chat.id

    try {
        const rows = await getExpenses()
        const now = new Date()
        const monthYear = `${BULAN[now.getMonth()]} ${now.getFullYear()}`

        let total = 0

        rows.forEach((row) => {
            if (!row?.tanggal) return
            if (row.tanggal.includes(monthYear)) total += parseCurrency(row.total)
        })

        bot.sendMessage(
            chatId,
            `📊 Pengeluaran Bulan Ini

💰 Total: Rp ${total.toLocaleString("id-ID")}`
        )
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, formatUserError(err, "❌ Gagal mengambil data bulan ini."))
    }
})

bot.onText(/^\/week$/, async (msg) => {
    if (msg.from.id !== OWNER_ID) {
        bot.sendMessage(msg.chat.id, "Bot ini hanya untuk pemilik.")
        return
    }

    const chatId = msg.chat.id

    try {
        const rows = await getExpenses()
        const now = new Date()
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(now.setDate(diff))
        monday.setHours(0, 0, 0, 0)

        let total = 0
        let list = []

        rows.forEach((row) => {
            if (!row?.tanggal) return

            const itemDate = parseIndonesianDate(row.tanggal)
            if (itemDate >= monday) {
                const amount = parseCurrency(row.total)
                total += amount
                list.push(`- ${row.items} - Rp ${amount.toLocaleString("id-ID")}`)
            }
        })

        bot.sendMessage(
            chatId,
            `📊 Pengeluaran Minggu Ini

💰 Total: Rp ${total.toLocaleString("id-ID")}

${list.length ? list.join("\n") : "Belum ada pengeluaran."}`
        )
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, formatUserError(err, "❌ Gagal mengambil data minggu ini."))
    }
})

bot.onText(/^\/help$/, (msg) => {
    const chatId = msg.chat.id

    bot.sendMessage(
        chatId,
        `📖 *Panduan Penggunaan Expense Tracker*

Berikut cara menggunakan bot ini:

📝 *Input Manual*
Ketik pengeluaran seperti:
\`beli kopi 15000\`

📷 *Scan Struk*
Kirim foto struk, bot akan membaca otomatis.

📊 *Lihat Laporan*
/today - melihat pengeluaran hari ini
/month - melihat total pengeluaran bulan ini
/week - melihat total pengeluaran minggu ini
/monthlyexpense - melihat total pengeluaran bulan spesifik

💾 *Penyimpanan*
Data utama sekarang disimpan di database SQLite lokal.

💡 Tips:
Pastikan selalu menuliskan nominal di akhir pesan.`,
        { parse_mode: "Markdown" }
    )
})

bot.onText(/^\/monthlyexpense$/, (msg) => {
    if (msg.from.id !== OWNER_ID) {
        bot.sendMessage(msg.chat.id, "Bot ini hanya untuk pemilik.")
        return
    }

    const chatId = msg.chat.id
    userState[chatId] = "WAITING_MONTH"

    bot.sendMessage(
        chatId,
        `📅 Masukkan bulan dan tahun

Format:
MM-YYYY

Contoh:
03-2026`
    )
})
