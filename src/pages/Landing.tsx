import Footer from "../components/landing/Footer";
import FAQ from "../components/landing/FAQ";
import HowItWorks from "../components/landing/HowItWorks";
import Pricing from "../components/landing/Pricing";
import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import Features from "../components/landing/Features";
import DynamicGrowthBanner from "../components/DynamicGrowthBanner";
import SEO from "../components/SEO";
import WhatsAppButton from "../components/WhatsAppButton";
import SocialProof from "../components/SocialProof";
import LiveChatWidget from "../components/LiveChatWidget";

export default function Landing() {
  return (
   <>
  <SEO
    title="Rivox — Business, Billing & Payments"
    description="Rivox helps modern businesses create invoices, manage clients, track revenue and get paid faster. Multi-currency, multi-country tax support."
    url="/"
  />
  <Navbar />
  <DynamicGrowthBanner placement="landing" />
  <Hero />
  <SocialProof />
  <Features />
  <HowItWorks />
  <Pricing />
  <FAQ />
  <Footer />
  <WhatsAppButton />
  <LiveChatWidget />
</>
  );
}