import { getUserId, getVersion } from './helpers';

const SUPABASE_URL = 'https://obrjirdnqoiailhbsnmu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icmppcmRucW9pYWlsaGJzbm11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NzAyMzQsImV4cCI6MjA2NjA0NjIzNH0.i0cWjFKNk8HDZQsVkCn83fTKFROiNzvPf_sTP5xQwAM';
const TRACK_ENDPOINT = `${SUPABASE_URL}/functions/v1/track`;

// Valid action types
export type AnalyticsAction =
  | 'open_in_admin'
  | 'open_in_customizer'
  | 'copy_product_json'
  | 'copy_cart_json'
  | 'copy_theme_preview_url'
  | 'clear_cart'
  | 'save_preset'
  | 'apply_preset'
  | 'appstore_partner_table_view'
  | 'appstore_partner_table_sort'
  | 'appstore_partner_table_export'
  | 'open_section_in_code_editor'
  | 'disable_theme_inspector'
  | 'resize_theme_customizer'
  | 'toggle_admin_sidebar'
  | 'detect_theme'
  | 'autofill_storefront_password'
  | 'open_image_in_admin'
  | 'exit_theme_preview'
  | 'theme_list_copy_id'
  | 'theme_list_copy_preview_url'
  | 'theme_list_preview'
  | 'theme_list_edit_code'
  | 'cart_superpowers_open'
  | 'cart_superpowers_add_item'
  | 'cart_superpowers_update_quantity'
  | 'cart_superpowers_remove_item'
  | 'cart_superpowers_clear'
  | 'cart_superpowers_apply_discount'
  | 'cart_superpowers_update_note'
  | 'cart_superpowers_calculate_shipping'
  | 'cart_superpowers_update_properties'
  | 'cart_superpowers_switch_variant'
  | 'cart_superpowers_update_attributes'
  | 'cart_superpowers_remove_discount'
  | 'cart_superpowers_inspect_json';

// Time savings per action (in seconds)
const TIME_SAVINGS: Record<AnalyticsAction, number | ((metadata?: Record<string, unknown>) => number)> = {
  open_in_admin: (metadata) => {
    // Homepage is quickest to navigate to manually
    if (metadata?.page_type === 'homepage') return 10;
    // Products, pages, articles require more navigation
    if (['product', 'page', 'article'].includes(metadata?.page_type as string)) return 45;
    // Default for other pages
    return 25;
  },
  open_in_customizer: (metadata) => {
    // Homepage is quickest to navigate to manually
    if (metadata?.page_type === 'homepage') return 20;
    // Products, pages, articles require more navigation
    if (['product', 'page', 'article'].includes(metadata?.page_type as string)) return 45;
    // Default for other pages
    return 30;
  },
  copy_product_json: 30,
  copy_cart_json: 30,
  copy_theme_preview_url: 40,
  clear_cart: 30,
  save_preset: 0,
  apply_preset: (metadata) => {
    return 45 + (metadata?.has_custom_message ? 20 : 0);
  },
  appstore_partner_table_view: (metadata) => Number(metadata?.app_count ?? 0) * 5,
  appstore_partner_table_sort: (metadata) => Number(metadata?.app_count ?? 0) * 2,
  appstore_partner_table_export: (metadata) => Number(metadata?.app_count ?? 0) * 10 + 30,
  open_section_in_code_editor: 30,
  disable_theme_inspector: 3,
  resize_theme_customizer: 3,
  toggle_admin_sidebar: 0,
  detect_theme: 15,
  autofill_storefront_password: 10,
  open_image_in_admin: 15,
  exit_theme_preview: 20,
  theme_list_copy_id: 10,
  theme_list_copy_preview_url: 10,
  theme_list_preview: 5,
  theme_list_edit_code: 5,
  cart_superpowers_open: 0,
  cart_superpowers_add_item: 60,
  cart_superpowers_update_quantity: 15,
  cart_superpowers_remove_item: 15,
  cart_superpowers_clear: 30,
  cart_superpowers_apply_discount: 20,
  cart_superpowers_update_note: 15,
  cart_superpowers_calculate_shipping: 60,
  cart_superpowers_update_properties: 60,
  cart_superpowers_switch_variant: 120,
  cart_superpowers_update_attributes: 60,
  cart_superpowers_remove_discount: 15,
  cart_superpowers_inspect_json: 45
};

/**
 * Track a user action
 * @param action - The action to track
 * @param metadata - Additional metadata for the action (should include page_url, page_type, shop_domain)
 */
export async function trackAction(action: AnalyticsAction, metadata?: Record<string, unknown>): Promise<void> {
  try {
    // Get all required data
    const userId = await getUserId();
    const version = getVersion();

    // Calculate time saved
    const timeSavingConfig = TIME_SAVINGS[action];
    const timeSaved = typeof timeSavingConfig === 'function' ? timeSavingConfig(metadata) : timeSavingConfig;

    // Prepare event data
    const eventData = {
      user_id: userId,
      action,
      time_saved: timeSaved,
      version,
      metadata: metadata ?? {}
    };

    // Disable analytics in development
    if (import.meta.env.DEV) {
      console.log('[Dev Mode] Event not sent:', eventData);
      return;
    }

    // Send to Supabase (fire and forget)
    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(eventData)
    }).catch(() => {
      // Silently ignore errors - analytics should never break the user experience
    });
  } catch (error) {
    // Silently ignore all errors
    console.debug('Analytics error:', error);
  }
}
