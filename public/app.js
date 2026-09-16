// ============================================================
// EXPENSEBOT : MINIMALIST LIGHT CLIENT ENGINE (STITCH CANVAS)
// ============================================================

const STATE = {
    token: localStorage.getItem("expensebot_token") || "",
    selectedMonth: "",
    monthsList: [],
    currentPage: 1,
    pageSize: 15,
    searchQuery: "",
    sourceFilter: "all",
    chart: null,
    currentTransactions: [],
    vaultTimerMinutes: 15,
    vaultTimerSeconds: 0,
    vaultTimerInterval: null
};

// Rupiah Formatter
const formatIDR = (num) => {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(num || 0);
};

// Compact Rupiah Formatter (e.g. 1.2jt, 500rb)
const formatCompactIDR = (num) => {
    const val = Number(num) || 0;
    if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}M`;
    if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}jt`;
    if (val >= 1_000) return `Rp ${(val / 1_000).toFixed(0)}rb`;
    return formatIDR(val);
};

// Category Palette for Minimalist Light UI
const CATEGORY_COLORS = {
    "Makanan": "#18181b",      // Zinc 900
    "Food": "#18181b",
    "Belanja": "#059669",      // Emerald 600
    "Groceries": "#059669",
    "Transportasi": "#3f3f46", // Zinc 700
    "Transport": "#3f3f46",
    "Tagihan": "#71717a",      // Zinc 500
    "Utilities": "#71717a",
    "Hiburan": "#a1a1aa",      // Zinc 400
    "Entertainment": "#a1a1aa",
    "Kesehatan": "#0284c7",    // Sky 600
    "Health": "#0284c7",
    "Lainnya": "#d4d4d8"       // Zinc 300
};

// Category Badges Styling
const getCategoryBadge = (category) => {
    const cat = category || "Lainnya";
    let bg = "bg-zinc-100 text-zinc-800 border-zinc-200";

    if (cat.includes("Makan") || cat.includes("Food")) {
        bg = "bg-amber-50 text-amber-800 border-amber-200/60";
    } else if (cat.includes("Belanja") || cat.includes("Groceries")) {
        bg = "bg-emerald-50 text-emerald-800 border-emerald-200/60";
    } else if (cat.includes("Transport")) {
        bg = "bg-blue-50 text-blue-800 border-blue-200/60";
    } else if (cat.includes("Tagihan") || cat.includes("Util")) {
        bg = "bg-purple-50 text-purple-800 border-purple-200/60";
    } else if (cat.includes("Hiburan")) {
        bg = "bg-rose-50 text-rose-800 border-rose-200/60";
    } else if (cat.includes("Kesehatan")) {
        bg = "bg-cyan-50 text-cyan-800 border-cyan-200/60";
    }

    return `<span class="px-2 py-0.5 border rounded-sm font-mono text-[10px] uppercase font-medium whitespace-nowrap ${bg}">${cat}</span>`;
};

// Source Pipeline Badge & Icon
const getSourcePipeline = (source) => {
    switch (source) {
        case "receipt":
            return `
                <div class="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                    <span class="material-symbols-outlined text-[15px] text-accent-emerald">document_scanner</span>
                    <span>AI Receipt</span>
                    <span class="text-accent-emerald font-semibold">99%</span>
                </div>
            `;
        case "manual":
            return `
                <div class="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                    <span class="material-symbols-outlined text-[15px] text-blue-600">chat</span>
                    <span>Telegram</span>
                </div>
            `;
        case "sheet_import":
            return `
                <div class="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                    <span class="material-symbols-outlined text-[15px] text-emerald-600">table_view</span>
                    <span>Google Sheet</span>
                </div>
            `;
        case "dashboard":
        default:
            return `
                <div class="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                    <span class="material-symbols-outlined text-[15px] text-zinc-600">language</span>
                    <span>Web Direct</span>
                </div>
            `;
    }
};

// ============================================================
// AUTHENTICATED FETCH HELPER
// ============================================================

async function apiFetch(endpoint, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...options.headers
    };

    if (STATE.token) {
        headers["Authorization"] = `Bearer ${STATE.token}`;
    }

    try {
        const res = await fetch(endpoint, { ...options, headers });

        if (res.status === 401) {
            handleLogout(false);
            throw new Error("Sesi vault telah berakhir. Silakan otentikasi ulang.");
        }

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || `HTTP error ${res.status}`);
        }

        return data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
}

// ============================================================
// AUTHENTICATION & VAULT LOGIC
// ============================================================

