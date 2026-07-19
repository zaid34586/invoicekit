import { useMemo } from "react";

type Props = {
  invoices: any[];
  clients: any[];
  payments: any[];
  currency: string;
};

const amount = (invoice: any) => Number(invoice.base_total ?? invoice.total ?? 0);

export default function AdvancedAnalytics({ invoices, clients, payments, currency }: Props) {
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value || 0);
  const data = useMemo(() => {
    const now = new Date();
    const paid = invoices.filter((invoice) => invoice.status === "paid");
    const collectible = invoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "draft");
    const overdue = collectible.filter((invoice) => invoice.status === "overdue" || new Date(`${invoice.due_date}T23:59:59`) < now);
    const revenue = paid.reduce((sum, invoice) => sum + amount(invoice), 0);
    const outstanding = collectible.reduce((sum, invoice) => sum + amount(invoice), 0);
    const cgst = paid.reduce((sum, invoice) => sum + Number(invoice.cgst || 0), 0);
    const sgst = paid.reduce((sum, invoice) => sum + Number(invoice.sgst || 0), 0);
    const igst = paid.reduce((sum, invoice) => sum + Number(invoice.igst || 0), 0);
    const customer = new Map<string, number>();
    const service = new Map<string, number>();
    paid.forEach((invoice) => {
      customer.set(invoice.client_name || "Unknown", (customer.get(invoice.client_name || "Unknown") || 0) + amount(invoice));
      (invoice.items || []).forEach((item: any) => service.set(item.description || "Service", (service.get(item.description || "Service") || 0) + Number(item.qty || 0) * Number(item.rate || 0)));
    });
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const rows = paid.filter((invoice) => String(invoice.invoice_date || invoice.created_at).slice(0, 7) === key);
      return { key, label: date.toLocaleDateString(undefined, { month: "short" }), revenue: rows.reduce((sum, invoice) => sum + amount(invoice), 0), invoices: rows.length };
    });
    const current = months[months.length - 1]?.revenue || 0;
    const previous = months[months.length - 2]?.revenue || 0;
    const growth = previous ? ((current - previous) / previous) * 100 : current ? 100 : 0;
    const provider = new Map<string, { count: number; amount: number }>();
    payments.filter((payment) => payment.status === "paid").forEach((payment) => {
      const name = String(payment.provider || "manual").toUpperCase();
      const row = provider.get(name) || { count: 0, amount: 0 };
      provider.set(name, { count: row.count + 1, amount: row.amount + Number(payment.amount || 0) });
    });
    const issued = invoices.filter((invoice) => invoice.status !== "draft").length;
    const uniqueCustomers = new Set(paid.map((invoice) => invoice.client_email || invoice.client_name)).size;
    return {
      revenue, outstanding, overdueAmount: overdue.reduce((sum, invoice) => sum + amount(invoice), 0), overdueCount: overdue.length,
      tax: cgst + sgst + igst, cgst, sgst, igst, paidCount: paid.length, issued,
      conversion: issued ? (paid.length / issued) * 100 : 0,
      clv: uniqueCustomers ? revenue / uniqueCustomers : 0,
      averageInvoice: paid.length ? revenue / paid.length : 0,
      growth, months,
      topCustomers: [...customer].sort((a, b) => b[1] - a[1]).slice(0, 5),
      bestServices: [...service].sort((a, b) => b[1] - a[1]).slice(0, 5),
      providers: [...provider],
      overdue: overdue.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 5),
      clientCount: clients.length,
    };
  }, [invoices, clients, payments]);
  const maxRevenue = Math.max(...data.months.map((month) => month.revenue), 1);

  return <div className="space-y-6">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Total revenue" value={money(data.revenue)} note={`${data.paidCount} paid invoices`} tone="emerald" />
      <Metric label="Monthly growth" value={`${data.growth >= 0 ? "+" : ""}${data.growth.toFixed(1)}%`} note="Compared with last month" tone={data.growth >= 0 ? "violet" : "rose"} />
      <Metric label="Outstanding" value={money(data.outstanding)} note={`${data.overdueCount} overdue invoices`} tone="amber" />
      <Metric label="Customer lifetime value" value={money(data.clv)} note={`${data.clientCount} customers`} tone="blue" />
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Revenue trend</p><h2 className="mt-1 text-xl font-black">Last six months</h2></div><b className="text-emerald-600">{money(data.revenue)}</b></div>
        <div className="mt-8 flex h-64 items-end gap-3 border-b border-slate-200">
          {data.months.map((month) => <div key={month.key} className="flex h-full flex-1 flex-col justify-end gap-2 text-center"><span className="text-xs font-bold text-slate-500">{month.revenue ? money(month.revenue) : "—"}</span><div className="mx-auto w-full max-w-14 rounded-t-xl bg-gradient-to-t from-violet-700 to-indigo-400 transition-all" style={{ height: `${Math.max((month.revenue / maxRevenue) * 82, month.revenue ? 8 : 2)}%` }} /><span className="pb-3 text-xs font-semibold text-slate-500">{month.label}</span></div>)}
        </div>
      </div>
      <div className="card p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Invoice performance</p><h2 className="mt-1 text-xl font-black">Conversion & collection</h2><Progress label="Paid conversion" value={data.conversion} /><Progress label="Revenue collected" value={data.revenue + data.outstanding ? data.revenue / (data.revenue + data.outstanding) * 100 : 0} /><div className="mt-6 grid grid-cols-2 gap-3"><Small label="Average invoice" value={money(data.averageInvoice)} /><Small label="Overdue value" value={money(data.overdueAmount)} /></div></div>
    </section>

    <section className="grid gap-6 lg:grid-cols-2"><Rank title="Top customers" rows={data.topCustomers} money={money} /><Rank title="Best services" rows={data.bestServices} money={money} /></section>

    <section className="grid gap-6 lg:grid-cols-3">
      <div className="card p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Tax summary</p><h2 className="mt-1 text-xl font-black">Tax collected</h2><p className="mt-4 text-3xl font-black">{money(data.tax)}</p><div className="mt-5 space-y-3"><Line label="CGST" value={money(data.cgst)} /><Line label="SGST" value={money(data.sgst)} /><Line label="IGST / VAT" value={money(data.igst)} /></div></div>
      <div className="card p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Payment analytics</p><h2 className="mt-1 text-xl font-black">Payment channels</h2><div className="mt-5 space-y-3">{data.providers.length ? data.providers.map(([name, row]) => <div key={name} className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between"><b>{name}</b><b>{money(row.amount)}</b></div><p className="mt-1 text-xs text-slate-500">{row.count} successful payments</p></div>) : <p className="text-sm text-slate-500">Gateway payment data will appear after the first successful payment.</p>}</div></div>
      <div className="card p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Needs attention</p><h2 className="mt-1 text-xl font-black">Outstanding invoices</h2><div className="mt-5 space-y-3">{data.overdue.length ? data.overdue.map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-4"><div><b>{invoice.invoice_number}</b><p className="text-xs text-slate-500">{invoice.client_name} · due {new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString()}</p></div><b className="text-rose-600">{money(amount(invoice))}</b></div>) : <p className="text-sm text-emerald-600">No overdue invoices. Everything is on track.</p>}</div></div>
    </section>
  </div>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) { const colors: Record<string, string> = { emerald: "from-emerald-50 to-white text-emerald-700", violet: "from-violet-50 to-white text-violet-700", rose: "from-rose-50 to-white text-rose-700", amber: "from-amber-50 to-white text-amber-700", blue: "from-blue-50 to-white text-blue-700" }; return <div className={`card bg-gradient-to-br p-5 ${colors[tone]}`}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="mt-2 text-xs font-semibold">{note}</p></div>; }
function Progress({ label, value }: { label: string; value: number }) { return <div className="mt-6"><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">{label}</span><b>{Math.min(value, 100).toFixed(1)}%</b></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-400" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} /></div></div>; }
function Small({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><b className="mt-1 block">{value}</b></div>; }
function Line({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b border-slate-100 pb-3 text-sm"><span className="text-slate-500">{label}</span><b>{value}</b></div>; }
function Rank({ title, rows, money }: { title: string; rows: [string, number][]; money: (value: number) => string }) { const max = Math.max(...rows.map((row) => row[1]), 1); return <div className="card p-6"><h2 className="text-xl font-black">{title}</h2><div className="mt-5 space-y-4">{rows.length ? rows.map(([name, value], index) => <div key={name}><div className="mb-2 flex justify-between gap-3 text-sm"><span><b className="mr-2 text-violet-600">#{index + 1}</b>{name}</span><b>{money(value)}</b></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${value / max * 100}%` }} /></div></div>) : <p className="text-sm text-slate-500">No paid invoice data yet.</p>}</div></div>; }
