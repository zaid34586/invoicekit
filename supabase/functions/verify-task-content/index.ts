// verify-task-content
//
// Staff submits a content draft for a task that has requires_verification =
// true. This function saves the draft, asks Google Gemini (free tier) to
// check it against the task brief + resources, stores the verdict
// (pass/fail) + feedback on the task row, and returns the verdict to the
// caller.
//
// Auth: caller must be an active admin_team_members row, and must either be
// the task's assignee or a full_access staff member. Same pattern as the
// other staff-facing functions in this project.

import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, service);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const email = (user.email ?? "").toLowerCase();
    const { data: staff } = await admin
      .from("admin_team_members")
      .select("id, role, status")
      .or(`auth_user_id.eq.${user.id},email.eq.${email}`)
      .maybeSingle();
    if (!staff || staff.status !== "active") return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const taskId = body.task_id as string | undefined;
    const draftContent = (body.draft_content as string | undefined)?.trim() ?? "";
    if (!taskId) return json({ error: "task_id is required" }, 400);
    if (!draftContent) return json({ error: "draft_content is empty" }, 400);

    const { data: task, error: taskError } = await admin
      .from("admin_tasks")
      .select("id, title, description, resources, assigned_to, requires_verification")
      .eq("id", taskId)
      .maybeSingle();
    if (taskError || !task) return json({ error: "Task not found" }, 404);

    const isOwner = task.assigned_to === staff.id;
    const isAdmin = staff.role === "full_access";
    if (!isOwner && !isAdmin) return json({ error: "You are not assigned to this task" }, 403);

    // Save the draft immediately + mark verification as running, so the UI
    // can show "checking..." even if the AI call is slow or fails.
    await admin
      .from("admin_tasks")
      .update({ draft_content: draftContent, ai_verification_status: "pending" })
      .eq("id", taskId);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      await admin
        .from("admin_tasks")
        .update({ ai_verification_status: null, ai_verification_feedback: null })
        .eq("id", taskId);
      return json({ error: "AI verification is not configured. Ask the admin to set the GEMINI_API_KEY secret (free key from aistudio.google.com)." }, 503);
    }

    const resources: Array<{ label?: string; url?: string }> = Array.isArray(task.resources) ? task.resources : [];
    const resourceLines = resources.length
      ? resources.map((r) => `- ${r.label || "Resource"}: ${r.url || ""}`).join("\n")
      : "(no resources attached)";

    const prompt = `You are reviewing a staff member's content draft against a task brief before it is approved.

Task title: ${task.title}

Task brief / instructions:
${task.description || "(no description provided)"}

Attached resources / brand guidelines (reference by URL, you cannot open links — judge the draft on its own merit and note if it fails to reference required resources):
${resourceLines}

Staff draft submission:
"""
${draftContent}
"""

Check whether the draft reasonably satisfies the brief: does it cover what was asked, match any stated tone/format/brand requirements, and is it free of obvious factual or grammatical problems? Be a reasonably strict but fair reviewer — minor stylistic taste is not a fail reason, but missing requested elements or ignoring instructions is.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"verdict": "pass" or "fail", "feedback": "2-4 sentences explaining the decision and what to fix if failing"}`;

    let verdict: "pass" | "fail" = "fail";
    let feedback = "AI verification could not be completed. Please try again.";

    try {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
              maxOutputTokens: 400,
            },
          }),
        }
      );

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`Gemini API error (${aiResponse.status}): ${errText.slice(0, 300)}`);
      }

      const aiData = await aiResponse.json();
      const rawText: string = aiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.verdict === "pass" || parsed.verdict === "fail") verdict = parsed.verdict;
      if (typeof parsed.feedback === "string" && parsed.feedback.trim()) feedback = parsed.feedback.trim();
    } catch (aiErr) {
      await admin
        .from("admin_tasks")
        .update({ ai_verification_status: null, ai_verification_feedback: null })
        .eq("id", taskId);
      return json({ error: aiErr instanceof Error ? aiErr.message : "AI verification failed" }, 502);
    }

    await admin
      .from("admin_tasks")
      .update({
        ai_verification_status: verdict,
        ai_verification_feedback: feedback,
        ai_verified_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await admin.from("admin_audit_logs").insert({
      actor_user_id: user.id,
      action: "ai_verify_task_content",
      target_type: "task",
      target_id: taskId,
      details: { verdict, staff_email: email },
    });

    return json({ ok: true, verdict, feedback });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
});

