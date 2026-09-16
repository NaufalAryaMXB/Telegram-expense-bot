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
            const structuredErrorMatch = line.match(/^[*-]?\s*(.+?)\s*\|\s*qty\s*=\s*([\d.,-]+)\s*\|\s*total\s*=\s*(ERROR)/i)
            if (structuredErrorMatch) {
                return {
                    lineNumber: index + 1,
                    rawText: line,
                    name: cleanItemName(structuredErrorMatch[1]),
                    quantity: parseCurrency(structuredErrorMatch[2]),
                    unitPrice: null,
                    lineTotal: null
                }
            }

            const structuredMatch = line.match(/^[*-]?\s*(.+?)\s*\|\s*qty\s*=\s*([\d.,-]+)\s*\|\s*total\s*=\s*([\d.,-]+)/i)
            if (structuredMatch) {
                return {
                    lineNumber: index + 1,
                    rawText: line,
                    name: cleanItemName(structuredMatch[1]),
                    quantity: parseCurrency(structuredMatch[2]),
                    unitPrice: null,
                    lineTotal: parseCurrency(structuredMatch[3])
                }
            }

            const discountSummaryMatch = line.match(/^[*-]?\s*(.+?disc.*?)\s*:\s*-?\s*([\d.,]+)/i)
            if (discountSummaryMatch) {
                return {
                    lineNumber: index + 1,
                    rawText: line,
                    name: cleanItemName(discountSummaryMatch[1]),
                    quantity: 1,
                    unitPrice: null,
                    lineTotal: parseCurrency(discountSummaryMatch[2])
                }
            }

            const discountEqualsMatch = line.match(/^[*-]?\s*(.+?disc\.?)\s*=\s*-?\s*([\d.,]+)/i)
            if (discountEqualsMatch) {
                return {
                    lineNumber: index + 1,
                    rawText: line,
                    name: cleanItemName(discountEqualsMatch[1]),
                    quantity: 1,
                    unitPrice: null,
                    lineTotal: parseCurrency(discountEqualsMatch[2])
                }
            }

            const leadingQuantityMatch = line.match(/^(\d+)\s+/)
            const parenthesizedQuantityMatch = line.match(/\((\d+)\s*(?:pcs?|pc|x)\)/i)
            const multipliedQuantityMatch = line.match(/(\d+)\s*x/i)
            const bareTrailingNumberMatch = line.match(/\(([\d.,]+)\)\s*$/)
            const dashedTrailingTotalMatch = line.match(/\s-\s([\d.,]+)\s*$/)
            const inferredTrailingQuantityMatch =
                bareTrailingNumberMatch &&
                !line.includes("@") &&
                !dashedTrailingTotalMatch &&
                !line.includes("=") &&
                !leadingQuantityMatch &&
                parseCurrency(bareTrailingNumberMatch[1]) > 0 &&
                parseCurrency(bareTrailingNumberMatch[1]) <= 10
                    ? bareTrailingNumberMatch
                    : null
            const quantityMatch =
                parenthesizedQuantityMatch ||
                multipliedQuantityMatch ||
                leadingQuantityMatch ||
                inferredTrailingQuantityMatch
            const unitPriceMatch = line.match(/@\s*([\d.,]+)/i)
            const explicitTotalMatch = line.match(/=\s*([\d.,]+)/)
            const trailingTotalMatch =
                dashedTrailingTotalMatch ||
                (bareTrailingNumberMatch && !inferredTrailingQuantityMatch
                    ? bareTrailingNumberMatch
                    : null)
            const quantity = quantityMatch ? Number(quantityMatch[1]) : null
            const unitPrice = unitPriceMatch ? parseCurrency(unitPriceMatch[1]) : null
            const explicitTotal = explicitTotalMatch
                ? parseCurrency(explicitTotalMatch[1])
                : trailingTotalMatch
                    ? parseCurrency(trailingTotalMatch[1])
                    : null
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
                        .replace(/^\d+\s+/, "")
                        .replace(/\(.*?\)/g, "")
                        .replace(/=.*$/g, "")
                        .replace(/@\s*[\d.,]+.*$/i, "")
                        .replace(/\s-\s[\d.,]+\s*$/i, "")
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
