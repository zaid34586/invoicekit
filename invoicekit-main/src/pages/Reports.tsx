import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { formatMoney } from "../lib/currency";
import type { Invoice, Client } from "../lib/types";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { invoiceBaseAmount, invoicePaidBaseAmount, invoiceDisplayAmount, invoiceDate, startOfDay, endOfDay, isWithin } from "../lib/invoiceAnalytics";
import LockedFeature from "../components/LockedFeature";
import { getCountryTaxSummary } from "../lib/tax";

// Type definitions
type DateFilter = "today" | "week" | "month" | "year" | "custom";

// Skeleton loader
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className ?? ""}`} />;
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  color = "primary",
  subtitle,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "primary" | "green" | "amber" | "red" | "blue" | "purple";
  subtitle?: string;
  loading?: boolean;
}) {
  const colorClasses = {
    primary: "bg-primary-50 text-primary-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
  };

  if (loading) {
    return (
      <div className="card p-5">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/80 bg-white p-5 shadow-[0_18px_48px_-28px_rgba(15,23,42,.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-25px_rgba(79,70,229,.28)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-violet-50" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          {trend && trendValue && (
            <div className="flex items-center gap-1 mt-2">
              {trend === "up" && (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              )}
              {trend === "down" && (
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                </svg>
              )}
              {trend === "neutral" && (
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                </svg>
              )}
              <span className={`text-xs font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-slate-500"}`}>
                {trendValue}
              </span>
            </div>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Bar Chart Component
