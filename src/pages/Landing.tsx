import Footer from "../components/landing/Footer";
import FAQ from "../components/landing/FAQ";
import HowItWorks from "../components/landing/HowItWorks";
import Pricing from "../components/landing/Pricing";
import Navbar from "../components/landing/Navbar";
import Hero from "../components/landing/Hero";
import Features from "../components/landing/Features";
import DynamicGrowthBanner from "../components/DynamicGrowthBanner";

export default function Landing() {
  return (
   <>
  <Navbar />
  <DynamicGrowthBanner placement="landing" />
  <Hero />
  <Features />
  <HowItWorks />
  <Pricing />
  <FAQ />
  <Footer />
</>
  );
}