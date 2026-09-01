import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { deliverPendingWebhooks } from "../lib/webhooks";
import { useAuth } from "../context/AuthContext";
import type { Client, Invoice } from "../lib/types";
import { INDIAN_STATES, formatDate, COUNTRIES as ALL_COUNTRIES } from "../lib/constants";
import CountrySelect from "../components/CountrySelect";
import { formatMoney } from "../lib/currency";
import StatusBadge from "../components/StatusBadge";

// Previously a hand-maintained duplicate of constants.ts's COUNTRIES list —
// kept its own copy of every name/dial-code pair, so any future edit to the
// real list (constants.ts) would silently NOT show up here. Now derived
// directly from constants.ts, so this page always matches every other page.
const COUNTRIES = ALL_COUNTRIES.map((c) => ({ name: c.name, code: c.code }));

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
    company_name: "",
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
  const { user, profile, workspaceOwnerId, workspaceRole } = useAuth();
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
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteInvoicesToo, setDeleteInvoicesToo] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      company_name: client.company_name ?? "",
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
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedName = form.name.trim();
    const normalizedPhone = form.phone.trim();

    // Block a duplicate when ANY primary identity matches: name, email,
    // or full phone number. The old logic checked email first and skipped
    // name/phone whenever an email was present, so duplicates could still be
    // created with a different email.
    const normalizeText = (value?: string | null) =>
      (value ?? "").trim().toLocaleLowerCase();
    const normalizePhone = (countryCode?: string | null, phone?: string | null) => {
      const code = (countryCode ?? "").replace(/\D/g, "");
      const number = (phone ?? "").replace(/\D/g, "");
      return number ? `${code}${number}` : "";
    };

    const candidateName = normalizeText(normalizedName);
    const candidateEmail = normalizeText(normalizedEmail);
    const candidatePhone = normalizePhone(form.country_code, normalizedPhone);

    const { data: existingClients, error: duplicateError } = await supabase
      .from("clients")
      .select("id, name, email, phone, country_code")
      .eq("user_id", workspaceOwnerId || user.id);

    if (duplicateError) {
      setSaving(false);
      setError(duplicateError.message);
      return;
    }

    const duplicate = (existingClients ?? []).find((client) => {
      if (editingId && client.id === editingId) return false;

      const sameName = candidateName && normalizeText(client.name) === candidateName;
      const sameEmail = candidateEmail && normalizeText(client.email) === candidateEmail;
      const samePhone =
        candidatePhone && normalizePhone(client.country_code, client.phone) === candidatePhone;

      return Boolean(sameName || sameEmail || samePhone);
    });

    if (duplicate) {
      setSaving(false);
      const sameName = candidateName && normalizeText(duplicate.name) === candidateName;
      const sameEmail = candidateEmail && normalizeText(duplicate.email) === candidateEmail;
      const samePhone =
        candidatePhone && normalizePhone(duplicate.country_code, duplicate.phone) === candidatePhone;

      setError(
        sameEmail
          ? "A client with this email already exists."
          : samePhone
            ? "A client with this phone number already exists."
            : sameName
              ? "A client with this name already exists."
              : "This client already exists."
      );
      return;
    }

    const payload = {
      user_id: workspaceOwnerId || user.id,
      name: normalizedName,
      company_name: form.company_name.trim() || null,
      country: form.country,
      country_code: form.country_code,
      phone: normalizedPhone || null,
      email: normalizedEmail || null,
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
        setError(
          error.code === "23505"
            ? "A client with the same name, email, or phone number already exists."
            : error.message
        );
        return;
      }
      setClients((prev) =>
        prev.map((c) => (c.id === editingId ? (data as Client) : c))
      );
      deliverPendingWebhooks();
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(payload)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        setError(
          error.code === "23505"
            ? "A client with the same name, email, or phone number already exists."
            : error.message
        );
        return;
      }
      setClients((prev) => [data as Client, ...prev]);
      deliverPendingWebhooks();
    }
    setShowForm(false);
  }

  function requestDelete(client: Client) {
    setDeleteTarget(client);
    setDeleteInvoicesToo(false);
    setError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || !user) return;
    setDeleting(true);
    setError(null);

    // Invoices currently store the client name rather than a client_id, so
    // deleting related invoices is an explicit optional action.
    if (deleteInvoicesToo) {
      let invoiceDeleteQuery = supabase
        .from("invoices")
        .delete()
        .eq("user_id", workspaceOwnerId || user.id);

      invoiceDeleteQuery = deleteTarget.email
        ? invoiceDeleteQuery.ilike("client_email", deleteTarget.email)
        : invoiceDeleteQuery.eq("client_name", deleteTarget.name);

      const { error: invoiceDeleteError } = await invoiceDeleteQuery;
      if (invoiceDeleteError) {
        setDeleting(false);
        setError(invoiceDeleteError.message);
        return;
      }
    }

    const { error: clientDeleteError } = await supabase
      .from("clients")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("user_id", workspaceOwnerId || user.id);

    setDeleting(false);
    if (clientDeleteError) {
      setError(clientDeleteError.message);
      return;
    }

    setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
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
  const normalizedSearch = search.trim().toLowerCase();
  const filteredClients = normalizedSearch
    ? clients.filter((client) =>
        [
          client.name,
          client.company_name,
          client.email,
          client.phone,
          client.country,
        ].some((value) => value?.toLowerCase().includes(normalizedSearch))
      )
    : clients;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Client workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Clients</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">Keep contact details, tax information and invoice history organised in one place.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-center backdrop-blur">
              <p className="text-2xl font-bold">{clients.length}</p>
              <p className="text-xs text-slate-300">Saved clients</p>
            </div>
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-violet-50">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add client
            </button>
          </div>
        </div>
      </div>

      

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <form
            onSubmit={handleSubmit}
            className="relative bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto animate-scale-in border border-white"
          >
            <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-950 to-violet-950 text-white border-b border-white/10 px-6 py-5 flex items-center justify-between rounded-t-3xl">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {editingId ? "Edit Client" : "New Client"}
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Client details are reused automatically when you create invoices
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-6 space-y-6 bg-slate-50/40">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold">1</div>
                  <div><p className="font-semibold text-slate-900">Client identity</p><p className="text-xs text-slate-500">Start with the primary business or contact name.</p></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">
                      Client name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="input"
                      placeholder="John Doe"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="label">
                      Company name <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <input
                      value={form.company_name}
                      onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                      className="input"
                      placeholder="Acme Corp"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Country</label>
                  <CountrySelect value={form.country} onChange={handleCountryChange} />
                </div>

                <div>
                  <label className="label">
                    {stateLabel}
                    {availableStates.length === 0 && form.country && (
                      <span className="text-slate-400 font-normal"> (type it in)</span>
                    )}
                  </label>
                  {availableStates.length > 0 ? (
                    <select
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="input"
                    >
                      <option value="">{`Select ${stateLabel.toLowerCase()}`}</option>
                      {availableStates.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    // Bug-001 fix: Rivox only maintains a dropdown list for a
                    // handful of countries. Every other country used to get a
                    // disabled "Not applicable" select, which meant the state
                    // could never be recorded at all. A free-text field lets
                    // the client's state/province be entered for any country.
                    <input
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="input"
                      placeholder={`Enter ${stateLabel.toLowerCase()}`}
                    />
                  )}
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

{error && (
  <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
    {error}
  </div>
)}
            <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-100 px-6 py-4 flex justify-end gap-3 rounded-b-3xl">
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

      {!loading && clients.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
              placeholder="Search by client, company, email, phone or country"
              aria-label="Search clients"
            />
          </div>
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
      ) : filteredClients.length === 0 ? (
        <div className="card p-10 text-center">
          <h3 className="font-semibold text-slate-900">No matching clients</h3>
          <p className="mt-1 text-sm text-slate-500">Try a different name, company, email or phone number.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <div key={client.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md">{client.name.slice(0,1).toUpperCase()}</div>
                  <div>
                  <h3 className="font-semibold text-slate-900">{client.name}</h3>
                  {client.company_name && (
                    <p className="text-xs font-medium text-violet-700 mt-0.5">{client.company_name}</p>
                  )}
                  {client.gstin && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {client.country === "India" ? "GSTIN" : "Tax ID"}: {client.gstin}
                    </p>
                  )}
                  </div>
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
                {workspaceRole !== "staff" && <button
                  onClick={() => showHistory(client)}
                  className="text-sm text-primary-600 font-medium hover:underline"
                >
                  Invoice history
                </button>}
                <button
                  onClick={() => openEdit(client)}
                  className="text-sm text-slate-600 font-medium hover:underline ml-auto"
                >
                  Edit
                </button>
                <button
                  onClick={() => requestDelete(client)}
                  className="text-sm text-red-500 font-medium hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">Delete client data</h2>
            <p className="mt-2 text-sm text-slate-600">Choose what should be removed for <strong>{deleteTarget.name}</strong>.</p>

            <div className="mt-5 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input type="radio" name="deleteMode" checked={!deleteInvoicesToo} onChange={() => setDeleteInvoicesToo(false)} className="mt-1" />
                <span><span className="block font-semibold text-slate-900">Delete client only</span><span className="text-sm text-slate-500">Existing invoices stay in your invoice history.</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-red-200 bg-red-50/50 p-4">
                <input type="radio" name="deleteMode" checked={deleteInvoicesToo} onChange={() => setDeleteInvoicesToo(true)} className="mt-1" />
                <span><span className="block font-semibold text-red-700">Delete client and invoices</span><span className="text-sm text-red-600">All invoices matching this client name will be permanently deleted.</span></span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" disabled={deleting} onClick={confirmDelete} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {deleting ? "Deleting..." : "Delete data"}
              </button>
            </div>
          </div>
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
                        {formatMoney(
                          Number(inv.invoice_total ?? inv.total),
                          inv.invoice_currency ?? inv.business_currency ?? "INR"
                        )}
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
