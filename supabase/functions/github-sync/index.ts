import { createClient } from "@supabase/supabase-js";

// P3 — GitHub integration: links a support ticket (typically category="bug")
// to a GitHub issue, and auto-resolves the ticket when that issue closes.
//
// Required secrets (Supabase Dashboard -> Edge Functions -> github-sync -> Secrets):
//   GITHUB_TOKEN           a GitHub personal access token with "repo" scope
//   GITHUB_REPO            "owner/repo", e.g. "zaid34586/invoicekit"
//   GITHUB_WEBHOOK_SECRET  any long random string — set the SAME value when
//                          creating the webhook in GitHub repo settings
//   ADMIN_EMAIL            (already used elsewhere) — restricts who can
//                          trigger create_issue from the admin panel

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,content-type,apikey,x-client-info,x-hub-signature-256" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyGithubSignature(secret: string, rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, service);
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const githubRepo = Deno.env.get("GITHUB_REPO"); // "owner/repo"

  try {
    // ── Path 1: GitHub webhook (issue closed -> auto-resolve ticket) ───────
    // GitHub signs the raw body, so it must be read before any JSON parsing.
    const isGithubWebhook = req.headers.has("x-hub-signature-256") || req.headers.has("x-github-event");
    if (isGithubWebhook) {
      const rawBody = await req.text();
      const webhookSecret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
      const ok = webhookSecret ? await verifyGithubSignature(webhookSecret, rawBody, req.headers.get("x-hub-signature-256")) : false;
      if (!ok) return json({ error: "Invalid webhook signature" }, 401);

      const event = req.headers.get("x-github-event");
      const payload = JSON.parse(rawBody);
      if (event === "issues" && payload.action === "closed") {
        const issueNumber = payload.issue?.number;
        const { data: ticket } = await admin.from("admin_support_tickets").select("*").eq("github_issue_number", issueNumber).maybeSingle();
        if (ticket && ticket.status !== "resolved" && ticket.status !== "closed") {
          const now = new Date().toISOString();
          await admin.from("admin_support_tickets").update({ status: "resolved", updated_at: now }).eq("id", ticket.id);
          await admin.from("support_ticket_messages").insert([
            { ticket_id: ticket.id, author_type: "admin", message: `This issue has been fixed and the linked GitHub issue (#${issueNumber}) was closed. Marking this ticket resolved.`, is_internal: false },
            { ticket_id: ticket.id, author_type: "admin", message: `Auto-resolved via GitHub webhook (issue #${issueNumber} closed by ${payload.sender?.login ?? "unknown"}).`, is_internal: true },
          ]);
        }
        return json({ ok: true, matched: !!ticket });
      }
      return json({ ok: true, ignored: event });
    }

    // ── Path 2: called from the admin panel to create a GitHub issue ───────
    const auth = req.headers.get("authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email || user.email.toLowerCase() !== (Deno.env.get("ADMIN_EMAIL") || "").toLowerCase()) {
      return json({ error: "Admin access only" }, 403);
    }
    if (!githubToken || !githubRepo) return json({ error: "GITHUB_TOKEN / GITHUB_REPO not configured" }, 400);

    const body = await req.json();
    if (body.action !== "create_issue" || !body.ticketId) return json({ error: "Invalid request" }, 400);

    const { data: ticket, error: ticketError } = await admin.from("admin_support_tickets").select("*").eq("id", body.ticketId).maybeSingle();
    if (ticketError || !ticket) return json({ error: "Ticket not found" }, 404);
    if (ticket.github_issue_number) return json({ error: "This ticket is already linked to a GitHub issue", issue_url: ticket.github_issue_url }, 400);

    const ghResponse = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[${ticket.ticket_number || ticket.id}] ${ticket.subject}`,
        body: `${ticket.message || "(no description)"}\n\n---\nFiled from Rivox support ticket \`${ticket.ticket_number || ticket.id}\` (priority: ${ticket.priority}, category: ${ticket.category}).`,
        labels: ["bug", "from-rivox-support"],
      }),
    });
    if (!ghResponse.ok) {
      const errBody = await ghResponse.text();
      return json({ error: `GitHub API error: ${errBody.slice(0, 300)}` }, 502);
    }
    const issue = await ghResponse.json();

    await admin.from("admin_support_tickets").update({ github_issue_number: issue.number, github_issue_url: issue.html_url }).eq("id", ticket.id);
    await admin.from("support_ticket_messages").insert({ ticket_id: ticket.id, author_type: "admin", message: `Linked to GitHub issue #${issue.number}: ${issue.html_url}`, is_internal: true });

    return json({ ok: true, issue_number: issue.number, issue_url: issue.html_url });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