async function checkAuth() {
    const authScreen = document.getElementById("authScreen");
    const dashboardApp = document.getElementById("dashboardApp");

    if (!STATE.token) {
        authScreen.classList.remove("hidden");
        dashboardApp.classList.add("hidden");
        return;
    }

    try {
        await apiFetch("/api/auth/check");
        authScreen.classList.add("hidden");
        dashboardApp.classList.remove("hidden");
        initDashboard();
    } catch (err) {
        authScreen.classList.remove("hidden");
        dashboardApp.classList.add("hidden");
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById("passwordInput").value;
    const loginBtn = document.getElementById("loginBtn");
    const loginError = document.getElementById("loginError");
    const loginErrorMsg = document.getElementById("loginErrorMsg");

    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[16px]">sync</span><span>Mengautentikasi...</span>`;
    loginError.classList.add("hidden");

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Password salah");

        STATE.token = data.token;
        localStorage.setItem("expensebot_token", data.token);

        document.getElementById("authScreen").classList.add("hidden");
        document.getElementById("dashboardApp").classList.remove("hidden");
        showToast("Vault berhasil dibuka", "success");
        initDashboard();
    } catch (err) {
        loginError.classList.remove("hidden");
        loginErrorMsg.textContent = err.message || "Akses ditolak. Password salah.";
        showToast(err.message || "Gagal masuk vault", "error");
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">lock_open</span><span>Buka Vault</span>`;
    }
}

function handleLogout(userTriggered = true) {
    STATE.token = "";
    localStorage.removeItem("expensebot_token");
    if (STATE.vaultTimerInterval) clearInterval(STATE.vaultTimerInterval);

    document.getElementById("dashboardApp").classList.add("hidden");
    document.getElementById("authScreen").classList.remove("hidden");
    document.getElementById("passwordInput").value = "";

    if (userTriggered) {
        showToast("Vault telah terkunci dengan aman", "info");
    }
}

function startVaultTimer() {
    if (STATE.vaultTimerInterval) clearInterval(STATE.vaultTimerInterval);
    STATE.vaultTimerMinutes = 15;
    STATE.vaultTimerSeconds = 0;

    const timerElem = document.getElementById("vault-timer");

    STATE.vaultTimerInterval = setInterval(() => {
        if (STATE.vaultTimerSeconds === 0) {
            if (STATE.vaultTimerMinutes === 0) {
                clearInterval(STATE.vaultTimerInterval);
                handleLogout(false);
                return;
            }
            STATE.vaultTimerMinutes--;
            STATE.vaultTimerSeconds = 59;
        } else {
            STATE.vaultTimerSeconds--;
        }

        if (timerElem) {
            const formatted = (STATE.vaultTimerMinutes < 10 ? '0' : '') + STATE.vaultTimerMinutes + ':' + (STATE.vaultTimerSeconds < 10 ? '0' : '') + STATE.vaultTimerSeconds;
            timerElem.textContent = formatted;
        }
    }, 1000);
}

// ============================================================
// DASHBOARD INITIALIZATION
// ============================================================

async function initDashboard() {
    startVaultTimer();
    await loadMonthsList();
    await loadDashboardData();
}

async function loadMonthsList() {
    try {
        const data = await apiFetch("/api/months");
        STATE.monthsList = data.months || [];

        const select = document.getElementById("monthSelect");
        select.innerHTML = "";

        if (STATE.monthsList.length === 0) {
            const now = new Date();
            const curr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            STATE.monthsList = [curr];
        }

        STATE.monthsList.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = formatMonthLabel(m);
            select.appendChild(opt);
        });

        if (!STATE.selectedMonth || !STATE.monthsList.includes(STATE.selectedMonth)) {
            STATE.selectedMonth = STATE.monthsList[0];
        }

        select.value = STATE.selectedMonth;
    } catch (err) {
        console.error("Gagal memuat daftar bulan:", err);
    }
}

function formatMonthLabel(mStr) {
    if (!mStr) return "";
    const [year, month] = mStr.split("-");
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const monthName = months[parseInt(month, 10) - 1] || month;
    return `${monthName} ${year}`;
}

function changeMonthOffset(delta) {
    const currentIndex = STATE.monthsList.indexOf(STATE.selectedMonth);
    if (currentIndex === -1) return;

    // List is newest first (index 0 = newest)
    const newIndex = currentIndex - delta;
    if (newIndex >= 0 && newIndex < STATE.monthsList.length) {
        handleMonthChange(STATE.monthsList[newIndex]);
    }
}

function handleMonthChange(newMonth) {
    STATE.selectedMonth = newMonth;
    document.getElementById("monthSelect").value = newMonth;
    STATE.currentPage = 1;
    loadDashboardData();
}

