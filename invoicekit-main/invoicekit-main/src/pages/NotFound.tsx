import { Link } from "react-router-dom";
import RivoxLogo from "../components/RivoxLogo";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5"><div className="max-w-lg text-center"><RivoxLogo className="justify-center" /><p className="mt-10 text-xs font-black uppercase tracking-[0.22em] text-primary-600">404 error</p><h1 className="mt-4 text-5xl font-black tracking-[-0.05em] text-slate-950">This page moved faster than expected.</h1><p className="mt-5 text-base leading-7 text-slate-600">The page you requested does not exist or may have been moved.</p><Link to="/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-primary-600">Back to Rivox</Link></div></main>;
}
