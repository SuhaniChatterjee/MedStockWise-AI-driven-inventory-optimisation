import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceRoleClient, requireUser } from "../_shared/auth.ts";

interface ValidatePasswordRequest {
  newPasswordHash: string;
}

interface ValidatePasswordResponse {
  valid: boolean;
  message?: string;
}

const MAX_PASSWORD_HISTORY = 5;

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceRoleClient();

    // userId is derived from the verified JWT, never trusted from the request
    // body -- otherwise any caller could read/write another user's password
    // history by passing an arbitrary userId.
    const user = await requireUser(supabase, req);
    const userId = user.id;

    const { newPasswordHash }: ValidatePasswordRequest = await req.json();

    if (!newPasswordHash) {
      return jsonResponse({ error: 'newPasswordHash is required' }, 400);
    }

    // Get password history
    const { data: history, error } = await supabase
      .from('password_history')
      .select('password_hash')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_PASSWORD_HISTORY);

    if (error) {
      console.error('Error fetching password history:', error);
      return jsonResponse({ error: 'Failed to validate password' }, 500);
    }

    // Check if password was used recently
    const passwordUsedBefore = history?.some(h => h.password_hash === newPasswordHash);

    if (passwordUsedBefore) {
      const response: ValidatePasswordResponse = {
        valid: false,
        message: `This password was used recently. Please choose a different password.`,
      };

      return jsonResponse(response);
    }

    // Store new password hash
    await supabase.from('password_history').insert({
      user_id: userId,
      password_hash: newPasswordHash,
    });

    const response: ValidatePasswordResponse = {
      valid: true,
      message: 'Password is valid',
    };

    return jsonResponse(response);

  } catch (error) {
    console.error('Error in validate-password:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = /unauthorized|missing authorization/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