async function loadDashboardData() {
    try {
        await Promise.all([
            loadStatsAndCharts(),
            loadTransactions()
        ]);
    } catch (err) {
        showToast(err.message || "Gagal memperbarui data dashboard", "error");
    }
}

// ============================================================
// KPI STATS & ANALYTICS LOADING
// ============================================================

async function loadStatsAndCharts() {
    try {
        const [statsData, dailyData, breakdownData] = await Promise.all([
            apiFetch(`/api/stats?month=${STATE.selectedMonth}`),
            apiFetch(`/api/charts/daily?month=${STATE.selectedMonth}`),
            apiFetch(`/api/charts/breakdown?month=${STATE.selectedMonth}`)
        ]);

        renderKPIs(statsData);
        renderDailyChart(dailyData.daily || []);
        renderCategoryBreakdown(breakdownData.categories || [], statsData.totalSpent || 0);
        renderTopMerchants(breakdownData.stores || []);
    } catch (err) {
        console.error("Error loading stats and charts:", err);
    }
}

function renderKPIs(stats) {
    const totalSpent = stats.totalSpent || 0;
    const dailyAverage = stats.dailyAverage || 0;
    const totalTransactions = stats.totalTransactions || 0;
    const percentChange = stats.percentChange ?? 0;
    const topStore = stats.topStore || { name: "-", total: 0, count: 0 };

    // 1. Total Spend
    document.getElementById("kpiTotalSpend").textContent = formatIDR(totalSpent);
    const trendBadge = document.getElementById("kpiTrendBadge");
    const trendIcon = document.getElementById("kpiTrendIcon");
    const trendContainer = document.getElementById("kpiTrendContainer");

    if (percentChange < 0) {
        trendIcon.textContent = "trending_down";
        trendBadge.textContent = `${Math.abs(percentChange)}% vs bulan lalu`;
        trendContainer.className = "flex items-center gap-1.5 font-mono text-[11px] text-accent-emerald font-medium";
    } else if (percentChange > 0) {
        trendIcon.textContent = "trending_up";
        trendBadge.textContent = `+${percentChange}% vs bulan lalu`;
        trendContainer.className = "flex items-center gap-1.5 font-mono text-[11px] text-accent-rose font-medium";
    } else {
        trendIcon.textContent = "horizontal_rule";
        trendBadge.textContent = `0% vs bulan lalu`;
        trendContainer.className = "flex items-center gap-1.5 font-mono text-[11px] text-text-muted font-medium";
    }

    // 2. Daily Pace
    document.getElementById("kpiDailyPace").textContent = formatIDR(dailyAverage);
    const dailyBar = document.getElementById("kpiDailyPaceBar");
    if (dailyBar) {
        const paceRatio = totalSpent > 0 ? Math.min(100, Math.max(15, (dailyAverage > 0 ? 60 : 0))) : 0;
        dailyBar.style.width = `${paceRatio}%`;
    }

    // 3. Reconciled Entries
    document.getElementById("kpiReconciledCount").textContent = totalTransactions;

    // 4. Top Outflow Node
    if (topStore && topStore.name && topStore.name !== "-") {
        document.getElementById("kpiTopMerchantName").textContent = topStore.name;
        document.getElementById("kpiTopMerchantAmount").textContent = formatIDR(topStore.total);
        const ratio = totalSpent > 0 ? ((topStore.total / totalSpent) * 100).toFixed(1) : "0";
        document.getElementById("kpiTopMerchantRatio").textContent = `${ratio}% of total`;
    } else {
        document.getElementById("kpiTopMerchantName").textContent = "Belum ada data";
        document.getElementById("kpiTopMerchantAmount").textContent = "Rp 0";
        document.getElementById("kpiTopMerchantRatio").textContent = "0% of total";
    }
}

// ============================================================
// CHART.JS : MINIMALIST LIGHT OUTFLOW DYNAMICS
// ============================================================

