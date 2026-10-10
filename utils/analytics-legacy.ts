// Every analytics action name that has left ANALYTICS_ACTIONS, mapped to the
// name it has now. Builds already installed keep sending old names until Chrome
// updates them, so the track Worker upgrades them on arrival. Names of retired
// features map too, so stored history reads one way, but the Worker drops them.
// The same rules drive the D1 backfill (scripts/backfill-event-names.ts) and the
// Supabase import. Only the Worker and scripts import this file, never the
// extension.

/**
 * One way an old event upgrades. A list's first rule whose `when` matches wins;
 * a rule without `when` always matches.
 */
export interface LegacyRule {
  /** New action name. A retired one (not in ANALYTICS_ACTIONS) is renamed in history but dropped at the edge. */
  to: string;
  /** Metadata condition: `key` equals `equals`, or with no `equals`, `key` is present. */
  when?: { key: string; equals?: string };
  /** Metadata keys to rename, keeping their values. */
  rename?: Record<string, string>;
  /** Metadata values to add, applied after `rename`. */
  set?: Record<string, string>;
}

const to = (name: string): readonly LegacyRule[] => [{ to: name }];

// The review modal (SuccessNudge) always sends `variant`; the ambient star
// prompt in the popup brand bar (ReviewPrompt) never does.
const byReviewWidget = (modal: string, prompt: string): readonly LegacyRule[] => [
  { to: modal, when: { key: 'variant' } },
  { to: prompt }
];

const credit = (source: string, name: string): LegacyRule => ({ to: name, when: { key: 'source', equals: source } });

