import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type'
};

// Valid actions — must match AnalyticsAction type in utils/analytics.ts
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
  'detect_theme',
  'autofill_storefront_password',
  'open_image_in_admin',
  'exit_theme_preview',
  'theme_list_copy_id',
  'theme_list_copy_preview_url',
  'theme_list_preview',
  'theme_list_edit_code',
  'cartograph_open',
  'cartograph_add_item',
  'cartograph_update_quantity',
  'cartograph_remove_item',
  'cartograph_clear',
  'cartograph_apply_discount',
  'cartograph_update_note',
  'cartograph_calculate_shipping',
  'cartograph_update_properties',
  'cartograph_switch_variant',
  'cartograph_update_attributes',
  'cartograph_remove_discount',
  'cartograph_inspect_json',
  'review_nudge_shown',
  'review_nudge_clicked',
  'review_nudge_dismissed'
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
