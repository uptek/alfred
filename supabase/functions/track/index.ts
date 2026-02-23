import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type'
};

// Valid actions
const VALID_ACTIONS = [
  'open_in_admin',
  'open_in_customizer',
  'copy_product_json',
  'copy_cart_json',
  'copy_theme_preview_url',
  'clear_cart',
  'save_preset',
  'apply_preset',
  'appstore_partner_table_view',
  'appstore_partner_table_sort',
  'appstore_partner_table_export',
  'open_section_in_code_editor',
  'disable_theme_inspector',
  'resize_theme_customizer',
  'toggle_admin_sidebar',
  'detect_theme'
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Parse event data
    const body = await req.json();
    const { user_id, action, time_saved, version, metadata } = body;

    // Only process if we have the minimum required fields
    if (user_id && action && VALID_ACTIONS.includes(action) && typeof time_saved === 'number') {
      // Insert event - ignore any errors
      await supabase
        .from('events')
        .insert({
          user_id,
          action,
          time_saved,
          version: version || null,
          metadata: metadata
        })
        .then(() => {})
        .catch((err) => console.error('Insert error:', err));
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
