import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, code } = await req.json();

    if (!phone || !code) {
      return Response.json(
        { error: "Phone and OTP are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!accountSid || !authToken || !serviceSid) {
      return Response.json(
        { error: "Twilio secrets missing" },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = new URLSearchParams({
      To: phone,
      Code: code,
    });

    const twilioRes = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const result = await twilioRes.json();

    if (!twilioRes.ok) {
      return Response.json(
        { error: result.message || "OTP verification failed" },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: result.status === "approved",
        status: result.status,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});