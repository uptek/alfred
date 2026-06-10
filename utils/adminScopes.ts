/**
 * Static registry of Shopify Admin API access scopes and quick-select bundles
 * for the Access Token Generator.
 *
 * Source: https://shopify.dev/docs/api/usage/access-scopes
 */

export interface AdminScope {
  /** Scope handle sent to Shopify, e.g. "read_products" */
  handle: string;
  /** Human-readable label, e.g. "Products (read)" */
  label: string;
  /** Group used to cluster scopes in the checklist UI */
  group: string;
}

export interface ScopeBundle {
  id: string;
  label: string;
  description: string;
  scopes: string[];
}

export const ADMIN_SCOPES: AdminScope[] = [
  // Products
  { handle: 'read_products', label: 'Products (read)', group: 'Products' },
  { handle: 'write_products', label: 'Products (write)', group: 'Products' },
  { handle: 'read_product_listings', label: 'Product Listings (read)', group: 'Products' },
  { handle: 'read_product_feeds', label: 'Product Feeds (read)', group: 'Products' },
  { handle: 'write_product_feeds', label: 'Product Feeds (write)', group: 'Products' },
  { handle: 'read_purchase_options', label: 'Purchase Options (read)', group: 'Products' },
  { handle: 'write_purchase_options', label: 'Purchase Options (write)', group: 'Products' },
  // Inventory
  { handle: 'read_inventory', label: 'Inventory (read)', group: 'Inventory' },
  { handle: 'write_inventory', label: 'Inventory (write)', group: 'Inventory' },
  { handle: 'read_locations', label: 'Locations (read)', group: 'Inventory' },
  // Orders
  { handle: 'read_orders', label: 'Orders (read)', group: 'Orders' },
  { handle: 'write_orders', label: 'Orders (write)', group: 'Orders' },
  { handle: 'read_all_orders', label: 'All Orders, older than 60 days (read)', group: 'Orders' },
  { handle: 'read_draft_orders', label: 'Draft Orders (read)', group: 'Orders' },
  { handle: 'write_draft_orders', label: 'Draft Orders (write)', group: 'Orders' },
  { handle: 'read_order_edits', label: 'Order Edits (read)', group: 'Orders' },
  { handle: 'write_order_edits', label: 'Order Edits (write)', group: 'Orders' },
  { handle: 'read_payment_terms', label: 'Payment Terms (read)', group: 'Orders' },
  { handle: 'write_payment_terms', label: 'Payment Terms (write)', group: 'Orders' },
  { handle: 'read_returns', label: 'Returns (read)', group: 'Orders' },
  { handle: 'write_returns', label: 'Returns (write)', group: 'Orders' },
  // Checkouts
  { handle: 'read_checkouts', label: 'Checkouts (read)', group: 'Checkouts' },
  { handle: 'write_checkouts', label: 'Checkouts (write)', group: 'Checkouts' },
  // Customers
  { handle: 'read_customers', label: 'Customers (read)', group: 'Customers' },
  { handle: 'write_customers', label: 'Customers (write)', group: 'Customers' },
  { handle: 'read_customer_events', label: 'Customer Events (read)', group: 'Customers' },
  { handle: 'read_customer_payment_methods', label: 'Customer Payment Methods (read)', group: 'Customers' },
  { handle: 'read_store_credit_accounts', label: 'Store Credit Accounts (read)', group: 'Customers' },
  {
    handle: 'read_store_credit_account_transactions',
    label: 'Store Credit Transactions (read)',
    group: 'Customers'
  },
  {
    handle: 'write_store_credit_account_transactions',
    label: 'Store Credit Transactions (write)',
    group: 'Customers'
  },
  // B2B
  { handle: 'read_companies', label: 'Companies (read)', group: 'B2B' },
  { handle: 'write_companies', label: 'Companies (write)', group: 'B2B' },
  // Discounts & Marketing
  { handle: 'read_discounts', label: 'Discounts (read)', group: 'Discounts' },
  { handle: 'write_discounts', label: 'Discounts (write)', group: 'Discounts' },
  { handle: 'read_price_rules', label: 'Price Rules (read)', group: 'Discounts' },
  { handle: 'write_price_rules', label: 'Price Rules (write)', group: 'Discounts' },
  { handle: 'read_gift_cards', label: 'Gift Cards (read)', group: 'Marketing' },
  { handle: 'write_gift_cards', label: 'Gift Cards (write)', group: 'Marketing' },
  { handle: 'read_marketing_events', label: 'Marketing Events (read)', group: 'Marketing' },
  { handle: 'write_marketing_events', label: 'Marketing Events (write)', group: 'Marketing' },
  // Fulfillment & Shipping
  { handle: 'read_fulfillments', label: 'Fulfillments (read)', group: 'Fulfillment' },
  { handle: 'write_fulfillments', label: 'Fulfillments (write)', group: 'Fulfillment' },
  {
    handle: 'read_assigned_fulfillment_orders',
    label: 'Assigned Fulfillment Orders (read)',
    group: 'Fulfillment'
  },
  {
    handle: 'write_assigned_fulfillment_orders',
    label: 'Assigned Fulfillment Orders (write)',
    group: 'Fulfillment'
  },
  {
    handle: 'read_merchant_managed_fulfillment_orders',
    label: 'Merchant-managed Fulfillment Orders (read)',
    group: 'Fulfillment'
  },
  {
    handle: 'write_merchant_managed_fulfillment_orders',
    label: 'Merchant-managed Fulfillment Orders (write)',
    group: 'Fulfillment'
  },
  {
    handle: 'read_third_party_fulfillment_orders',
    label: 'Third-party Fulfillment Orders (read)',
    group: 'Fulfillment'
  },
  {
    handle: 'write_third_party_fulfillment_orders',
    label: 'Third-party Fulfillment Orders (write)',
    group: 'Fulfillment'
  },
  { handle: 'read_shipping', label: 'Shipping (read)', group: 'Fulfillment' },
  { handle: 'write_shipping', label: 'Shipping (write)', group: 'Fulfillment' },
  // Themes & Content
  { handle: 'read_themes', label: 'Themes (read)', group: 'Themes' },
  { handle: 'write_themes', label: 'Themes (write)', group: 'Themes' },
  { handle: 'read_content', label: 'Content (read)', group: 'Content' },
  { handle: 'write_content', label: 'Content (write)', group: 'Content' },
  { handle: 'read_files', label: 'Files (read)', group: 'Content' },
  { handle: 'write_files', label: 'Files (write)', group: 'Content' },
  { handle: 'read_publications', label: 'Publications (read)', group: 'Content' },
  { handle: 'write_publications', label: 'Publications (write)', group: 'Content' },
  { handle: 'read_script_tags', label: 'Script Tags (read)', group: 'Content' },
  { handle: 'write_script_tags', label: 'Script Tags (write)', group: 'Content' },
  { handle: 'read_translations', label: 'Translations (read)', group: 'Content' },
  { handle: 'write_translations', label: 'Translations (write)', group: 'Content' },
  // Metafields & Metaobjects
  { handle: 'read_metaobject_definitions', label: 'Metaobject Definitions (read)', group: 'Metaobjects' },
  { handle: 'write_metaobject_definitions', label: 'Metaobject Definitions (write)', group: 'Metaobjects' },
  { handle: 'read_metaobjects', label: 'Metaobjects (read)', group: 'Metaobjects' },
  { handle: 'write_metaobjects', label: 'Metaobjects (write)', group: 'Metaobjects' },
  // Markets & Localization
  { handle: 'read_markets', label: 'Markets (read)', group: 'Markets' },
  { handle: 'write_markets', label: 'Markets (write)', group: 'Markets' },
  { handle: 'read_locales', label: 'Locales (read)', group: 'Markets' },
  { handle: 'write_locales', label: 'Locales (write)', group: 'Markets' },
  // Analytics & Reports
  { handle: 'read_analytics', label: 'Analytics (read)', group: 'Analytics' },
  { handle: 'read_reports', label: 'Reports (read)', group: 'Analytics' },
  { handle: 'write_reports', label: 'Reports (write)', group: 'Analytics' },
  // Payments
  { handle: 'read_shopify_payments_accounts', label: 'Shopify Payments Accounts (read)', group: 'Payments' },
  {
    handle: 'read_shopify_payments_bank_accounts',
    label: 'Shopify Payments Bank Accounts (read)',
    group: 'Payments'
  },
  { handle: 'read_shopify_payments_disputes', label: 'Shopify Payments Disputes (read)', group: 'Payments' },
  { handle: 'read_shopify_payments_payouts', label: 'Shopify Payments Payouts (read)', group: 'Payments' },
  // Store
  { handle: 'read_legal_policies', label: 'Legal Policies (read)', group: 'Store' },
  { handle: 'read_resource_feedback', label: 'Resource Feedback (read)', group: 'Store' },
  { handle: 'write_resource_feedback', label: 'Resource Feedback (write)', group: 'Store' },
  { handle: 'read_shopify_credit', label: 'Shopify Credit (read)', group: 'Store' }
];

export const SCOPE_BUNDLES: ScopeBundle[] = [
  {
    id: 'full_access',
    label: 'Full access',
    description: 'Every read and write scope. Use with caution.',
    scopes: ADMIN_SCOPES.map((s) => s.handle)
  },
  {
    id: 'read_all',
    label: 'Read all',
    description: 'Every read scope, no write access.',
    scopes: ADMIN_SCOPES.filter((s) => s.handle.startsWith('read_')).map((s) => s.handle)
  },
  {
    id: 'theme_development',
    label: 'Theme development',
    description: 'Themes, files, content, and translations.',
    scopes: [
      'read_themes',
      'write_themes',
      'read_files',
      'write_files',
      'read_content',
      'write_content',
      'read_translations',
      'write_translations',
      'read_products',
      'read_locales'
    ]
  },
  {
    id: 'products_only',
    label: 'Products only',
    description: 'Products and inventory, read and write.',
    scopes: ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_locations']
  },
  {
    id: 'orders_readonly',
    label: 'Orders read-only',
    description: 'Read access to orders, drafts, and fulfillments.',
    scopes: ['read_orders', 'read_draft_orders', 'read_order_edits', 'read_fulfillments', 'read_returns']
  }
];
