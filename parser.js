function parseCurrency(value) {
    const normalized = String(value || "").replace(/[^\d-]/g, "")
    return normalized ? Number(normalized) : 0
}

function cleanItemName(value) {
    return String(value || "")
        .replace(/[-*]/g, "")
        .replace(/\s+/g, " ")
        .trim()
}

function parseReceiptItems(itemsRaw) {
    return String(itemsRaw || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const quantityMatch = line.match(/\((\d+)\s*(?:pcs?|pc|x)\)/i) || line.match(/(\d+)\s*x/i)
            const unitPriceMatch = line.match(/@\s*([\d.,]+)/i)
            const explicitTotalMatch = line.match(/=\s*([\d.,]+)/)
            const quantity = quantityMatch ? Number(quantityMatch[1]) : null
            const unitPrice = unitPriceMatch ? parseCurrency(unitPriceMatch[1]) : null
            const explicitTotal = explicitTotalMatch ? parseCurrency(explicitTotalMatch[1]) : null
            const lineTotal = explicitTotal ?? (
                unitPrice !== null
                    ? unitPrice * (quantity || 1)
                    : null
            )

            return {
                lineNumber: index + 1,
                rawText: line,
                name: cleanItemName(
                    line
                        .replace(/\(.*?\)/g, "")
                        .replace(/=.*$/g, "")
                        .replace(/@\s*[\d.,]+.*$/i, "")
                        .replace(/\d+\s*x.*$/i, "")
                ),
                quantity,
                unitPrice,
                lineTotal
            }
        })
        .filter((item) => item.name.length > 0)
}

module.exports = {
    parseCurrency,
    parseReceiptItems
}
