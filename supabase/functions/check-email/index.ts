import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Simple in-memory rate limiter: max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Rate limit check
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return Response.json(
      { exists: false, error: "Too many requests. Please try again later." },
      { status: 429, headers: corsHeaders }
    );
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return Response.json(
        { exists: false, error: "Email is required." },
        { status: 400, headers: corsHeaders }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Basic email format validation to prevent abuse
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json(
        { exists: false, error: "Invalid email format." },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { exists: false, error: "Server configuration missing." },
        { status: 500, headers: corsHeaders }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    let page = 1;
    let exists = false;

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (error) {
        return Response.json(
          { exists: false, error: error.message },
          { status: 500, headers: corsHeaders }
        );
      }

      const users = data.users ?? [];

      exists = users.some(
        (user) => user.email?.toLowerCase() === normalizedEmail
      );

      if (exists || users.length < 1000) break;

      page++;
    }

    return Response.json(
      {
        exists,
        message: exists
          ? "This email is already registered. Please sign in."
          : "Email is available.",
      },
      { headers: corsHeaders }
    );
  } catch {
    return Response.json(
      { exists: false, error: "Invalid request." },
      { status: 400, headers: corsHeaders }
    );
  }
});
