require("dotenv").config()

const crypto = require("crypto")
const { google } = require("googleapis")
const { addExpense, getDatabaseInfo } = require("../database")

const keyFile =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION ||
    "./expense-bot-489703-3e2e99c42b3e.json"

const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
})

const sheets = google.sheets({
    version: "v4",
    auth
})

async function main() {
    const range = process.env.SHEET_RANGE || "Sheet1!A46:D"
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range
    })

    const rows = res.data.values || []
    let inserted = 0
    let skipped = 0

    for (const row of rows) {
        if (!row || row.length < 4 || row[0] === "Tanggal") continue

        const importHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(row))
            .digest("hex")

        const result = await addExpense({
            source: "sheet_import",
            toko: row[1] || "Imported",
            items: row[2] || "",
            total: row[3] || "0",
            tanggal: row[0],
            importHash
        })

        if (result.inserted) inserted += 1
        else skipped += 1
    }

    const info = getDatabaseInfo()

    console.log(`Import selesai.`)
    console.log(`Database: ${info.path}`)
    console.log(`Range: ${range}`)
    console.log(`Berhasil diimport: ${inserted}`)
    console.log(`Dilewati (duplikat): ${skipped}`)
}

main().catch((err) => {
    console.error("Import gagal:", err.message)
    process.exitCode = 1
})
