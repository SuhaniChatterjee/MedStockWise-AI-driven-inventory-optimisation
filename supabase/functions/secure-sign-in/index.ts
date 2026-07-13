import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceRoleClient } from "../_shared/auth.ts";

// Replaces the old client-trusted "check-rate-limit" function. That design
// took a client-reported `success` boolean at face value, which meant anyone
// could call the endpoint directly and lie about the outcome -- either to
// clear their own lockout, or to fabricate failed attempts against a
// victim's email to force a lockout (DoS). Here the sign-in itself happens
// server-side, so the recorded outcome is always the real one.

const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

interface SignInRequest {
  email: string;
  password: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password }: SignInRequest = await req.json();

    if (!email || !password) {
      return jsonResponse({ error: "Email and password are required" }, 400);
    }

    const identifier = email.trim().toLowerCase();
    const serviceClient = createServiceRoleClient();

    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - LOCKOUT_WINDOW_MINUTES);

    const { data: attempts, error: attemptsError } = await serviceClient
      .from("login_attempts")
      .select("attempt_time, success")
      .eq("identifier", identifier)
      .gte("attempt_time", windowStart.toISOString())
      .order("attempt_time", { ascending: false });

    if (attemptsError) {
      console.error("Error fetching login attempts:", attemptsError);
      return jsonResponse({ error: "Failed to check rate limit" }, 500);
    }

    const failedAttempts = attempts?.filter((a) => !a.success).length ?? 0;

    if (failedAttempts >= MAX_ATTEMPTS) {
      const oldestFailedAttempt = attempts?.find((a) => !a.success);
      const lockoutUntil = new Date(oldestFailedAttempt!.attempt_time);
      lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_WINDOW_MINUTES);

      if (new Date() < lockoutUntil) {
        // Note: intentionally returns HTTP 200 with success:false (rather than
        // 429) -- supabase-js's functions.invoke() surfaces any non-2xx as an
        // SDK-level error object instead of `data`, which is awkward for the
        // frontend to unpack. Expected business outcomes (lockout, bad
        // credentials) stay in the 200 response body; only unexpected
        // failures below use non-2xx status codes.
        return jsonResponse({
          success: false,
          lockoutUntil: lockoutUntil.toISOString(),
          message: `Too many failed attempts. Try again in ${Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000)} minutes.`,
        });
      }
    }

    // Perform the real sign-in against GoTrue using the anon key, so the
    // outcome we record is genuine rather than client-asserted.
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    await serviceClient.from("login_attempts").insert({
      identifier,
      success: !signInError,
    });

    if (signInError || !data.session) {
      const remaining = Math.max(0, MAX_ATTEMPTS - failedAttempts - 1);
      return jsonResponse({
        success: false,
        remainingAttempts: remaining,
        message: remaining > 0
          ? `Invalid credentials. ${remaining} attempt(s) remaining before lockout.`
          : "Invalid credentials. Account will be temporarily locked after this attempt.",
      });
    }

    return jsonResponse({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error("Error in secure-sign-in:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
