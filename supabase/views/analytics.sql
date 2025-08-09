-- Analytics Views for Alfred Extension
-- These views help aggregate and analyze user behavior data

-- Daily Active Users
CREATE OR REPLACE VIEW daily_active_users AS
SELECT
  DATE(created_at) as date,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_events,
  SUM(time_saved) as total_time_saved_seconds
FROM events
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Action Usage Summary
CREATE OR REPLACE VIEW action_usage_summary AS
SELECT
  action,
  COUNT(*) as usage_count,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(time_saved) as total_time_saved,
  AVG(time_saved) as avg_time_saved,
  MAX(created_at) as last_used
FROM events
GROUP BY action
ORDER BY usage_count DESC;

-- User Activity Summary
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
  user_id,
  COUNT(*) as total_actions,
  COUNT(DISTINCT action) as unique_actions_used,
  SUM(time_saved) as total_time_saved,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen,
  COUNT(DISTINCT DATE(created_at)) as active_days
FROM events
GROUP BY user_id
ORDER BY total_time_saved DESC;

-- Feature Adoption Rates
CREATE OR REPLACE VIEW feature_adoption AS
SELECT
  action,
  COUNT(DISTINCT user_id) as users_who_tried,
  ROUND(COUNT(DISTINCT user_id) * 100.0 / (SELECT COUNT(DISTINCT user_id) FROM events), 2) as adoption_rate_percent,
  AVG(CASE WHEN usage_rank <= 3 THEN 1 ELSE 0 END) * 100 as top_3_feature_percent
FROM (
  SELECT
    user_id,
    action,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC) as usage_rank
  FROM events
  GROUP BY user_id, action
) ranked_usage
GROUP BY action
ORDER BY adoption_rate_percent DESC;

-- Theme Customizer Usage
CREATE OR REPLACE VIEW theme_customizer_usage AS
SELECT
  DATE(created_at) as date,
  COUNT(CASE WHEN action = 'resize_theme_customizer' THEN 1 END) as resize_count,
  COUNT(CASE WHEN action = 'disable_theme_inspector' THEN 1 END) as inspector_disable_count,
  COUNT(DISTINCT CASE WHEN action IN ('resize_theme_customizer', 'disable_theme_inspector') THEN user_id END) as unique_users
FROM events
WHERE action IN ('resize_theme_customizer', 'disable_theme_inspector')
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- App Store Partner Features Usage
CREATE OR REPLACE VIEW appstore_partner_usage AS
SELECT
  DATE(created_at) as date,
  COUNT(CASE WHEN action = 'appstore_partner_table_view' THEN 1 END) as table_views,
  COUNT(CASE WHEN action = 'appstore_partner_table_sort' THEN 1 END) as table_sorts,
  COUNT(CASE WHEN action = 'appstore_partner_table_export' THEN 1 END) as csv_exports,
  SUM(CASE WHEN action = 'appstore_partner_table_export' THEN (metadata->>'app_count')::int ELSE 0 END) as total_apps_exported,
  COUNT(DISTINCT user_id) as unique_users
FROM events
WHERE action LIKE 'appstore_partner%'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Version Adoption
CREATE OR REPLACE VIEW version_adoption AS
SELECT
  version,
  COUNT(DISTINCT user_id) as users,
  COUNT(*) as events,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM events
WHERE version IS NOT NULL
GROUP BY version
ORDER BY version DESC;

-- Time Saved Leaderboard
CREATE OR REPLACE VIEW time_saved_leaderboard AS
SELECT
  action,
  SUM(time_saved) as total_seconds_saved,
  ROUND(SUM(time_saved) / 60.0, 2) as total_minutes_saved,
  ROUND(SUM(time_saved) / 3600.0, 2) as total_hours_saved,
  COUNT(*) as times_used,
  ROUND(AVG(time_saved), 2) as avg_seconds_per_use
FROM events
GROUP BY action
HAVING SUM(time_saved) > 0
ORDER BY total_seconds_saved DESC;

-- Recent Activity Stream
CREATE OR REPLACE VIEW recent_activity AS
SELECT
  created_at,
  user_id,
  action,
  time_saved,
  version,
  metadata->>'shop_domain' as shop_domain,
  metadata->>'page_type' as page_type,
  metadata
FROM events
ORDER BY created_at DESC
LIMIT 1000;
