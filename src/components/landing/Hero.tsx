import { Link } from "react-router-dom";
import RivoxLogo from "../RivoxLogo";

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur">
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
  </div>
);

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[58rem] -translate-x-1/2 rounded-full bg-primary-200/55 blur-3xl" />
        <div className="absolute -right-48 top-40 h-96 w-96 rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="absolute -left-48 top-64 h-96 w-96 rounded-full bg-violet-200/45 blur-3xl" />
      </div>

      <div className="page-container relative pb-16 pt-12 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary-200 bg-white/75 px-3 py-1.5 text-xs font-bold sm:px-4 sm:py-2 sm:text-sm text-primary-700 shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.12)]" />
            Built for freelancers and agencies billing across borders
          </div>

          <h1 className="display-title mt-6 font-black text-slate-950 sm:mt-8">
            Invoicing for freelancers and agencies
            <span className="block bg-gradient-to-r from-primary-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">
              working across borders.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:mt-7 sm:text-lg sm:leading-8 lg:text-xl">
            Multi-currency invoices, live exchange rates, and automatic tax handling — in one workspace.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:mt-10 sm:flex-row">
            <Link to="/signup" className="inline-flex items-center justify-center w-full rounded-xl bg-slate-950 px-5 py-3.5 text-sm sm:w-auto sm:rounded-2xl sm:px-7 sm:py-4 sm:text-base font-bold text-white shadow-xl shadow-slate-950/20 transition hover:-translate-y-1 hover:bg-primary-600">
              Start free — no card
              <span className="ml-2">→</span>
            </Link>
            <a href="#pricing" className="inline-flex items-center justify-center w-full rounded-xl border border-slate-300 bg-white/80 px-5 py-3.5 text-sm sm:w-auto sm:rounded-2xl sm:px-7 sm:py-4 sm:text-base font-bold text-slate-800 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:border-primary-300 hover:text-primary-700">
              Compare plans
            </a>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-2 text-left text-xs sm:mt-8 sm:flex sm:justify-center sm:gap-x-7 sm:gap-y-3 sm:text-sm font-semibold text-slate-500">
            <span>✓ 3 free invoices</span>
            <span>✓ Global currencies</span>
            <span>✓ Secure cloud access</span>
            <span>✓ Cancel anytime</span>
          </div>
        </div>

        <div className="relative mx-auto mt-10 max-w-6xl sm:mt-16">
          <div className="absolute -inset-5 rounded-[2.4rem] bg-gradient-to-r from-primary-500/20 via-violet-500/20 to-cyan-400/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border sm:rounded-[2rem] border-slate-200/80 bg-slate-950 p-2 shadow-[0_35px_90px_rgba(15,23,42,0.24)]">
            <div className="overflow-hidden rounded-[1.55rem] bg-slate-50">
              <div className="flex h-10 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:h-12 sm:px-5">
                <span className="h-3 w-3 rounded-full bg-rose-400" /><span className="h-3 w-3 rounded-full bg-amber-400" /><span className="h-3 w-3 rounded-full bg-emerald-400" />
                <div className="ml-auto hidden rounded-lg border border-slate-200 bg-slate-50 px-6 py-1.5 text-xs sm:block font-medium text-slate-400">app.rivox.com/dashboard</div>
              </div>

              <div className="grid min-h-[390px] lg:min-h-[430px] lg:grid-cols-[230px_1fr]">
                <aside className="hidden bg-slate-950 p-6 text-white lg:block">
                  <RivoxLogo inverse iconClassName="w-9 h-9" />
                  <div className="mt-9 space-y-2 text-sm font-semibold">
                    <div className="rounded-xl bg-white/10 px-4 py-3 text-white">Dashboard</div>
                    {['Invoices','Clients','Reports','Billing','Settings'].map((item) => <div key={item} className="rounded-xl px-4 py-3 text-slate-400">{item}</div>)}
                  </div>
                </aside>

                <main className="p-4 sm:p-6 lg:p-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div><p className="text-sm font-semibold text-slate-500">Overview</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Good morning, Alex</h2></div>
                    <button className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm sm:w-auto font-bold text-white shadow-lg shadow-primary-600/20">+ New invoice</button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:mt-7 sm:grid-cols-3 sm:gap-4">
                    <Metric label="Revenue" value="$18,450" />
                    <Metric label="Outstanding" value="$3,280" />
                    <Metric label="Paid rate" value="96%" />
                  </div>
                  <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between"><p className="font-bold text-slate-900">Revenue trend</p><span className="text-xs font-bold text-emerald-600">+18.4%</span></div>
                      <div className="mt-8 flex h-36 items-end gap-2">{[34,48,40,62,55,78,68,88,76,96,83,104].map((h,i)=><div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary-600 to-primary-300" style={{height:`${h}px`}} />)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="font-bold text-slate-900">Recent invoices</p>
                      <div className="mt-4 space-y-4">{[['INV-1048','Paid','$1,240'],['INV-1047','Pending','$780'],['INV-1046','Paid','$520']].map(([id,status,amount])=><div key={id} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"><div><p className="text-sm font-bold text-slate-800">{id}</p><p className={`text-xs font-semibold ${status==='Paid'?'text-emerald-600':'text-amber-600'}`}>{status}</p></div><p className="text-sm font-black text-slate-900">{amount}</p></div>)}</div>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