function BarChart({
  data,
  labels,
  title,
  color = "primary",
  currency,
}: {
  data: number[];
  labels: string[];
  title: string;
  color?: "primary" | "green" | "blue";
  currency: string;
}) {
  const maxValue = Math.max(...data, 1);

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">{title}</h3>
      <div className="space-y-4">
        {data.map((value, index) => (
          <div key={index} className="flex items-center gap-4">
            <div className="w-20 text-xs text-slate-500 text-right">{labels[index]}</div>
            <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  color === "primary" ? "bg-gradient-to-r from-primary-500 to-primary-400" :
                  color === "green" ? "bg-gradient-to-r from-green-500 to-green-400" :
                  "bg-gradient-to-r from-blue-500 to-blue-400"
                }`}
                style={{ width: `${(value / maxValue) * 100}%` }}
              />
            </div>
            <div className="w-20 text-sm font-medium text-slate-900 text-right">{formatMoney(value, currency)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Donut Chart Component (simplified)
function StatusChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Invoice Status</h3>
      <div className="flex items-center gap-8">
        {/* Visual representation */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
            {data.map((item, index) => {
              const percentage = (item.value / total) * 100;
              const offset = data.slice(0, index).reduce((sum, d) => sum + (d.value / total) * 100, 0);
              return (
                <circle
                  key={item.label}
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke={item.color}
                  strokeWidth="3"
                  strokeDasharray={`${percentage} ${100 - percentage}`}
                  strokeDashoffset={-offset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3">
          {data.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-slate-600">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{item.value}</span>
                <span className="text-xs text-slate-500">({total > 0 ? Math.round((item.value / total) * 100) : 0}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Client Growth Line Chart (simplified)
function LineChart({ data, labels, title }: { data: number[]; labels: string[]; title: string }) {
  const maxValue = Math.max(...data, 1);
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - (value / maxValue) * 80;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="relative h-48">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          {/* Grid lines */}
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e2e8f0" strokeWidth="0.5" />
          ))}
          {/* Area fill */}
          <polygon
            points={`0,100 ${points} 100,100`}
            fill="url(#gradient)"
            opacity="0.3"
          />
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary-500"
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" className="text-primary-500" />
              <stop offset="100%" stopColor="currentColor" className="text-primary-500" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-slate-500 transform translate-y-4">
          {labels.slice(0, 6).map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Coming Soon Modal
function ComingSoonModal({
  isOpen,
  onClose,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card max-w-sm w-full p-6 animate-scale-in text-center">
        <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Coming Soon</h3>
        <p className="text-sm text-slate-600 mb-6">
          {title} export will be available soon. Stay tuned for updates!
        </p>
        <button onClick={onClose} className="btn-primary px-6 py-2 text-sm">
          Got it
        </button>
      </div>
    </div>
  );
}

// Top Client Row
function TopClientRow({
  name,
  revenue,
  invoices,
  rank,
  currency,
}: {
  name: string;
  revenue: number;
  invoices: number;
  rank: number;
  currency: string;
}) {
  const rankColors = ["text-amber-500", "text-slate-400", "text-amber-700"];

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-slate-50 transition">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${rank < 3 ? rankColors[rank] : "text-slate-500"}`}>
        {rank === 0 ? "1" : rank === 1 ? "2" : rank === 2 ? "3" : rank + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
        <p className="text-xs text-slate-500">{invoices} invoices</p>
      </div>
      <p className="text-sm font-semibold text-slate-900">{formatMoney(revenue, currency)}</p>
    </div>
  );
}

export default function Reports() {
  const { user, profile, workspaceOwnerId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [exportModal, setExportModal] = useState<string | null>(null);
const currency = profile?.currency ?? "USD";

  useEffect(() => {
    async function loadData() {
      const [invoicesRes, clientsRes] = await Promise.all([
        supabase
  .from("invoices")
  .select("*")
  .eq("user_id", workspaceOwnerId || user?.id)
  .order("created_at", { ascending: false }),

supabase
  .from("clients")
  .select("*")
  .eq("user_id", workspaceOwnerId || user?.id)
  .order("created_at", { ascending: false }),
      ]);

      if (invoicesRes.data) setInvoices(invoicesRes.data as Invoice[]);
      if (clientsRes.data) setClients(clientsRes.data as Client[]);
      setLoading(false);
    }
    loadData();
  }, [user, workspaceOwnerId]);

  const now = new Date();
  const getDateRange = (): { start: Date; end: Date } => {
    if (dateFilter === "today") return { start: startOfDay(now), end: endOfDay(now) };
    if (dateFilter === "week") {
      const start = startOfDay(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { start, end: endOfDay(now) };
    }
    if (dateFilter === "year") return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
    if (dateFilter === "custom") {
      const start = customStartDate ? startOfDay(new Date(`${customStartDate}T00:00:00`)) : new Date(0);
      const end = customEndDate ? endOfDay(new Date(`${customEndDate}T00:00:00`)) : endOfDay(now);
      return { start, end };
    }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
  };

  const activeRange = getDateRange();
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesDate = isWithin(invoiceDate(invoice), activeRange.start, activeRange.end);
    const matchesStatus = selectedStatus === "all" || invoice.status === selectedStatus;
    const matchesClient = selectedClient === "all" || invoice.client_name === selectedClient;
    return matchesDate && matchesStatus && matchesClient;
  });

  const reportRangeLabel = `${activeRange.start.toLocaleDateString()} - ${activeRange.end.toLocaleDateString()}`;

function exportCSV() {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "Invoice No", "Client", "Country", "Status", "Invoice Date", "Due Date",
    "Invoice Currency", "Exchange Rate", "Invoice Subtotal", "Tax",
    "Invoice Total", `Base Total (${currency})`,
  ];
  const rows = filteredInvoices.map((invoice) => {
    const invoiceSubtotal = Number(invoice.invoice_subtotal ?? invoice.subtotal ?? 0);
    const invoiceTotal = invoiceDisplayAmount(invoice);
    const tax = Math.max(0, invoiceTotal - invoiceSubtotal);
    return [
      invoice.invoice_number,
      invoice.client_name,
      invoice.client_country ?? "",
      invoice.status,
      invoice.invoice_date,
      invoice.due_date,
      invoice.invoice_currency ?? currency,
      Number(invoice.exchange_rate ?? 1).toFixed(6),
      invoiceSubtotal.toFixed(2),
      tax.toFixed(2),
      invoiceTotal.toFixed(2),
      invoiceBaseAmount(invoice).toFixed(2),
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Rivox_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function exportPDF() {
  const doc = new jsPDF();
  const paidTotal = filteredInvoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + invoicePaidBaseAmount(invoice), 0);
  const pendingTotal = filteredInvoices.filter((invoice) => invoice.status === "sent").reduce((sum, invoice) => sum + invoiceBaseAmount(invoice), 0);
  const overdueTotal = filteredInvoices.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + invoiceBaseAmount(invoice), 0);
  const pageWidth = doc.internal.pageSize.getWidth();
  const businessName = profile?.business_name || "Rivox Business Report";

  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, pageWidth, 42, "F");

  if (profile?.logo_url) {
    try {
      const response = await fetch(profile.logo_url);
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "PNG", 14, 9, 24, 24, undefined, "FAST");
    } catch {
      // Report still exports when a remote logo blocks browser access.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(businessName, profile?.logo_url ? 43 : 14, 18);
  doc.setFontSize(9);
  const details = [profile?.address, profile?.phone, profile?.email].filter(Boolean).join(" • ");
  if (details) doc.text(details.slice(0, 95), profile?.logo_url ? 43 : 14, 26);
  doc.text(`Business report • ${reportRangeLabel}`, profile?.logo_url ? 43 : 14, 33);

  doc.setTextColor(15, 23, 42);
  const cards = [
    ["Paid", paidTotal], ["Pending", pendingTotal], ["Overdue", overdueTotal], ["Invoices", filteredInvoices.length],
  ] as const;
  cards.forEach(([label, value], index) => {
    const x = 14 + index * 47;
    doc.setFillColor(245, 247, 255);
    doc.roundedRect(x, 49, 42, 24, 3, 3, "F");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 4, 57);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(typeof value === "number" && label !== "Invoices" ? formatMoney(value, currency) : String(value), x + 4, 67, { maxWidth: 35 });
  });

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Base currency: ${currency}`, 14, 82);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 110, 82);

  let y = 93;
  const drawHeader = () => {
    doc.setFillColor(79, 70, 229);
    doc.rect(14, y, 182, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Invoice", 17, y + 6);
    doc.text("Client", 43, y + 6);
    doc.text("Status", 96, y + 6);
    doc.text("Currency", 119, y + 6);
    doc.text("Invoice total", 143, y + 6);
    doc.text(`Base (${currency})`, 173, y + 6, { align: "right" });
    y += 12;
  };
  drawHeader();

  filteredInvoices.forEach((invoice, index) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
      drawHeader();
    }
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 3, 182, 9, "F");
    }
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.text(invoice.invoice_number, 17, y + 3);
    doc.text(invoice.client_name.slice(0, 26), 43, y + 3);
    doc.text(invoice.status, 96, y + 3);
    doc.text(invoice.invoice_currency ?? currency, 119, y + 3);
    doc.text(invoiceDisplayAmount(invoice).toFixed(2), 143, y + 3);
    doc.text(invoiceBaseAmount(invoice).toFixed(2), 193, y + 3, { align: "right" });
    y += 9;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Generated by Rivox Business OS", 14, 290);
    doc.text(`Page ${page} of ${pages}`, 196, 290, { align: "right" });
  }
  doc.save(`Rivox_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportExcel() {
  const invoiceRows = filteredInvoices.map((invoice) => ({
    "Invoice No": invoice.invoice_number,
    Client: invoice.client_name,
    Country: invoice.client_country ?? "",
    Status: invoice.status,
    "Invoice Date": invoice.invoice_date,
    "Due Date": invoice.due_date,
    "Invoice Currency": invoice.invoice_currency ?? currency,
    "Exchange Rate": Number(invoice.exchange_rate ?? 1),
    "Invoice Subtotal": Number(Number(invoice.invoice_subtotal ?? invoice.subtotal ?? 0).toFixed(2)),
    "Invoice Total": invoiceDisplayAmount(invoice),
    [`Base Total (${currency})`]: invoiceBaseAmount(invoice),
  }));

  const paidTotal = filteredInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + invoicePaidBaseAmount(i), 0);
  const pendingTotal = filteredInvoices.filter((i) => i.status === "sent").reduce((s, i) => s + invoiceBaseAmount(i), 0);
  const overdueTotal = filteredInvoices.filter((i) => i.status === "overdue").reduce((s, i) => s + invoiceBaseAmount(i), 0);
  const summary = XLSX.utils.aoa_to_sheet([
    [businessNameForExport()],
    ["Rivox Report Summary"],
    ["Period", reportRangeLabel],
    ["Base Currency", currency],
    ["Invoice Count", filteredInvoices.length],
    ["Paid Revenue", Number(paidTotal.toFixed(2))],
    ["Pending", Number(pendingTotal.toFixed(2))],
    ["Overdue", Number(overdueTotal.toFixed(2))],
    ["Generated", new Date().toLocaleString()],
  ]);
  summary["!cols"] = [{ wch: 24 }, { wch: 28 }];

  const invoicesSheet = XLSX.utils.json_to_sheet(invoiceRows);
  invoicesSheet["!cols"] = [14, 24, 18, 12, 14, 14, 16, 14, 18, 18, 18].map((wch) => ({ wch }));
  invoicesSheet["!autofilter"] = { ref: invoicesSheet["!ref"] || "A1:K1" };

  const clientMap = new Map<string, { count: number; paid: number; pending: number; total: number }>();
  filteredInvoices.forEach((invoice) => {
    const current = clientMap.get(invoice.client_name) ?? { count: 0, paid: 0, pending: 0, total: 0 };
    const value = invoiceBaseAmount(invoice);
    current.count += 1;
    current.total += value;
    if (invoice.status === "paid") current.paid += invoicePaidBaseAmount(invoice);
    if (invoice.status === "sent" || invoice.status === "overdue") current.pending += value;
    clientMap.set(invoice.client_name, current);
  });
  const clientsSheet = XLSX.utils.json_to_sheet(Array.from(clientMap.entries()).map(([client, data]) => ({
    Client: client,
    "Invoice Count": data.count,
    [`Total (${currency})`]: Number(data.total.toFixed(2)),
    [`Paid (${currency})`]: Number(data.paid.toFixed(2)),
    [`Pending (${currency})`]: Number(data.pending.toFixed(2)),
  })));
  clientsSheet["!cols"] = [{ wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  clientsSheet["!autofilter"] = { ref: clientsSheet["!ref"] || "A1:E1" };

  const currencyMap = new Map<string, { count: number; invoiceTotal: number; baseTotal: number }>();
  filteredInvoices.forEach((invoice) => {
    const code = invoice.invoice_currency ?? currency;
    const current = currencyMap.get(code) ?? { count: 0, invoiceTotal: 0, baseTotal: 0 };
    current.count += 1;
    current.invoiceTotal += invoiceDisplayAmount(invoice);
    current.baseTotal += invoiceBaseAmount(invoice);
    currencyMap.set(code, current);
  });
  const currencySheet = XLSX.utils.json_to_sheet(Array.from(currencyMap.entries()).map(([code, data]) => ({
    Currency: code,
    "Invoice Count": data.count,
    "Invoice Currency Total": Number(data.invoiceTotal.toFixed(2)),
    [`Base Total (${currency})`]: Number(data.baseTotal.toFixed(2)),
  })));
  currencySheet["!cols"] = [{ wch: 14 }, { wch: 15 }, { wch: 24 }, { wch: 20 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");
  XLSX.utils.book_append_sheet(workbook, invoicesSheet, "Invoices");
  XLSX.utils.book_append_sheet(workbook, clientsSheet, "Clients");
  XLSX.utils.book_append_sheet(workbook, currencySheet, "Currencies");
  XLSX.writeFile(workbook, `Rivox_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function businessNameForExport(): string {
  return profile?.business_name || "Rivox Business Report";
}
  // Calculate analytics
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Revenue analytics
  // NOTE: "Total Revenue" must reflect money actually collected (status === "paid"),
  // consistent with Dashboard.tsx. Summing all invoices regardless of status
  // (draft/sent/overdue) was showing unpaid/pending amounts as "revenue".
  const totalRevenue = filteredInvoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + invoicePaidBaseAmount(inv), 0);
  const revenueThisMonth = invoices
    .filter((inv) => new Date(inv.created_at) >= monthStart && inv.status === "paid")
    .reduce((sum, inv) => sum + invoicePaidBaseAmount(inv), 0);
  const revenueLastMonth = invoices
    .filter((inv) => {
      const date = new Date(inv.created_at);
      return date >= lastMonthStart && date <= lastMonthEnd && inv.status === "paid";
    })
    .reduce((sum, inv) => sum + invoicePaidBaseAmount(inv), 0);

  const revenueGrowth = revenueLastMonth > 0
    ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
    : 0;

  // Invoice analytics
  const totalInvoices = filteredInvoices.length;
  const paidInvoices = filteredInvoices.filter((inv) => inv.status === "paid").length;
  const pendingInvoices = filteredInvoices.filter((inv) => inv.status === "sent").length;
  const overdueInvoices = filteredInvoices.filter((inv) => inv.status === "overdue").length;
  const draftInvoices = filteredInvoices.filter((inv) => inv.status === "draft").length;

  // Client analytics
  const totalClients = clients.length;
  const newClientsThisMonth = clients.filter((c) => new Date(c.created_at) >= monthStart).length;

  // Top clients by revenue
  const clientRevenue = new Map<string, { revenue: number; invoices: number }>();
  filteredInvoices.forEach((inv) => {
    if (inv.status === "paid") {
      const current = clientRevenue.get(inv.client_name) || { revenue: 0, invoices: 0 };
      clientRevenue.set(inv.client_name, {
        revenue: current.revenue + invoicePaidBaseAmount(inv),
        invoices: current.invoices + 1,
      });
    }
  });
  const topClients = Array.from(clientRevenue.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const highestPayingClient = topClients[0]?.name || "N/A";

  // Tax summary
  const totalCGST = filteredInvoices.reduce((sum, inv) => sum + Number(inv.cgst || 0), 0);
  const totalSGST = filteredInvoices.reduce((sum, inv) => sum + Number(inv.sgst || 0), 0);
  const totalIGST = filteredInvoices.reduce((sum, inv) => sum + Number(inv.igst || 0), 0);
  const totalGST = totalCGST + totalSGST + totalIGST;
  // Non-India businesses don't use CGST/SGST — gst.ts stores their flat
  // VAT/Sales Tax/etc. amount in the `igst` column purely for storage
  // compatibility (see gst.ts comment). So for a non-India business, show
  // one card with the country's real tax name instead of India's 3-way split.
  const isIndiaBusiness = (profile?.country || "India") === "India";
  const countryTax = getCountryTaxSummary(profile?.country);

  // Chart data (with placeholder data if no real data)
  const hasData = filteredInvoices.length > 0;

  // Revenue trend data (last 6 months)
  const revenueTrendData = hasData
    ? (() => {
        const data: number[] = [];
        for (let i = 5; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          const monthRevenue = filteredInvoices
            .filter((inv) => {
              const date = new Date(inv.created_at);
              return date >= monthStart && date <= monthEnd && inv.status === "paid";
            })
            .reduce((sum, inv) => sum + invoicePaidBaseAmount(inv), 0);
          data.push(monthRevenue);
        }
        return data;
      })()
    : [18000, 24000, 21000, 32000, 28000, 35000];

  const monthLabels = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i);
    monthLabels.push(date.toLocaleDateString("en-US", { month: "short" }));
  }

  // Monthly revenue data
  const monthlyRevenueLabels = monthLabels;
  const monthlyRevenueData = revenueTrendData;

  // Client growth data (last 6 months)
  const clientGrowthData = hasData
    ? (() => {
        const data: number[] = [];
        for (let i = 5; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          const monthClients = clients.filter((c) => {
            const date = new Date(c.created_at);
            return date >= monthStart && date <= monthEnd;
          }).length;
          data.push(monthClients);
        }
        return data;
      })()
    : [2, 3, 4, 6, 5, 8];

  // Status chart data
  const statusChartData = [
    { label: "Paid", value: paidInvoices || (hasData ? 0 : 45), color: "#22c55e" },
    { label: "Pending", value: pendingInvoices || (hasData ? 0 : 18), color: "#f59e0b" },
    { label: "Overdue", value: overdueInvoices || (hasData ? 0 : 7), color: "#ef4444" },
    { label: "Draft", value: draftInvoices || (hasData ? 0 : 12), color: "#94a3b8" },
  ];

  return (
    <LockedFeature
      active={profile?.plan === "free"}
      eyebrow="Reports & Analytics"
      title="Reports & Analytics is a Pro feature"
      description="Revenue trends, invoice pipeline, and client insights unlock on the Pro plan and above."
    >
    <div className="max-w-[1500px] mx-auto space-y-7 animate-fade-in pb-10">
      {/* Premium analytics header */}
      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-[0_28px_80px_-30px_rgba(79,70,229,.62)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Decision center</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Reports & Analytics</h1>
          <p className="mt-2 text-sm text-indigo-100">
            Track your business performance and insights
          </p>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {(["today", "week", "month", "year"] as DateFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  dateFilter === filter
                    ? "bg-white text-violet-700 shadow-lg"
                    : "border border-white/15 bg-white/10 text-indigo-100 hover:bg-white/20"
                }`}
              >
                {filter === "today" ? "Today" : filter === "week" ? "This Week" : filter === "month" ? "This Month" : "This Year"}
              </button>
            ))}
            <button
              onClick={() => setDateFilter("custom")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                dateFilter === "custom"
                  ? "bg-white text-violet-700 shadow-lg"
                  : "border border-white/15 bg-white/10 text-indigo-100 hover:bg-white/20"
              }`}
            >
              Custom
            </button>
          </div>
        </div>
      </div>
      </section>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Status:</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="input py-1.5 text-sm w-auto"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="sent">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Client:</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="input py-1.5 text-sm w-auto min-w-[150px]"
            >
              <option value="all">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.name}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          {dateFilter === "custom" && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">From:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="input py-1.5 text-sm w-auto"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">To:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="input py-1.5 text-sm w-auto"
                />
              </div>
            </>
          )}
          <button
            onClick={() => {
              setDateFilter("month");
              setSelectedStatus("all");
              setSelectedClient("all");
              setCustomStartDate("");
              setCustomEndDate("");
            }}
            className="text-sm text-slate-500 hover:text-slate-700 ml-auto"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!loading && filteredInvoices.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No reports available yet
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Create some invoices to see your business analytics and insights.
          </p>
          <a href="/new" className="btn-primary inline-flex">
            Create Invoice
          </a>
        </div>
      ) : (
        <>
          {/* Section 1: Revenue Analytics */}
          <section>
            <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-500">Money movement</p><h2 className="mt-1 text-xl font-bold text-slate-950">Revenue Analytics</h2></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Revenue"
                value={formatMoney(totalRevenue, currency)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                }
                color="green"
                loading={loading}
              />
              <StatCard
                label="Revenue This Month"
                value={formatMoney(revenueThisMonth, currency)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                trend={revenueGrowth >= 0 ? "up" : "down"}
                trendValue={`${Math.abs(revenueGrowth)}%`}
                color="primary"
                loading={loading}
              />
              <StatCard
                label="Revenue Last Month"
                value={formatMoney(revenueLastMonth, currency)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="blue"
                loading={loading}
              />
              <StatCard
                label="Revenue Growth"
                value={`${revenueGrowth >= 0 ? "+" : ""}${revenueGrowth}%`}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                }
                trend={revenueGrowth >= 0 ? "up" : "down"}
                trendValue={`vs last month`}
                color={revenueGrowth >= 0 ? "green" : "red"}
                loading={loading}
              />
            </div>
          </section>

          {/* Section 2: Invoice Analytics */}
          <section>
            <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Invoice pipeline</p><h2 className="mt-1 text-xl font-bold text-slate-950">Invoice Analytics</h2></div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard
                label="Total Invoices"
                value={String(totalInvoices)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                color="primary"
                loading={loading}
              />
              <StatCard
                label="Paid"
                value={String(paidInvoices)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="green"
                loading={loading}
              />
              <StatCard
                label="Pending"
                value={String(pendingInvoices)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="amber"
                loading={loading}
              />
              <StatCard
                label="Overdue"
                value={String(overdueInvoices)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                }
                color="red"
                loading={loading}
              />
              <StatCard
                label="Draft"
                value={String(draftInvoices)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
                color="blue"
                loading={loading}
              />
            </div>
          </section>

          {/* Section 3: Client Analytics */}
          <section>
            <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-500">Customer value</p><h2 className="mt-1 text-xl font-bold text-slate-950">Client Analytics</h2></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Clients"
                value={String(totalClients)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
                color="blue"
                loading={loading}
              />
              <StatCard
                label="New This Month"
                value={String(newClientsThisMonth)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                }
                trend="up"
                trendValue="new"
                color="green"
                loading={loading}
              />
              <StatCard
                label="Top Paying Client"
                value={highestPayingClient.length > 15 ? highestPayingClient.substring(0, 15) + "..." : highestPayingClient}
                subtitle={topClients[0] ? formatMoney(topClients[0].revenue, currency) : undefined}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                }
                color="amber"
                loading={loading}
              />
              <StatCard
                label="Active Clients"
                value={String(new Set(invoices.map((inv) => inv.client_name)).size)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                }
                color="purple"
                loading={loading}
              />
            </div>

            {/* Top 10 Clients */}
            <div className="mt-6 card p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Top 10 Clients by Revenue</h3>
              {topClients.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No paid invoices yet to calculate top clients.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {topClients.map((client, index) => (
                    <TopClientRow
                      key={client.name}
                      name={client.name}
                      revenue={client.revenue}
                      invoices={client.invoices}
                      rank={index}
                      currency={currency}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Section 4: Tax Summary */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Tax Summary</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={isIndiaBusiness ? "Total GST Collected" : `Total ${countryTax.label} Collected`}
                value={formatMoney(totalGST, currency)}
                icon={
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                }
                color="primary"
                loading={loading}
              />
              {isIndiaBusiness ? (
                <>
                  <StatCard
                    label="CGST"
                    value={formatMoney(totalCGST, currency)}
                    icon={
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    }
                    color="blue"
                    loading={loading}
                  />
                  <StatCard
                    label="SGST"
                    value={formatMoney(totalSGST, currency)}
                    icon={
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    }
                    color="green"
                    loading={loading}
                  />
                  <StatCard
                    label="IGST"
                    value={formatMoney(totalIGST, currency)}
                    icon={
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    }
                    color="amber"
                    loading={loading}
                  />
                </>
              ) : (
                <StatCard
                  label={countryTax.label}
                  value={formatMoney(totalIGST, currency)}
                  icon={
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                  color="blue"
                  loading={loading}
                />
              )}
            </div>
          </section>

          {/* Section 5: Charts */}
          <section className="grid lg:grid-cols-2 gap-6">
            <BarChart
              data={revenueTrendData}
              labels={monthLabels}
              title="Revenue Trend (6 Months)"
              color="primary"
              currency={currency}
            />
            <StatusChart data={statusChartData} />
          </section>

          <section className="grid lg:grid-cols-2 gap-6">
            <LineChart
              data={clientGrowthData}
              labels={monthLabels}
              title="Client Growth (6 Months)"
            />
            <BarChart
              data={monthlyRevenueData}
              labels={monthlyRevenueLabels}
              title="Monthly Revenue Breakdown"
              color="green"
              currency={currency}
            />
          </section>

          {/* Section 6: Export Reports */}
          <section className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Export Reports</h2>
            <p className="text-sm text-slate-500 mb-6">
              Download your reports in various formats
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportPDF}
                className="btn-secondary"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Export PDF
              </button>
              <button
                onClick={exportCSV}
                className="btn-secondary"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
              <button
                onClick={exportExcel}
                className="btn-secondary"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Export Excel
              </button>
            </div>
          </section>
        </>
      )}

      {/* Export Coming Soon Modal */}
      <ComingSoonModal
        isOpen={!!exportModal}
        onClose={() => setExportModal(null)}
        title={`${exportModal} Export`}
      />
    </div>
    </LockedFeature>
  );
}
