-- Fence delayed create/join requests from a page that has already quit.
CREATE TABLE room_departures (player TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX room_departures_expiry ON room_departures(expires_at);
