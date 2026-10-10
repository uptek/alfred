-- The action name a row arrived or was first stored under, when it has since
-- been renamed (utils/analytics-legacy.ts). NULL for rows sent under a current name.
ALTER TABLE events ADD COLUMN legacy_action TEXT DEFAULT NULL;