export const LEGACY_ACTIONS: Record<string, readonly LegacyRule[]> = {
  // Popup
  popup_open: to('popup.app.open'),
  detect_theme: to('popup.theme.detect'),
  review_nudge_show: byReviewWidget('popup.review_nudge.show', 'popup.review_prompt.show'),
  review_nudge_dismiss: byReviewWidget('popup.review_nudge.dismiss', 'popup.review_prompt.dismiss'),
  review_nudge_click: to('popup.review_prompt.credit_click'),
  review_nudge_clicked: to('popup.review_prompt.credit_click'),
  overview_view: to('popup.overview.view'),
  overview_copy: to('popup.overview.copy'),
  overview_quick_link: to('popup.overview.quick_link_click'),
  overview_social_profile: to('popup.overview.social_profile_click'),
  headings_view: to('popup.headings.view'),
  headings_scroll_to: to('popup.headings.locate'),
  headings_copy: to('popup.headings.copy'),
  headings_toggle_hidden: to('popup.headings.hidden_toggle'),
  links_view: to('popup.links.view'),
  links_filter: to('popup.links.filter'),
  links_highlight: to('popup.links.highlight'),
  links_scroll_to: to('popup.links.locate'),
  links_export: to('popup.links.export'),
  links_copy: to('popup.links.copy'),
  links_sort: to('popup.links.sort'),
  links_toggle_hidden: to('popup.links.hidden_toggle'),
  links_check_status: to('popup.links.status_check'),
  assets_view: to('popup.assets.view'),
  assets_filter: to('popup.assets.filter'),
  assets_export: to('popup.assets.export'),
  assets_copy: to('popup.assets.copy'),
  assets_view_source: to('popup.assets.source_view'),
  assets_expand_inline: to('popup.assets.inline_expand'),
  assets_sort: to('popup.assets.sort'),
  images_view: to('popup.images.view'),
  images_filter: to('popup.images.filter'),
  images_highlight: to('popup.images.highlight'),
  images_scroll_to: to('popup.images.locate'),
  images_export: to('popup.images.export'),
  images_copy: to('popup.images.copy'),
  images_sort: to('popup.images.sort'),
  images_open: [{ to: 'popup.images.open', rename: { source: 'element' } }],
  schema_view: to('popup.schema.view'),
  schema_copy: to('popup.schema.copy'),
  schema_export: to('popup.schema.export'),
  robots_view: to('popup.robots.view'),
  robots_goto_line: to('popup.robots.line_locate'),
  robots_copy: to('popup.robots.copy'),
  robots_open: to('popup.robots.open'),
  robots_ai_toggle: to('popup.robots.ai_toggle'),
  robots_wrap_toggle: to('popup.robots.wrap_toggle'),
  social_view: to('popup.social.view'),
  social_platform_click: to('popup.social.platform_switch'),
  social_copy_tags: to('popup.social.tags_copy'),
  hreflangs_view: to('popup.hreflangs.view'),
  hreflangs_copy: to('popup.hreflangs.copy'),
  hreflangs_export: to('popup.hreflangs.export'),
  sitemaps_view: to('popup.sitemaps.view'),
  sitemaps_open: to('popup.sitemaps.open'),
  sitemaps_copy: to('popup.sitemaps.copy'),
  sitemaps_copy_urls: to('popup.sitemaps.urls_copy'),
  sitemaps_export: to('popup.sitemaps.export'),
  sitemaps_search: to('popup.sitemaps.search'),

  // Storefront
  open_in_admin: to('storefront.shortcuts.admin_open'),
  open_in_customizer: to('storefront.shortcuts.customizer_open'),
  open_section_in_code_editor: to('storefront.shortcuts.code_editor_open'),
  open_image_in_admin: to('storefront.shortcuts.admin_files_open'),
  copy_theme_preview_url: [{ to: 'storefront.shortcuts.preview_url_copy', rename: { source: 'trigger' } }],
  exit_theme_preview: to('storefront.shortcuts.preview_exit'),
  copy_product_json: to('storefront.shortcuts.product_json_copy'),
  copy_cart_json: to('storefront.shortcuts.cart_json_copy'),
  clear_cart: to('storefront.shortcuts.cart_clear'),
  request_access_context_menu: [{ to: 'storefront.shortcuts.access_request', rename: { source: 'scope' } }],
  autofill_storefront_password: to('storefront.password.autofill'),
  cartograph_open: to('storefront.cartograph.open'),
  cartograph_add_item: to('storefront.cartograph.item_add'),
  cartograph_update_quantity: to('storefront.cartograph.quantity_update'),
  cartograph_remove_item: to('storefront.cartograph.item_remove'),
  cartograph_clear: to('storefront.cartograph.clear'),
  cartograph_apply_discount: to('storefront.cartograph.discount_apply'),
  cartograph_remove_discount: to('storefront.cartograph.discount_remove'),
  cartograph_update_note: to('storefront.cartograph.note_update'),
  cartograph_calculate_shipping: to('storefront.cartograph.shipping_calculate'),
  cartograph_update_properties: to('storefront.cartograph.properties_update'),
  cartograph_update_attributes: to('storefront.cartograph.attributes_update'),
  cartograph_switch_variant: to('storefront.cartograph.variant_switch'),
  cartograph_inspect_json: to('storefront.cartograph.json_inspect'),

  // Admin
  timeline_view: to('admin.timeline.view'),
  theme_list_copy_preview_url: to('admin.theme_list.preview_url_copy'),
  theme_list_copy_id: to('admin.theme_list.id_copy'),
  theme_list_preview: to('admin.theme_list.preview_open'),
  theme_list_edit_code: to('admin.theme_list.code_editor_open'),
  resize_theme_customizer: to('admin.theme_editor.panel_resize'),
  disable_theme_inspector: to('admin.theme_editor.inspector_disable'),
  toggle_admin_sidebar: to('admin.sidebar.toggle'),

  // Dev Dashboard
  apply_preset: [
    {
      to: 'dev.collaborator_access.preset_apply',
      when: { key: 'source', equals: 'manual' },
      rename: { source: 'trigger' },
      set: { trigger: 'button' }
    },
    { to: 'dev.collaborator_access.preset_apply', rename: { source: 'trigger' } }
  ],
  save_preset: to('dev.collaborator_access.preset_save'),
  preset_auto_submit: [{ to: 'dev.collaborator_access.request_submit', rename: { source: 'trigger' } }],
  permission_search: to('dev.collaborator_access.permission_search'),
  expand_all_permissions: to('dev.collaborator_access.permissions_expand'),
  collapse_all_permissions: to('dev.collaborator_access.permissions_collapse'),

  // App Store
  appstore_partner_table_view: to('apps.partner_table.view'),
  appstore_partner_table_sort: to('apps.partner_table.sort'),
  appstore_partner_table_export: to('apps.partner_table.export'),
  compare_add_app: to('apps.compare.app_add'),
  compare_view: to('apps.compare.view'),
  compare_export_markdown: [{ to: 'apps.compare.export', set: { format: 'markdown' } }],
  compare_export_csv: [{ to: 'apps.compare.export', set: { format: 'csv' } }],
  compare_export_json: [{ to: 'apps.compare.export', set: { format: 'json' } }],
  compare_share: to('apps.compare.share'),

  // System
  heartbeat: to('system.extension.ping'),
  uninstall: to('system.extension.uninstall'),

  // Credit chips and review stars, told apart by the component that hosted them
  credit_click: [
    // Of every released build, only the review modal sent a variant with credit_click
    { to: 'popup.review_nudge.credit_click', when: { key: 'variant' } },
    credit('review_nudge', 'popup.review_prompt.credit_click'),
    credit('cartograph', 'storefront.cartograph.credit_click'),
    credit('timeline', 'admin.timeline.credit_click'),
    credit('collaborator_access', 'dev.collaborator_access.credit_click'),
    credit('partner_table', 'apps.partner_table.credit_click'),
    credit('compare', 'apps.compare.credit_click'),
    credit('options', 'options.review_request.credit_click')
  ]
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function matches(rule: LegacyRule, metadata: Record<string, unknown>): boolean {
  if (!rule.when) return true;
  const { key, equals } = rule.when;
  return equals === undefined ? key in metadata : metadata[key] === equals;
}

/**
 * Upgrades a legacy event to its current name and metadata.
 * @returns null when the action has no legacy entry or no rule matches
 */
export function upgradeLegacyEvent(action: string, metadata: unknown): { action: string; metadata: unknown } | null {
  const fields = isPlainObject(metadata) ? metadata : {};
  if (!Object.hasOwn(LEGACY_ACTIONS, action)) return null;
  const rule = LEGACY_ACTIONS[action]!.find((candidate) => matches(candidate, fields));
  if (!rule) return null;
  // Malformed metadata passes through for the caller's own validation to reject
  if (!isPlainObject(metadata)) return { action: rule.to, metadata };

  const upgraded = { ...metadata };
  for (const [from, into] of Object.entries(rule.rename ?? {})) {
    if (!(from in upgraded)) continue;
    upgraded[into] = upgraded[from];
    delete upgraded[from];
  }
  return { action: rule.to, metadata: { ...upgraded, ...rule.set } };
}
