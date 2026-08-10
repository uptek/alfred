import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { VALID_ACTIONS } from './valid-actions.gen.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type'
};

const VALID_ACTIONS_SET = new Set(VALID_ACTIONS);

// Deno isolates reuse module state across requests, so build the client once
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse event data
    const body = await req.json();
    const { user_id, action, time_saved, version, metadata } = body;

    // Only process if we have the minimum required fields
    if (user_id && action && VALID_ACTIONS_SET.has(action) && typeof time_saved === 'number') {
      // Insert event - the builder resolves with { error } instead of rejecting
      const { error } = await supabase.from('events').insert({
        user_id,
        action,
        time_saved,
        version: version || null,
        metadata: metadata
      });
      if (error) console.error('Insert error:', error);
    }

    // Always return success
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Track error:', error);
    // Still return success even on errors
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
