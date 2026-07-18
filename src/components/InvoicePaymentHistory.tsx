import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PaymentRow = {
  id: string;
  provider: "paypal" | "stripe";
  environment: "sandbox" | "live";
  provider_capture_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "approved" | "paid" | "failed" | "refunded";
  refunded_amount: number;
  payer_email: string | null;
  payer_name: string | null;
  paid_at: string | null;
  created_at: string;
  invoices: { invoice_number: string; client_name: string } | null;
};

export default function InvoicePaymentHistory() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: queryError } = await supabase
        .from("invoice_payments")
        .select("id,provider,environment,provider_capture_id,amount,currency,status,refunded_amount,payer_email,payer_name,paid_at,created_at,invoices(invoice_number,client_name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (queryError) setError(queryError.message);
      else setRows((data || []) as unknown as PaymentRow[]);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-500">Transactions</p><h2 className="mt-1 text-xl font-black text-slate-950">Invoice payment history</h2></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Latest 20</span>
      </div>
      {loading ? <div className="p-8 text-sm text-slate-500">Loading payments…</div> : error ? <div className="p-8 text-sm text-red-600">{error}</div> : rows.length === 0 ? (
        <div className="p-10 text-center"><p className="font-bold text-slate-800">No invoice payments yet</p><p className="mt-1 text-sm text-slate-500">Completed PayPal or Stripe transactions will appear here.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-6 py-3">Invoice</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-6 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/70">
              <td className="px-6 py-4"><p className="font-bold text-slate-900">{row.invoices?.invoice_number || "Invoice"}</p><p className="mt-0.5 text-xs text-slate-500">{row.invoices?.client_name || row.provider_capture_id || "—"}</p></td>
              <td className="px-4 py-4"><p className="font-semibold capitalize text-slate-800">{row.provider}</p><p className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${row.environment === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{row.environment}</p></td>
              <td className="px-4 py-4"><p className="font-medium text-slate-700">{row.payer_name || "Customer"}</p><p className="mt-0.5 text-xs text-slate-500">{row.payer_email || "No payer email"}</p></td>
              <td className="px-4 py-4 font-black text-slate-950">{new Intl.NumberFormat(undefined, { style: "currency", currency: row.currency }).format(Number(row.amount))}{Number(row.refunded_amount) > 0 && <p className="mt-1 text-xs font-semibold text-red-500">Refunded {new Intl.NumberFormat(undefined, { style: "currency", currency: row.currency }).format(Number(row.refunded_amount))}</p>}</td>
              <td className="px-4 py-4"><Status value={row.status} /></td>
              <td className="px-6 py-4 text-slate-500">{new Date(row.paid_at || row.created_at).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Status({ value }: { value: PaymentRow["status"] }) {
  const colors = value === "paid" ? "bg-emerald-100 text-emerald-700" : value === "refunded" ? "bg-red-100 text-red-700" : value === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${colors}`}>{value}</span>;
}

