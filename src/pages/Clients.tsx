import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Client, Invoice } from "../lib/types";
import { INDIAN_STATES, formatINR, formatDate } from "../lib/constants";
import StatusBadge from "../components/StatusBadge";

const COUNTRIES = [
  { name: "Argentina", code: "+54", flag: "AR" },
  { name: "Australia", code: "+61", flag: "AU" },
  { name: "Austria", code: "+43", flag: "AT" },
  { name: "Bangladesh", code: "+880", flag: "BD" },
  { name: "Belgium", code: "+32", flag: "BE" },
  { name: "Brazil", code: "+55", flag: "BR" },
  { name: "Canada", code: "+1", flag: "CA" },
  { name: "China", code: "+86", flag: "CN" },
  { name: "Denmark", code: "+45", flag: "DK" },
  { name: "Egypt", code: "+20", flag: "EG" },
  { name: "Finland", code: "+358", flag: "FI" },
  { name: "France", code: "+33", flag: "FR" },
  { name: "Germany", code: "+49", flag: "DE" },
  { name: "Hong Kong", code: "+852", flag: "HK" },
  { name: "India", code: "+91", flag: "IN" },
  { name: "Indonesia", code: "+62", flag: "ID" },
  { name: "Ireland", code: "+353", flag: "IE" },
  { name: "Israel", code: "+972", flag: "IL" },
  { name: "Italy", code: "+39", flag: "IT" },
  { name: "Japan", code: "+81", flag: "JP" },
  { name: "Kenya", code: "+254", flag: "KE" },
  { name: "Kuwait", code: "+965", flag: "KW" },
  { name: "Malaysia", code: "+60", flag: "MY" },
  { name: "Mexico", code: "+52", flag: "MX" },
  { name: "Netherlands", code: "+31", flag: "NL" },
  { name: "New Zealand", code: "+64", flag: "NZ" },
  { name: "Nigeria", code: "+234", flag: "NG" },
  { name: "Norway", code: "+47", flag: "NO" },
  { name: "Oman", code: "+968", flag: "OM" },
  { name: "Pakistan", code: "+92", flag: "PK" },
  { name: "Philippines", code: "+63", flag: "PH" },
  { name: "Poland", code: "+48", flag: "PL" },
  { name: "Portugal", code: "+351", flag: "PT" },
  { name: "Qatar", code: "+974", flag: "QA" },
  { name: "Saudi Arabia", code: "+966", flag: "SA" },
  { name: "Singapore", code: "+65", flag: "SG" },
  { name: "South Africa", code: "+27", flag: "ZA" },
  { name: "South Korea", code: "+82", flag: "KR" },
  { name: "Spain", code: "+34", flag: "ES" },
  { name: "Sri Lanka", code: "+94", flag: "LK" },
  { name: "Sweden", code: "+46", flag: "SE" },
  { name: "Switzerland", code: "+41", flag: "CH" },
  { name: "Thailand", code: "+66", flag: "TH" },
  { name: "Turkey", code: "+90", flag: "TR" },
  { name: "UAE", code: "+971", flag: "AE" },
  { name: "United Kingdom", code: "+44", flag: "GB" },
  { name: "United States", code: "+1", flag: "US" },
  { name: "Vietnam", code: "+84", flag: "VN" },
];

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const UK_REGIONS = [
  "England", "Scotland", "Wales", "Northern Ireland",
];

const UAE_EMIRATES = [
  "Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain",
  "Ras Al Khaimah", "Fujairah",
];

const CANADA_PROVINCES = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick",
  "Newfoundland and Labrador", "Nova Scotia", "Ontario",
  "Prince Edward Island", "Quebec", "Saskatchewan",
  "Northwest Territories", "Nunavut", "Yukon",
];

const AUSTRALIA_STATES = [
  "New South Wales", "Victoria", "Queensland", "Western Australia",
  "South Australia", "Tasmania", "Australian Capital Territory",
  "Northern Territory",
];

const SINGAPORE_REGIONS = [
  "Central Region", "East Region", "North Region",
  "North-East Region", "West Region",
];

const GERMANY_STATES = [
  "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen",
  "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern",
  "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony",
  "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia",
];

const FRANCE_REGIONS = [
  "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne",
  "Centre-Val de Loire", "Corse", "Grand Est", "Hauts-de-France",
  "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie",
  "Pays de la Loire", "Provence-Alpes-Côte d'Azur",
];

const BRAZIL_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará",
  "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão",
  "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará",
  "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro",
  "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima",
  "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
];

const MEXICO_STATES = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
  "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
  "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León",
  "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala",
  "Veracruz", "Yucatán", "Zacatecas",
];

const SOUTH_AFRICA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "Northern Cape", "North West", "Western Cape",
];

function getStatesForCountry(country: string): string[] {
  switch (country) {
    case "India":
      return INDIAN_STATES;
    case "United States":
      return US_STATES;
    case "United Kingdom":
      return UK_REGIONS;
    case "UAE":
      return UAE_EMIRATES;
    case "Canada":
      return CANADA_PROVINCES;
    case "Australia":
      return AUSTRALIA_STATES;
    case "Singapore":
      return SINGAPORE_REGIONS;
    case "Germany":
      return GERMANY_STATES;
    case "France":
      return FRANCE_REGIONS;
    case "Brazil":
      return BRAZIL_STATES;
    case "Mexico":
      return MEXICO_STATES;
    case "South Africa":
      return SOUTH_AFRICA_PROVINCES;
    default:
      return [];
  }
}

