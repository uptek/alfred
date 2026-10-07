-- One row per tracked extension action. id is a uuid: the Worker generates one
-- per event, and imported rows keep their source uuid so re-imports never duplicate.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  time_saved INTEGER NOT NULL,
  version TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_events_action ON events (action);
