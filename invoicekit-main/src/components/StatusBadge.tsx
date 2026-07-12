import type { InvoiceStatus } from "../lib/types";

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; classes: string; dot: string }
> = {
  draft: {
    label: "Draft",
    classes: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  sent: {
    label: "Sent",
    classes: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  paid: {
    label: "Paid",
    classes: "bg-green-50 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  overdue: {
    label: "Overdue",
    classes: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

export default function StatusBadge({ status }: { status: InvoiceStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
