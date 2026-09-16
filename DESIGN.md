# Design Direction: ExpenseBot Dashboard

## Identity & Concept
- **Product**: ExpenseBot Personal Finance & Expense Tracker Dashboard
- **Audience**: Personal user tracking daily expenses, groceries, bills, and receipts with precision and clarity.
- **Tone**: Functional, calm, trustworthy, high-contrast, distraction-free.
- **Dial**: ENERGY 1 / RHYTHM 2 / MOTION 1

---

## Visual Foundation & Palette

### Core Colors (Max 2-3 + 1 Accent)
- **Background Base**: `#0a0e17` (Deep neutral dark)
- **Surface / Card**: `#111827` (Clean solid dark surface)
- **Border / Divider**: `#1f2937` (Subtle 1px solid border, 3:1 contrast against controls)
- **Text Primary**: `#f9fafb` (High contrast, passes WCAG AA 15:1+)
- **Text Secondary**: `#9ca3af` (Clear secondary labels, passes WCAG AA 4.5:1+)
- **Primary Accent**: `#10b981` (Emerald green, reserved for financial totals and key actions)
- **Interactive Action**: `#4f46e5` (Deep indigo for primary action button)
- **Danger Action**: `#dc2626` (Crimson for delete/destructive actions)

### Typography
- **Font Family**: Plus Jakarta Sans / Inter, sans-serif
- **Hierarchy**: Clear proportional scaling (`1.5rem` headings, `0.9rem` body, `0.8rem` labels) without arbitrary uppercase tracking.

### Rules of Craft
- **No Em Dashes (`—`)** in copy or UI headings.
- **No Decorative Emojis** in system headings or table data.
- **No Endless Pulsing Loops** or rainbow gradient glows.
- **Focus Rings**: High-contrast `:focus-visible` ring (`2px solid #10b981`) on all interactive controls.
- **Modals**: Full keyboard support (Escape key to dismiss, Tab trapped or orderly).
- **States**: Clear Empty state ("Belum ada data transaksi"), Loading state, and Error state with actionable instructions.
