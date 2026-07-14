import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceRoleClient } from "../_shared/auth.ts";
import { parseOrError } from "../_shared/validation.ts";

// Lets the signup form show "You're joining: Mercy General Hospital" before
// the user commits, instead of only discovering an invalid code when the
// signup itself fails. Public (pre-auth) by necessity -- the caller doesn't
// have an account yet. Uses the service-role key to read hospitals (whose
// RLS otherwise restricts reads to a hospital's own members), and returns
// ONLY the hospital name for a valid code -- never the id or anything that
// would help enumerate hospitals.

const requestSchema = z.object({
  invite_code: z.string().min(1).max(64),
});

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = parseOrError(requestSchema, await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: `Invalid request: ${parsed.message}` }, 400);
    }

    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("hospitals")
      .select("name")
      .eq("invite_code", parsed.data.invite_code.trim())
      .maybeSingle();

    if (!data) {
      return jsonResponse({ valid: false });
    }

    return jsonResponse({ valid: true, hospital_name: data.name });
  } catch (error) {
    console.error("Error in validate-invite-code:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
