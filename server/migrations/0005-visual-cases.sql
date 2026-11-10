CREATE TABLE IF NOT EXISTS visual_cases(device_id TEXT NOT NULL,id TEXT NOT NULL,created INTEGER NOT NULL,archive_day TEXT NOT NULL,payload TEXT,status TEXT NOT NULL DEFAULT 'pending',bytes INTEGER NOT NULL,lock_until INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,asset_id INTEGER,asset_sha TEXT,asset_url TEXT,last_error TEXT DEFAULT '',PRIMARY KEY(device_id,id));
CREATE INDEX IF NOT EXISTS visual_cases_pending ON visual_cases(status,created);
CREATE TABLE IF NOT EXISTS visual_case_budget(id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0 AND bytes<=268435456));
INSERT OR IGNORE INTO visual_case_budget(id,bytes) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS case_reserve AFTER INSERT ON visual_cases WHEN NEW.payload IS NOT NULL BEGIN UPDATE visual_case_budget SET bytes=bytes+NEW.bytes WHERE id=1;END;
CREATE TRIGGER IF NOT EXISTS case_release AFTER UPDATE OF payload ON visual_cases WHEN OLD.payload IS NOT NULL AND NEW.payload IS NULL BEGIN UPDATE visual_case_budget SET bytes=bytes-OLD.bytes WHERE id=1;END;
CREATE VIRTUAL TABLE IF NOT EXISTS case_search USING fts5(device_id UNINDEXED,id UNINDEXED,terms);
CREATE TABLE IF NOT EXISTS case_catalog(device_id TEXT NOT NULL,id TEXT NOT NULL,language TEXT NOT NULL,script TEXT NOT NULL,font TEXT NOT NULL,aspect REAL NOT NULL,text_length INTEGER NOT NULL,PRIMARY KEY(device_id,id));
CREATE INDEX IF NOT EXISTS case_similarity ON case_catalog(script,font,aspect,text_length);
