import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// P1 fix from the architecture review: assignment_rules (keyword/department
// routing for auto-assignment, added in the automation engine Phase 1
// migration) only ever existed as data in the database -- there was no
// screen to view or edit it, so any change needed a new migration. This is
// a plain CRUD screen against that table, kept separate from
// AdminAutomationCenter's invoice-reminder rules (different table, despite
// the similar name) to avoid the exact confusion flagged in the review.

type Rule = {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: "keyword" | "department" | "event" | "schedule";
  match_value: string;
  target_role: "support" | "finance" | "full_access" | "limited";
  fallback_role: "support" | "finance" | "full_access" | "limited";
  priority: "low" | "medium" | "high" | "urgent";
};

const emptyDraft: Omit<Rule, "id"> = {
  name: "", is_active: true, trigger_type: "keyword", match_value: "",
  target_role: "support", fallback_role: "full_access", priority: "medium",
};

export default function AdminAssignmentRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setBusy(true);
    const { data, error } = await supabase.from("assignment_rules").select("*").order("created_at", { ascending: true });
    if (error) setNotice(error.message);
    else setRules((data as Rule[]) ?? []);
    setBusy(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(rule: Rule) {
    setBusy(true);
    const { error } = await supabase.from("assignment_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    setBusy(false);
    if (error) setNotice(error.message);
    else setRules((current) => current.map((r) => (r.id === rule.id ? { ...r, is_active: !rule.is_active } : r)));
  }

  async function saveEdit(rule: Rule) {
    setBusy(true);
    const { error } = await supabase.from("assignment_rules").update({
      name: rule.name, trigger_type: rule.trigger_type, match_value: rule.match_value,
      target_role: rule.target_role, fallback_role: rule.fallback_role, priority: rule.priority,
      updated_at: new Date().toISOString(),
    }).eq("id", rule.id);
    setBusy(false);
    setNotice(error ? error.message : "Rule updated.");
    if (!error) setEditingId(null);
  }

  async function addRule() {
    if (!draft.name.trim() || !draft.match_value.trim()) { setNotice("Name and match value are required."); return; }
    setBusy(true);
    const { error } = await supabase.from("assignment_rules").insert(draft);
    setBusy(false);
    if (error) setNotice(error.message);
    else { setNotice("Rule added."); setDraft(emptyDraft); setShowAdd(false); await load(); }
  }

  async function removeRule(id: string) {
    if (!confirm("Delete this rule? Existing assignments made by it are unaffected.")) return;
    setBusy(true);
    const { error } = await supabase.from("assignment_rules").delete().eq("id", id);
    setBusy(false);
    if (error) setNotice(error.message);
    else setRules((current) => current.filter((r) => r.id !== id));
  }

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-purple-950 to-indigo-950 p-7 text-white shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">Task &amp; ticket assignment</p>
        <h1 className="mt-3 text-3xl font-black">Auto-assignment rules</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Controls which staff role a new ticket/task auto-routes to. Keyword rules match ticket subject/message text; department rules match a task's department dropdown. Rules are checked top to bottom.
        </p>
        <button disabled={busy} onClick={() => setShowAdd((v) => !v)} className="mt-5 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-purple-100 disabled:opacity-50">{showAdd ? "Cancel" : "+ Add rule"}</button>
      </div>

      {notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      {showAdd && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-black text-slate-950">New rule</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">Name
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="e.g. Shipping keywords -> Support" />
            </label>
            <label className="text-sm font-bold text-slate-700">Trigger type
              <select value={draft.trigger_type} onChange={(e) => setDraft((d) => ({ ...d, trigger_type: e.target.value as Rule["trigger_type"] }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
                <option value="keyword">Keyword (tickets)</option>
                <option value="department">Department (tasks)</option>
                <option value="event">Event (advanced)</option>
                <option value="schedule">Schedule (advanced)</option>
              </select>
            </label>
            <label className="lg:col-span-2 text-sm font-bold text-slate-700">Match value {draft.trigger_type === "keyword" ? "(comma-separated keywords)" : "(exact value)"}
              <input value={draft.match_value} onChange={(e) => setDraft((d) => ({ ...d, match_value: e.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" placeholder="shipping,delivery,tracking" />
            </label>
            <label className="text-sm font-bold text-slate-700">Target role
              <select value={draft.target_role} onChange={(e) => setDraft((d) => ({ ...d, target_role: e.target.value as Rule["target_role"] }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
                <option value="support">Support</option><option value="finance">Finance</option><option value="full_access">Full Access</option>
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">Fallback role
              <select value={draft.fallback_role} onChange={(e) => setDraft((d) => ({ ...d, fallback_role: e.target.value as Rule["fallback_role"] }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
                <option value="full_access">Full Access</option><option value="support">Support</option><option value="finance">Finance</option>
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">Priority
              <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value as Rule["priority"] }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <div className="mt-5 flex justify-end"><button disabled={busy} onClick={addRule} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">Save rule</button></div>
        </div>
      )}

      <section className="space-y-4">
        {rules.length === 0 && !busy && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No rules yet.</p>}
        {rules.map((rule) => {
          const isEditing = editingId === rule.id;
          return (
            <article key={rule.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black text-slate-950">{rule.name}</h2>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${rule.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>{rule.is_active ? "Active" : "Disabled"}</span>
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-black text-purple-700">{rule.trigger_type}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Matches: <code className="rounded bg-slate-100 px-1.5 py-0.5">{rule.match_value}</code></p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{rule.target_role} → fallback {rule.fallback_role} · {rule.priority} priority</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => toggleActive(rule)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">{rule.is_active ? "Disable" : "Enable"}</button>
                  <button onClick={() => setEditingId(isEditing ? null : rule.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-black text-white hover:bg-indigo-700">{isEditing ? "Close" : "Edit"}</button>
                  <button disabled={busy} onClick={() => removeRule(rule.id)} className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-black text-rose-600 hover:bg-rose-50">Delete</button>
                </div>
              </div>

              {isEditing && (
                <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-2">
                  <label className="text-sm font-bold text-slate-700">Name
                    <input value={rule.name} onChange={(e) => setRules((c) => c.map((r) => r.id === rule.id ? { ...r, name: e.target.value } : r))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                  </label>
                  <label className="text-sm font-bold text-slate-700">Match value
                    <input value={rule.match_value} onChange={(e) => setRules((c) => c.map((r) => r.id === rule.id ? { ...r, match_value: e.target.value } : r))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                  </label>
                  <label className="text-sm font-bold text-slate-700">Target role
                    <select value={rule.target_role} onChange={(e) => setRules((c) => c.map((r) => r.id === rule.id ? { ...r, target_role: e.target.value as Rule["target_role"] } : r))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
                      <option value="support">Support</option><option value="finance">Finance</option><option value="full_access">Full Access</option>
                    </select>
                  </label>
                  <label className="text-sm font-bold text-slate-700">Priority
                    <select value={rule.priority} onChange={(e) => setRules((c) => c.map((r) => r.id === rule.id ? { ...r, priority: e.target.value as Rule["priority"] } : r))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3">
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <div className="lg:col-span-2 flex justify-end">
                    <button disabled={busy} onClick={() => saveEdit(rule)} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50">Save changes</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </section>
  );
}
