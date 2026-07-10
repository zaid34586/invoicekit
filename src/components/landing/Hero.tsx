import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="bg-gradient-to-b from-white via-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-6 py-24 text-center">

        {/* Badge */}
        <span className="inline-flex items-center rounded-full bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 border border-primary-100">
          🚀 Trusted by freelancers & businesses worldwide
        </span>

        {/* Heading */}
        <h1 className="mt-8 text-5xl md:text-7xl font-extrabold tracking-tight leading-tight text-slate-900">
          Invoice Smarter.
          <br />
          <span className="text-primary-600">
            Get Paid Faster.
          </span>
        </h1>

        {/* Description */}
        <p className="mt-8 max-w-3xl mx-auto text-xl leading-8 text-slate-600">
          Create beautiful professional invoices, manage clients,
          track payments and grow your business with one modern
          invoicing platform.
        </p>

        {/* Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-5">

          <Link
            to="/signup"
            className="px-8 py-4 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition shadow-lg"
          >
            Start Free — No Credit Card
          </Link>

          <Link
            to="/login"
            className="px-8 py-4 rounded-xl border border-slate-300 font-semibold hover:bg-slate-100 transition"
          >
            Live Demo
          </Link>

        </div>

        {/* Trust Badges */}
        <div className="mt-12 flex flex-wrap justify-center gap-8 text-sm text-slate-500">

          <span>✅ Free Forever Plan</span>

          <span>⚡ PDF Export</span>

          <span>🔒 Secure Cloud Storage</span>

          <span>🌍 Built for Global Businesses</span>

        </div>

        {/* Dashboard Preview */}
        <div className="mt-16 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">

          {/* Browser Bar */}
          <div className="h-12 bg-slate-100 border-b flex items-center px-5 gap-2">

            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
            <div className="w-3 h-3 rounded-full bg-green-400"></div>

            <div className="ml-6 bg-white rounded-lg px-4 py-1 text-sm text-slate-400 border">
              app.rivox.com/dashboard
            </div>

          </div>

          <div className="grid lg:grid-cols-4">

            {/* Sidebar */}
            <div className="bg-slate-900 text-white p-6 space-y-5 text-left">

              <h3 className="text-xl font-bold">Rivox</h3>

              <div className="space-y-3 text-slate-300">

                <div>📊 Dashboard</div>
                <div>🧾 Invoices</div>
                <div>👥 Clients</div>
                <div>💳 Billing</div>
                <div>⚙ Settings</div>

              </div>

            </div>

            {/* Main */}
            <div className="lg:col-span-3 p-8 bg-slate-50">

              <div className="grid md:grid-cols-3 gap-5">

                <div className="bg-white rounded-xl p-6 shadow">

                  <p className="text-slate-500">Revenue</p>

                  <h3 className="text-3xl font-bold mt-2">$18,450</h3>

                </div>

                <div className="bg-white rounded-xl p-6 shadow">

                  <p className="text-slate-500">Invoices</p>

                  <h3 className="text-3xl font-bold mt-2">248</h3>

                </div>

                <div className="bg-white rounded-xl p-6 shadow">

                  <p className="text-slate-500">Paid</p>

                  <h3 className="text-3xl font-bold mt-2">96%</h3>

                </div>

              </div>

              <div className="mt-8 bg-white rounded-xl shadow p-6">

                <div className="flex justify-between mb-6">

                  <h4 className="font-semibold">
                    Recent Invoices
                  </h4>

                  <span className="text-primary-600">
                    View All
                  </span>

                </div>

                <div className="space-y-4">

                  <div className="flex justify-between">
                    <span>INV-1001</span>
                    <span className="text-green-600 font-medium">Paid</span>
                  </div>

                  <div className="flex justify-between">
                    <span>INV-1002</span>
                    <span className="text-yellow-500 font-medium">Pending</span>
                  </div>

                  <div className="flex justify-between">
                    <span>INV-1003</span>
                    <span className="font-medium">$520</span>
                  </div>

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}