function renderDailyChart(dailyData) {
    const canvas = document.getElementById("dailyChartCanvas");
    if (!canvas) return;

    if (STATE.chart) {
        STATE.chart.destroy();
    }

    // Prepare 31 days data
    const daysInMonth = 31;
    const labels = [];
    const values = [];

    const dailyMap = {};
    dailyData.forEach(item => {
        const d = String(item.day).padStart(2, "0");
        dailyMap[d] = Number(item.total) || 0;
    });

    for (let i = 1; i <= daysInMonth; i++) {
        const dStr = String(i).padStart(2, "0");
        labels.push(dStr);
        values.push(dailyMap[dStr] || 0);
    }

    const nonZeroValues = values.filter(v => v > 0);
    const peak = values.length > 0 ? Math.max(...values) : 0;
    const low = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;
    const sorted = [...nonZeroValues].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

    document.getElementById("chartPeakLabel").textContent = formatIDR(peak);
    document.getElementById("chartLowLabel").textContent = formatIDR(low);
    document.getElementById("chartMedianLabel").textContent = formatIDR(median);
    document.getElementById("chartDateRangeLabel").textContent = `Dynamics // ${formatMonthLabel(STATE.selectedMonth)}`;

    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, "rgba(24, 24, 27, 0.08)");
    gradient.addColorStop(1, "rgba(24, 24, 27, 0.0)");

    STATE.chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Daily Outflow",
                data: values,
                borderColor: "#18181b",
                borderWidth: 1.75,
                backgroundColor: gradient,
                fill: true,
                tension: 0.25,
                pointRadius: values.map(v => (v === peak && peak > 0 ? 4 : 1.5)),
                pointHoverRadius: 5,
                pointBackgroundColor: "#18181b",
                pointBorderColor: "#ffffff",
                pointBorderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#18181b",
                    titleColor: "#ffffff",
                    bodyColor: "#e4e4e7",
                    titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
                    bodyFont: { family: "'Inter', sans-serif", size: 12 },
                    padding: 8,
                    cornerRadius: 2,
                    displayColors: false,
                    callbacks: {
                        title: (items) => `Tgl ${items[0].label} ${formatMonthLabel(STATE.selectedMonth)}`,
                        label: (item) => `Pengeluaran: ${formatIDR(item.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: "#a1a1aa",
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        maxTicksLimit: 8
                    }
                },
                y: {
                    border: { dash: [2, 4] },
                    grid: { color: "#f0f0f2" },
                    ticks: {
                        color: "#a1a1aa",
                        font: { family: "'JetBrains Mono', monospace", size: 10 },
                        callback: (val) => formatCompactIDR(val),
                        maxTicksLimit: 5
                    }
                }
            }
        }
    });
}

// ============================================================
// ALLOCATION MATRIX & CATEGORY BREAKDOWN
// ============================================================

function renderCategoryBreakdown(categories, totalSpend) {
    const segmentedBar = document.getElementById("categoryBarSegmented");
    const ledgerList = document.getElementById("categoryLedgerList");
    const countLabel = document.getElementById("categoryCountLabel");

    if (!categories || categories.length === 0) {
        countLabel.textContent = "0 Kategori";
        segmentedBar.innerHTML = `<div class="bg-zinc-200 w-full h-full" title="Belum ada data"></div>`;
        ledgerList.innerHTML = `<div class="py-4 text-center font-mono text-xs text-text-muted">Tidak ada data kategori bulan ini.</div>`;
        return;
    }

    countLabel.textContent = `${categories.length} Kategori`;

    const sorted = [...categories].sort((a, b) => b.total - a.total);

    let barHtml = "";
    let listHtml = "";

    sorted.forEach((cat) => {
        const percent = totalSpend > 0 ? ((cat.total / totalSpend) * 100).toFixed(1) : "0";
        const color = CATEGORY_COLORS[cat.category] || "#71717a";

        barHtml += `<div style="width: ${percent}%; background-color: ${color};" class="h-full" title="${cat.category}: ${percent}% (${formatIDR(cat.total)})"></div>`;

        listHtml += `
            <div class="flex items-center justify-between py-2 text-xs hover:bg-surface-subtle px-1.5 rounded transition-colors">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${color};"></span>
                    <span class="font-medium text-text-primary truncate">${cat.category}</span>
                </div>
                <div class="flex items-center gap-3 font-mono shrink-0">
                    <span class="text-text-primary font-semibold">${formatIDR(cat.total)}</span>
                    <span class="text-text-muted text-[11px] w-8 text-right">${percent}%</span>
                </div>
            </div>
        `;
    });

    segmentedBar.innerHTML = barHtml;
    ledgerList.innerHTML = listHtml;
}

// ============================================================
// TOP MERCHANTS LEADERBOARD
// ============================================================

function renderTopMerchants(stores) {
    const container = document.getElementById("topMerchantsList");
    if (!stores || stores.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-6 text-center font-mono text-xs text-text-muted bg-white border border-surface-border rounded-sm">
                Belum ada data merchant di bulan ini.
            </div>
        `;
        return;
    }

    const top5 = stores.slice(0, 5);
    const maxAmount = top5.length > 0 ? Math.max(...top5.map(m => m.total)) : 1;

    let html = "";
    top5.forEach((m, idx) => {
        const rank = String(idx + 1).padStart(2, "0");
        const ratio = maxAmount > 0 ? ((m.total / maxAmount) * 100).toFixed(0) : "0";

        html += `
            <div class="bg-white border border-surface-border rounded-sm p-4 flex flex-col justify-between hover:border-zinc-300 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div class="flex items-center justify-between pb-2">
                    <span class="font-mono text-[11px] text-text-faint font-semibold">${rank}</span>
                    <span class="font-mono text-[10px] text-text-muted font-medium">${m.count || 1} transaksi</span>
                </div>
                <div>
                    <div class="font-sans text-[13px] sm:text-[14px] text-text-primary font-medium truncate" title="${m.store}">${m.store}</div>
                    <div class="font-mono text-[16px] sm:text-[17px] text-text-primary font-semibold mt-0.5">${formatIDR(m.total)}</div>
                </div>
                <div class="w-full bg-surface-muted h-1 rounded-full mt-3 overflow-hidden">
                    <div class="bg-zinc-900 h-full rounded-full" style="width: ${ratio}%;"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================================
// TRANSACTIONS LEDGER (DESKTOP TABLE & MOBILE CARDS)
// ============================================================

async function loadTransactions() {
    try {
        const queryParams = new URLSearchParams({
            month: STATE.selectedMonth,
            page: STATE.currentPage,
            limit: STATE.pageSize,
            search: STATE.searchQuery,
            source: STATE.sourceFilter
        });

        const res = await apiFetch(`/api/expenses?${queryParams.toString()}`);
        STATE.currentTransactions = res.expenses || [];
        renderTransactions(res.expenses || []);
        renderPagination(res.pagination || { total: 0, page: 1, totalPages: 1, limit: 15 });
        updateSourceBreakdownKPI(res.expenses || []);
    } catch (err) {
        console.error("Gagal memuat transaksi:", err);
    }
}

function updateSourceBreakdownKPI(expenses) {
    const counts = { manual: 0, receipt: 0, sheet_import: 0, dashboard: 0 };
    expenses.forEach(e => {
        if (counts[e.source] !== undefined) counts[e.source]++;
        else counts.dashboard++;
    });

    const el = document.getElementById("kpiSourceBreakdown");
    if (el) {
        el.innerHTML = `
            <span class="font-semibold text-text-primary">${counts.manual}</span> TG · 
            <span class="font-semibold text-text-primary">${counts.receipt}</span> OCR · 
            <span class="font-semibold text-text-primary">${counts.sheet_import}</span> Sheet · 
            <span class="font-semibold text-text-primary">${counts.dashboard}</span> Web
        `;
    }
}

function renderTransactions(transactions) {
    const tbody = document.getElementById("transactionsTableBody");
    const mobileList = document.getElementById("mobileTransactionsList");

    if (!transactions || transactions.length === 0) {
        const emptyState = `
            <tr>
                <td colspan="6" class="py-10 text-center font-mono text-xs text-text-muted">
                    Tidak ditemukan data transaksi yang sesuai filter.
                </td>
            </tr>
        `;
        tbody.innerHTML = emptyState;
        mobileList.innerHTML = `
            <div class="py-10 text-center font-mono text-xs text-text-muted bg-white border border-surface-border rounded-sm">
                Tidak ditemukan data transaksi yang sesuai.
            </div>
        `;
        return;
    }

    // 1. Desktop Table Rows
    let tableHtml = "";
    transactions.forEach(tx => {
        const dateFormatted = tx.tanggal || tx.tanggalIso || "--";
        const itemsPreview = tx.items || "Tidak ada rincian item";

        tableHtml += `
            <tr class="hover:bg-zinc-50/80 transition-colors group">
                <td class="py-3 px-4 font-mono text-text-primary whitespace-nowrap align-top">
                    <span class="block font-medium">${dateFormatted}</span>
                    <span class="text-[10px] text-text-faint">${tx.source || 'manual'}</span>
                </td>
                <td class="py-3 px-4 align-top max-w-sm">
                    <div class="font-medium text-text-primary">${escapeHtml(tx.toko)}</div>
                    <div class="text-text-muted text-[11px] line-clamp-1 mt-0.5" title="${escapeHtml(itemsPreview)}">
                        ${escapeHtml(itemsPreview)}
                    </div>
                </td>
                <td class="py-3 px-4 align-top whitespace-nowrap">
                    ${getCategoryBadge(tx.category)}
                </td>
                <td class="py-3 px-4 align-top whitespace-nowrap">
                    ${getSourcePipeline(tx.source)}
                </td>
                <td class="py-3 px-4 align-top text-right font-mono whitespace-nowrap">
                    <span class="text-text-primary font-semibold text-[13px]">${formatIDR(tx.total)}</span>
                </td>
                <td class="py-3 px-4 align-top text-right whitespace-nowrap font-mono text-[11px]">
                    <button onclick="inspectTransaction(${tx.id})" class="text-text-muted hover:text-text-primary hover:underline mr-2.5 uppercase font-medium" type="button">Inspect</button>
                    <button onclick="openEditTransactionModal(${tx.id})" class="text-text-muted hover:text-text-primary hover:underline mr-2.5 uppercase font-medium" type="button">Edit</button>
                    <button onclick="deleteTransaction(${tx.id})" class="text-text-muted hover:text-accent-rose hover:underline uppercase font-medium" type="button">Del</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tableHtml;

    // 2. Mobile Cards Manifest
    let mobileHtml = "";
    transactions.forEach(tx => {
        const dateFormatted = tx.tanggal || tx.tanggalIso || "--";
        const itemsText = tx.items && tx.items !== "-" ? tx.items : "";
        const isGenericToko = !tx.toko || tx.toko.toLowerCase() === "manual";
        const displayTitle = isGenericToko && itemsText ? itemsText : (tx.toko || "Transaksi");
        const displaySubtitle = !isGenericToko && itemsText ? itemsText : "";

        let iconName = "chat";
        let iconColor = "text-blue-600";

        if (tx.source === "receipt") {
            iconName = "document_scanner";
            iconColor = "text-accent-emerald";
        } else if (tx.source === "sheet_import") {
            iconName = "table_view";
            iconColor = "text-purple-600";
        }

        mobileHtml += `
            <article class="bg-white border border-surface-border rounded-sm p-3.5 shadow-sm flex items-start justify-between gap-2.5 transition-colors active:bg-zinc-50 cursor-pointer" onclick="inspectTransaction(${tx.id})">
                <div class="flex items-start gap-3 min-w-0 flex-1">
                    <div class="w-9 h-9 rounded-sm bg-surface-subtle border border-surface-border flex items-center justify-center ${iconColor} shrink-0 mt-0.5">
                        <span class="material-symbols-outlined text-[18px]">${iconName}</span>
                    </div>
                    <div class="flex flex-col min-w-0 flex-1">
                        <!-- Judul Toko / Barang -->
                        <div class="font-sans text-xs font-semibold text-text-primary truncate">
                            ${escapeHtml(displayTitle)}
                        </div>
                        
                        <!-- Rincian Nama Barang / Deskripsi (jika ada subtitle) -->
                        ${displaySubtitle ? `
                            <div class="text-[11px] text-text-secondary line-clamp-1 mt-0.5 font-sans" title="${escapeHtml(displaySubtitle)}">
                                ${escapeHtml(displaySubtitle)}
                            </div>
                        ` : ''}

                        <!-- Metadata Kategori & Tanggal -->
                        <div class="flex items-center gap-1.5 text-text-muted font-mono text-[10px] mt-1 truncate">
                            <span class="font-medium text-text-secondary">${escapeHtml(tx.category || 'Lainnya')}</span>
                            <span>·</span>
                            <span>${dateFormatted}</span>
                        </div>
                    </div>
                </div>

                <div class="text-right shrink-0 font-mono">
                    <div class="text-xs font-semibold text-text-primary">${formatIDR(tx.total)}</div>
                    <div class="text-[10px] text-text-faint">${tx.source || 'manual'}</div>
                </div>
            </article>
        `;
    });
    mobileList.innerHTML = mobileHtml;
}

function renderPagination(pagination) {
    const { total, page, totalPages, limit } = pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    document.getElementById("tableCounterLabel").textContent = `Showing ${start}–${end} of ${total} ledger entries`;

    const container = document.getElementById("tablePaginationContainer");
    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = `
        <button onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} class="px-2 py-1 bg-white border border-surface-border text-text-secondary rounded-sm disabled:opacity-30 transition-colors" type="button">
            <span class="material-symbols-outlined text-[14px]">chevron_left</span>
        </button>
    `;

    for (let p = 1; p <= totalPages; p++) {
        if (p === page) {
            html += `<button class="px-2.5 py-1 bg-zinc-900 text-white font-medium rounded-sm" type="button">${p}</button>`;
        } else if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
            html += `<button onclick="goToPage(${p})" class="px-2.5 py-1 bg-white border border-surface-border hover:bg-surface-subtle text-text-secondary rounded-sm transition-colors" type="button">${p}</button>`;
        } else if (p === page - 2 || p === page + 2) {
            html += `<span class="px-1 text-text-faint">...</span>`;
        }
    }

    html += `
        <button onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''} class="px-2 py-1 bg-white border border-surface-border text-text-secondary rounded-sm disabled:opacity-30 transition-colors" type="button">
            <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        </button>
    `;

    container.innerHTML = html;
}

