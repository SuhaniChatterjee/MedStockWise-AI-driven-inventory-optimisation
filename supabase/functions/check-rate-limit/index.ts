import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RateLimitRequest {
  identifier: string; // email or IP
  success: boolean;
}

interface RateLimitResponse {
  allowed: boolean;
  remainingAttempts?: number;
  lockoutUntil?: string;
  message?: string;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { identifier, success }: RateLimitRequest = await req.json();

    if (!identifier) {
      return new Response(
        JSON.stringify({ error: 'Identifier is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - LOCKOUT_WINDOW_MINUTES);

    // Get recent login attempts
    const { data: attempts, error } = await supabase
      .from('login_attempts')
      .select('*')
      .eq('identifier', identifier)
      .gte('attempt_time', windowStart.toISOString())
      .order('attempt_time', { ascending: false });

    if (error) {
      console.error('Error fetching login attempts:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to check rate limit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const failedAttempts = attempts?.filter(a => !a.success).length || 0;

    // If successful login, record it and clear lockout
    if (success) {
      await supabase.from('login_attempts').insert({
        identifier,
        success: true,
      });

      const response: RateLimitResponse = {
        allowed: true,
        message: 'Login successful',
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if locked out
    if (failedAttempts >= MAX_ATTEMPTS) {
      const oldestFailedAttempt = attempts?.find(a => !a.success);
      const lockoutUntil = new Date(oldestFailedAttempt!.attempt_time);
      lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_WINDOW_MINUTES);

      if (new Date() < lockoutUntil) {
        const response: RateLimitResponse = {
          allowed: false,
          lockoutUntil: lockoutUntil.toISOString(),
          message: `Too many failed attempts. Try again in ${Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000)} minutes.`,
        };

        return new Response(
          JSON.stringify(response),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Record failed attempt
    await supabase.from('login_attempts').insert({
      identifier,
      success: false,
    });

    const response: RateLimitResponse = {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - failedAttempts - 1,
      message: `Login failed. ${MAX_ATTEMPTS - failedAttempts - 1} attempts remaining.`,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in check-rate-limit:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
