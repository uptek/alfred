import { getUserId, getVersion } from './helpers';

const SUPABASE_URL = 'https://obrjirdnqoiailhbsnmu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icmppcmRucW9pYWlsaGJzbm11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NzAyMzQsImV4cCI6MjA2NjA0NjIzNH0.i0cWjFKNk8HDZQsVkCn83fTKFROiNzvPf_sTP5xQwAM';
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
  | 'appstore_partner_table_sort';

// Time savings per action (in seconds)
const TIME_SAVINGS: Record<AnalyticsAction, number | ((metadata?: any) => number)> = {
  open_in_admin: (metadata) => {
    // Homepage is quickest to navigate to manually
    if (metadata?.page_type === 'homepage') return 10;
    // Products, pages, articles require more navigation
    if (['product', 'page', 'article'].includes(metadata?.page_type)) return 45;
    // Default for other pages
    return 25;
  },
  open_in_customizer: (metadata) => {
    // Homepage is quickest to navigate to manually
    if (metadata?.page_type === 'homepage') return 20;
    // Products, pages, articles require more navigation
    if (['product', 'page', 'article'].includes(metadata?.page_type)) return 45;
    // Default for other pages
    return 30;
  },
  copy_product_json: 30,
  copy_cart_json: 30,
  copy_theme_preview_url: 40,
  clear_cart: 30,
  save_preset: 0,
  apply_preset: (metadata) => {
    const baseTime = 45;
    const permissionsTime = (metadata?.permissions_count || 0) * 2;
    const messageTime = metadata?.had_custom_message ? 30 : 0;
    return baseTime + permissionsTime + messageTime;
  },
  appstore_partner_table_view: (metadata) => (metadata?.app_count || 0) * 20,
  appstore_partner_table_sort: (metadata) => (metadata?.app_count || 0) * 5,
};

/**
 * Track a user action
 * @param action - The action to track
 * @param metadata - Additional metadata for the action (should include page_url, page_type, shop_domain)
 */
export async function trackAction(
  action: AnalyticsAction,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Get all required data
    const [userId, version] = await Promise.all([
      getUserId(),
      getVersion(),
    ]);

    // Calculate time saved
    const timeSavingConfig = TIME_SAVINGS[action];
    const timeSaved = typeof timeSavingConfig === 'function'
      ? timeSavingConfig(metadata)
      : timeSavingConfig;

    // Prepare event data
    const eventData = {
      user_id: userId,
      action,
      time_saved: timeSaved,
      version,
      metadata: metadata || {},
    };

    // Check if analytics is disabled via environment variable
    if (import.meta.env.VITE_ANALYTICS === 'false') {
      console.log('[Analytics Dev Mode] Event not sent:', eventData);
      return;
    }

    // Send to Supabase (fire and forget)
    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(eventData),
    }).catch(() => {
      // Silently ignore errors - analytics should never break the user experience
    });
  } catch (error) {
    // Silently ignore all errors
    console.debug('Analytics error:', error);
  }
}