function goToPage(p) {
    STATE.currentPage = p;
    loadTransactions();
}

let searchDebounceTimeout = null;
function handleSearch(val) {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        STATE.searchQuery = val.trim();
        STATE.currentPage = 1;
        loadTransactions();
    }, 250);
}

function focusGlobalSearch() {
    const input = document.getElementById("tableSearchInput");
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function setSourceFilter(src) {
    STATE.sourceFilter = src;
    STATE.currentPage = 1;

    const group = document.getElementById("sourceFilterGroup");
    if (group) {
        const buttons = group.querySelectorAll(".filter-pill");
        buttons.forEach(btn => {
            const isMatch = btn.getAttribute("data-source") === src;
            if (isMatch) {
                btn.className = "filter-pill px-3 py-1 bg-zinc-900 text-white font-medium rounded-sm uppercase whitespace-nowrap shadow-sm transition-colors";
            } else {
                btn.className = "filter-pill px-3 py-1 text-text-muted hover:text-text-primary hover:bg-white rounded-sm uppercase whitespace-nowrap transition-colors";
            }
        });
    }

    loadTransactions();
}

// ============================================================
// MODAL: ADD & EDIT TRANSACTION
// ============================================================

function openAddTransactionModal() {
    document.getElementById("modalTitle").textContent = "Tambah Pengeluaran";
    document.getElementById("txId").value = "";
    document.getElementById("txStore").value = "";
    document.getElementById("txAmount").value = "";
    document.getElementById("txCategory").value = "Makanan";
    document.getElementById("txSource").value = "dashboard";
    document.getElementById("txItems").value = "";

    const today = new Date().toISOString().split("T")[0];
    document.getElementById("txDate").value = today;

    showModal("transactionModal");
}

function openEditTransactionModal(id) {
    const tx = STATE.currentTransactions.find(t => t.id === id);
    if (!tx) return;

    document.getElementById("modalTitle").textContent = "Edit Pengeluaran";
    document.getElementById("txId").value = tx.id;
    document.getElementById("txStore").value = tx.toko || "";
    document.getElementById("txAmount").value = tx.total || "";
    document.getElementById("txCategory").value = tx.category || "Makanan";
    document.getElementById("txSource").value = tx.source || "dashboard";
    document.getElementById("txItems").value = tx.items || "";

    const dStr = tx.tanggalIso ? tx.tanggalIso : new Date().toISOString().split("T")[0];
    document.getElementById("txDate").value = dStr;

    showModal("transactionModal");
}

function closeTransactionModal() {
    hideModal("transactionModal");
}

async function handleSaveTransaction(e) {
    e.preventDefault();
    const id = document.getElementById("txId").value;
    const toko = document.getElementById("txStore").value.trim();
    const total = Number(document.getElementById("txAmount").value);
    const tanggal = document.getElementById("txDate").value;
    const category = document.getElementById("txCategory").value;
    const source = document.getElementById("txSource").value;
    const items = document.getElementById("txItems").value.trim();

    const saveBtn = document.getElementById("btnSaveTx");
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[15px]">sync</span><span>Menyimpan...</span>`;

    try {
        const payload = { toko, total, tanggal, category, source, items };

        if (id) {
            await apiFetch(`/api/expenses/${id}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            showToast("Transaksi berhasil diperbarui", "success");
        } else {
            await apiFetch("/api/expenses", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            showToast("Transaksi baru berhasil ditambahkan", "success");
        }

        closeTransactionModal();
        await loadDashboardData();
    } catch (err) {
        showToast(err.message || "Gagal menyimpan transaksi", "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<span class="material-symbols-outlined text-[15px]">save</span><span>Simpan Data</span>`;
    }
}

async function deleteTransaction(id) {
    if (!confirm("Apakah Anda yakin ingin menghapus transaksi ini?")) return;

    try {
        await apiFetch(`/api/expenses/${id}`, {
            method: "DELETE"
        });
        showToast("Transaksi berhasil dihapus", "success");
        await loadDashboardData();
    } catch (err) {
        showToast(err.message || "Gagal menghapus transaksi", "error");
    }
}

// ============================================================
// MODAL: INSPECT OCR & ITEM DETAIL
// ============================================================

async function inspectTransaction(id) {
    const tx = STATE.currentTransactions.find(t => t.id === id);
    if (!tx) return;

    const itemsText = tx.items && tx.items !== "-" ? tx.items : "";
    const isGenericToko = !tx.toko || tx.toko.toLowerCase() === "manual";
    const displayTitle = isGenericToko && itemsText ? itemsText : (tx.toko || "Detail Transaksi");

    document.getElementById("detailStoreName").textContent = displayTitle;
    document.getElementById("detailAmount").textContent = formatIDR(tx.total);
    document.getElementById("detailDate").textContent = tx.tanggal || tx.tanggalIso || "--";
    document.getElementById("detailCategory").textContent = tx.category || "Lainnya";
    document.getElementById("detailSource").textContent = tx.source || "manual";

    const descElem = document.getElementById("detailItemsDescription");
    if (descElem) {
        descElem.textContent = itemsText || (tx.toko && !isGenericToko ? tx.toko : "Tidak ada rincian tambahan");
    }

    const ocrPre = document.getElementById("detailReceiptText");
    const ocrContainer = document.getElementById("detailOcrContainer");
    if (tx.receiptText || tx.receipt_text) {
        ocrPre.textContent = tx.receiptText || tx.receipt_text;
        ocrContainer.classList.remove("hidden");
    } else {
        ocrPre.textContent = "Tidak ada teks mentah OCR untuk transaksi ini.";
        ocrContainer.classList.remove("hidden");
    }

    const tbody = document.getElementById("detailItemsTbody");
    tbody.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-text-muted">Memuat rincian item...</td></tr>`;

    showModal("detailModal");

    try {
        const detail = await apiFetch(`/api/expenses/${id}`);
        const items = detail.itemDetails || [];

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr class="hover:bg-zinc-50">
                    <td class="py-2.5 px-3 text-text-faint">1</td>
                    <td class="py-2.5 px-3 text-text-primary font-medium">${escapeHtml(itemsText || tx.toko || 'Item Tunggal')}</td>
                    <td class="py-2.5 px-3 text-center text-text-secondary">1</td>
                    <td class="py-2.5 px-3 text-right text-text-primary font-semibold">${formatIDR(tx.total)}</td>
                </tr>
            `;
        } else {
            let html = "";
            items.forEach((it, idx) => {
                html += `
                    <tr class="hover:bg-zinc-50">
                        <td class="py-2.5 px-3 text-text-faint">${idx + 1}</td>
                        <td class="py-2.5 px-3 text-text-primary font-medium">${escapeHtml(it.item_name)}</td>
                        <td class="py-2.5 px-3 text-center text-text-secondary">${it.quantity || 1}</td>
                        <td class="py-2.5 px-3 text-right text-text-primary font-semibold">${formatIDR(it.line_total)}</td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-accent-rose">Gagal mengambil item breakdown.</td></tr>`;
    }
}

function closeDetailModal() {
    hideModal("detailModal");
}

// ============================================================
// ACTIONS: SYNC & CSV EXPORT
// ============================================================

async function syncNow() {
    const icon = document.getElementById("syncIconElem");
    if (icon) icon.classList.add("animate-spin");

    try {
        await loadDashboardData();
        showToast("Data berhasil disinkronkan", "success");
    } catch (err) {
        showToast("Gagal sinkronisasi data", "error");
    } finally {
        if (icon) {
            setTimeout(() => {
                icon.classList.remove("animate-spin");
            }, 600);
        }
    }
}

function exportCsv() {
    if (!STATE.selectedMonth) return;
    const url = `/api/export?month=${STATE.selectedMonth}`;
    window.open(url, "_blank");
    showToast("Mengunduh data CSV...", "info");
}

// ============================================================
// UI UTILITIES & MODAL HELPERS
// ============================================================

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("opacity-0", "pointer-events-none");
    const inner = modal.querySelector("div");
    if (inner) {
        inner.classList.remove("scale-95");
        inner.classList.add("scale-100");
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add("opacity-0", "pointer-events-none");
    const inner = modal.querySelector("div");
    if (inner) {
        inner.classList.remove("scale-100");
        inner.classList.add("scale-95");
    }
}

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    let icon = "info";
    let bg = "bg-zinc-900 text-white border-zinc-700";

    if (type === "success") {
        icon = "check_circle";
        bg = "bg-emerald-900 text-emerald-100 border-emerald-700";
    } else if (type === "error") {
        icon = "error";
        bg = "bg-rose-900 text-rose-100 border-rose-700";
    }

    toast.className = `flex items-center gap-2 px-3.5 py-2 rounded-sm border shadow-lg font-mono text-xs animate-fade-in pointer-events-auto ${bg}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined text-[16px]">${icon}</span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Global Keybinding Listener (⌘K / Ctrl+K)
document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        focusGlobalSearch();
    }
});

// Run checkAuth on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
});
