import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return json(
        { success: false, error: "Server configuration missing" },
        500
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return json({ success: false, error: "Invalid user session" }, 401);
    }

    const userId = user.id;
    const email = user.email ?? null;

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: invoices } = await admin
      .from("invoices")
      .select("*")
      .eq("user_id", userId);

    if (profile) {
      await admin.from("archived_users").insert({
        old_user_id: userId,
        email,
        business_name: profile.business_name ?? null,
        phone: profile.phone ?? null,
        gstin: profile.gstin ?? null,
        archive_reason: "account_deleted",
        deleted_by: "user",
      });

      await admin.from("archived_profiles").insert({
        old_user_id: userId,
        profile_data: profile,
      });
    } else {
      await admin.from("archived_users").insert({
        old_user_id: userId,
        email,
        archive_reason: "account_deleted",
        deleted_by: "user",
      });
    }

    if (invoices && invoices.length > 0) {
      await admin.from("archived_invoices").insert(
        invoices.map((invoice) => ({
          old_user_id: userId,
          invoice_data: invoice,
        }))
      );
    }

    await admin.from("invoices").delete().eq("user_id", userId);
    await admin.from("clients").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      return json(
        {
          success: false,
          error: deleteUserError.message,
        },
        500
      );
    }

    return json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Something went wrong",
      },
      500
    );
  }
});