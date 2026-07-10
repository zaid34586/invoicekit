import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-16">
      <div className="max-w-7xl mx-auto px-6">

        <div className="grid md:grid-cols-4 gap-10">

          <div>
            <h2 className="text-2xl font-bold">Rivox</h2>

            <p className="mt-4 text-slate-400">
              Professional invoicing software for freelancers,
              startups and growing businesses.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Product</h3>

            <ul className="space-y-3 text-slate-400">
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Company</h3>

            <ul className="space-y-3 text-slate-400">
              <li>About</li>
              <li>Contact</li>
              <li>Support</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Legal</h3>

            <ul className="space-y-3 text-slate-400">
              <li>Privacy Policy</li>
              <li>Terms of Service</li>
              <li>Refund Policy</li>
            </ul>
          </div>

        </div>

        <div className="border-t border-slate-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">

          <p className="text-slate-400">
            © 2026 Rivox. All rights reserved.
          </p>

          <div className="flex gap-6 mt-4 md:mt-0">

            <Link to="/login" className="text-slate-400 hover:text-white">
              Sign In
            </Link>

            <Link to="/signup" className="text-slate-400 hover:text-white">
              Get Started
            </Link>

          </div>

        </div>

      </div>
    </footer>
  );
}