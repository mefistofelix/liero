CREATE TABLE rooms (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 region TEXT NOT NULL, private INTEGER NOT NULL, invite TEXT NOT NULL,
 settings TEXT NOT NULL, phase TEXT NOT NULL DEFAULT 'lobby', expires_at INTEGER NOT NULL
);
CREATE INDEX rooms_public ON rooms(private,region,expires_at);
CREATE TABLE members (
 room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 player TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6868fc', seat INTEGER NOT NULL DEFAULT -1,
 expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX member_seat ON members(room,seat) WHERE seat >= 0;
CREATE TABLE room_signals (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 sender TEXT NOT NULL, recipient TEXT NOT NULL, body TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX room_signal_inbox ON room_signals(room,recipient,seq);
CREATE TABLE room_chat (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 player TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX room_chat_history ON room_chat(room,seq);
