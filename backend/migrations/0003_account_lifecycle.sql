CREATE TABLE IF NOT EXISTS account_erasure (user_id TEXT PRIMARY KEY, phase TEXT NOT NULL DEFAULT 'owned', created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS moderation_deadline ON entities(json_extract(head,'$.moderation.deadline')) WHERE kind='submissions' AND json_extract(head,'$.moderation.kind')='temporary_down';
CREATE UNIQUE INDEX IF NOT EXISTS one_linked_resubmission ON entities(json_extract(head,'$.resubmissionOf')) WHERE kind='submissions' AND json_extract(head,'$.resubmissionOf') IS NOT NULL;
