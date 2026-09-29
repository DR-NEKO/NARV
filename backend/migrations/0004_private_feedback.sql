CREATE TABLE IF NOT EXISTS feedback (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, type TEXT NOT NULL,
 title TEXT NOT NULL, content TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '',
 target_id TEXT NOT NULL DEFAULT '', target_uid TEXT NOT NULL DEFAULT '', target_label TEXT NOT NULL DEFAULT '',
 related_id TEXT NOT NULL DEFAULT '', review_version INTEGER NOT NULL DEFAULT 0, review_round INTEGER NOT NULL DEFAULT 0, required_rank INTEGER NOT NULL DEFAULT 4,
 reporter_name TEXT NOT NULL, reporter_uid TEXT NOT NULL, reporter_side TEXT NOT NULL,
 contact_email TEXT NOT NULL DEFAULT '', page_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open', handler_id TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 history TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, fingerprint TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS feedback_owner ON feedback(owner_id,created_at);
CREATE INDEX IF NOT EXISTS feedback_queue ON feedback(status,created_at DESC,id);
CREATE INDEX IF NOT EXISTS feedback_target ON feedback(target_id);
CREATE INDEX IF NOT EXISTS feedback_handler ON feedback(handler_id);
CREATE TRIGGER IF NOT EXISTS feedback_bytes_add AFTER INSERT ON feedback BEGIN UPDATE storage_totals SET bytes=bytes+NEW.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS feedback_bytes_update AFTER UPDATE OF bytes ON feedback BEGIN UPDATE storage_totals SET bytes=bytes+NEW.bytes-OLD.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS feedback_bytes_remove AFTER DELETE ON feedback BEGIN UPDATE storage_totals SET bytes=bytes-OLD.bytes WHERE id=1; END;