function getStateLabel(country: string): string {
  switch (country) {
    case "United States":
      return "State";
    case "United Kingdom":
      return "Region";
    case "UAE":
      return "Emirate";
    case "Canada":
      return "Province";
    case "Australia":
      return "State / Territory";
    case "Singapore":
      return "Region";
    case "Germany":
      return "State (Bundesland)";
    case "France":
      return "Region";
    case "Brazil":
    case "Mexico":
      return "State";
    case "South Africa":
      return "Province";
    default:
      return "State / Province";
  }
}

function getEmptyForm(defaultCountry?: string | null, defaultCountryCode?: string | null) {
  return {
    name: "",
    country: defaultCountry ?? "United States",
    country_code: defaultCountryCode ?? "+1",
    phone: "",
    email: "",
    address: "",
    state: "",
    gstin: "",
  };
}

export default function Clients() {
  const { user, profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(() => getEmptyForm(profile?.country, profile?.country_code));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [historyInvoices, setHistoryInvoices] = useState<Invoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) return;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) setClients(data as Client[]);
      setLoading(false);
    }
    load();
  }, [user]);

  function openAdd() {
    setEditingId(null);
    setForm(getEmptyForm(profile?.country, profile?.country_code));
    setError(null);
    setShowForm(true);
  }

  function openEdit(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      country: client.country ?? profile?.country ?? "United States",
      country_code: client.country_code ?? profile?.country_code ?? "+1",
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      state: client.state ?? "",
      gstin: client.gstin ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  function handleCountryChange(countryName: string) {
    const selected = COUNTRIES.find((c) => c.name === countryName);
    setForm({
      ...form,
      country: selected?.name ?? countryName,
      country_code: selected?.code ?? form.country_code,
      // Reset state whenever the country changes so a stale value
      // from the previous country can never be submitted.
      state: "",
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (!form.name.trim()) {
      setError("Client name is required");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      country: form.country,
      country_code: form.country_code,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      state: form.state || null,
      gstin: form.gstin.trim().toUpperCase() || null,
    };

    if (editingId) {
      const { data, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      setClients((prev) =>
        prev.map((c) => (c.id === editingId ? (data as Client) : c))
      );
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(payload)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      setClients((prev) => [data as Client, ...prev]);
    }
    setShowForm(false);
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Delete client "${client.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (!error) {
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    }
  }

  async function showHistory(client: Client) {
    setHistoryClient(client);
    setHistoryInvoices([]);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_name", client.name)
      .order("created_at", { ascending: false });
    setHistoryInvoices((data as Invoice[]) ?? []);
    setHistoryLoading(false);
  }

  const availableStates = getStatesForCountry(form.country);
  const stateLabel = getStateLabel(form.country);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {clients.length} client{clients.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <form
            onSubmit={handleSubmit}
            className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in"
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingId ? "Edit Client" : "New Client"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Client details are reused automatically when you create invoices
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="label">
                  Client name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="Acme Corp"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Country</label>
                  <select
                    value={form.country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="input"
                  >
                    {COUNTRIES.map((country) => (
                      <option key={country.name} value={country.name}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">
                    {stateLabel}
                    {availableStates.length === 0 && (
                      <span className="text-slate-400 font-normal"> (not applicable)</span>
                    )}
                  </label>
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="input disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    disabled={availableStates.length === 0}
                  >
                    <option value="">
                      {availableStates.length === 0
                        ? "Not applicable"
                        : `Select ${stateLabel.toLowerCase()}`}
                    </option>
                    {availableStates.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <div className="flex gap-2">
                    <div className="input w-20 flex items-center justify-center bg-slate-50 text-slate-500 font-medium shrink-0">
                      {form.country_code}
                    </div>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="input flex-1"
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input"
                    placeholder="client@email.com"
                  />
                </div>
              </div>

              {form.country === "India" && (
                <div>
                  <label className="label">GSTIN</label>
                  <input
                    value={form.gstin}
                    onChange={(e) =>
                      setForm({ ...form, gstin: e.target.value.toUpperCase() })
                    }
                    className="input"
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
              )}

              <div>
                <label className="label">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Street, City, PIN / ZIP"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving..." : editingId ? "Update client" : "Save client"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">Loading...</div>
      ) : clients.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No clients yet</h3>
          <p className="text-sm text-slate-500 mb-5">
            Save client details to quickly reuse them when creating invoices
          </p>
          <button onClick={openAdd} className="btn-primary">
            Add your first client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <div key={client.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{client.name}</h3>
                  {client.gstin && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {client.country === "India" ? "GSTIN" : "Tax ID"}: {client.gstin}
                    </p>
                  )}
                </div>
                {client.country && client.country !== "India" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium shrink-0">
                    {client.country}
                  </span>
                )}
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                {client.phone && (
                  <p>Phone: {client.country_code} {client.phone}</p>
                )}
                {client.email && <p>Email: {client.email}</p>}
                {client.state && <p>{getStateLabel(client.country ?? "")}: {client.state}</p>}
                {client.address && (
                  <p className="whitespace-pre-line">{client.address}</p>
                )}
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => showHistory(client)}
                  className="text-sm text-primary-600 font-medium hover:underline"
                >
                  Invoice history
                </button>
                <button
                  onClick={() => openEdit(client)}
                  className="text-sm text-slate-600 font-medium hover:underline ml-auto"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(client)}
                  className="text-sm text-red-500 font-medium hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {historyClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setHistoryClient(null)}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div
            className="relative card max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {historyClient.name} — Invoice History
                </h2>
                <p className="text-sm text-slate-500">
                  {historyInvoices.length} invoice{historyInvoices.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setHistoryClient(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading...</p>
            ) : historyInvoices.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No invoices for this client yet
              </p>
            ) : (
              <div className="space-y-2">
                {historyInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {inv.invoice_number}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(inv.invoice_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-900">
                        {formatINR(Number(inv.total))}
                      </span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}