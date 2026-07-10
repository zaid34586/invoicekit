import Navbar from "../components/landing/Navbar";
import Pricing from "../components/landing/Pricing";
import FAQ from "../components/landing/FAQ";
import Footer from "../components/landing/Footer";

export default function PricingPage() {
  return <div className="min-h-screen bg-slate-50"><Navbar /><main className="pt-4"><Pricing /><FAQ /></main><Footer /></div>;
}
