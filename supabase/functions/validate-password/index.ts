import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidatePasswordRequest {
  userId: string;
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { userId, newPasswordHash }: ValidatePasswordRequest = await req.json();

    if (!userId || !newPasswordHash) {
      return new Response(
        JSON.stringify({ error: 'userId and newPasswordHash are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Failed to validate password' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if password was used recently
    const passwordUsedBefore = history?.some(h => h.password_hash === newPasswordHash);

    if (passwordUsedBefore) {
      const response: ValidatePasswordResponse = {
        valid: false,
        message: `This password was used recently. Please choose a different password.`,
      };

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in validate-password:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
