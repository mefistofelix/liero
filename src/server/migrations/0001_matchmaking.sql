CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  region TEXT NOT NULL CHECK(region IN ('EU','NA','SA','AS','OC','AF')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_matches_expires ON matches(expires_at);

CREATE TABLE queue (
  player_key TEXT PRIMARY KEY,
  region TEXT NOT NULL CHECK(region IN ('EU','NA','SA','AS','OC','AF')),
  joined_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE
);
CREATE INDEX idx_queue_waiting_region_joined
  ON queue(region, joined_at, player_key) WHERE match_id IS NULL;
CREATE INDEX idx_queue_expires ON queue(expires_at);
CREATE INDEX idx_queue_match ON queue(match_id);
