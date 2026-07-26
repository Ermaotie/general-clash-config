CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), encrypted_value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshot_state (id INTEGER PRIMARY KEY CHECK (id = 1), status TEXT NOT NULL, updated_at TEXT, attempted_at TEXT, node_count INTEGER NOT NULL DEFAULT 0, last_error TEXT);
