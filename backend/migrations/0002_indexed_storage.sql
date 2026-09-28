CREATE TABLE IF NOT EXISTS entities (
 key TEXT PRIMARY KEY, kind TEXT NOT NULL, id TEXT NOT NULL, owner_id TEXT NOT NULL DEFAULT '',
 reviewer_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '',
 login_key TEXT NOT NULL DEFAULT '', community_name TEXT NOT NULL DEFAULT '', review_name TEXT NOT NULL DEFAULT '',
 article_id TEXT NOT NULL DEFAULT '', required_rank INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', scheduled_at TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, bytes INTEGER NOT NULL DEFAULT 0, head TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entities_owner ON entities(kind,owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS entities_status ON entities(kind,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS entities_reviewer ON entities(kind,reviewer_id,status);
CREATE INDEX IF NOT EXISTS entities_article ON entities(kind,article_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS entities_due ON entities(kind,status,scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS entities_login ON entities(login_key) WHERE login_key!='';
CREATE INDEX IF NOT EXISTS entities_community ON entities(community_name) WHERE kind='users';
CREATE INDEX IF NOT EXISTS entities_review_name ON entities(review_name) WHERE kind='users';
CREATE UNIQUE INDEX IF NOT EXISTS one_original_editor ON entities(role) WHERE kind='users' AND role='original_editor';
CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS blob_links (entity_key TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(entity_key,hash));
CREATE INDEX IF NOT EXISTS blob_links_hash ON blob_links(hash);
CREATE TABLE IF NOT EXISTS public_documents (key TEXT PRIMARY KEY, kind TEXT NOT NULL, id TEXT NOT NULL, article_id TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, data TEXT NOT NULL, summary TEXT NOT NULL, etag TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS public_documents_kind ON public_documents(kind,key);
CREATE INDEX IF NOT EXISTS public_documents_article ON public_documents(kind,article_id,key);
CREATE TABLE IF NOT EXISTS storage_totals (id INTEGER PRIMARY KEY CHECK(id=1),bytes INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO storage_totals VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS entity_bytes_add AFTER INSERT ON entities BEGIN UPDATE storage_totals SET bytes=bytes+NEW.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS entity_bytes_update AFTER UPDATE OF bytes ON entities BEGIN UPDATE storage_totals SET bytes=bytes+NEW.bytes-OLD.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS entity_bytes_remove AFTER DELETE ON entities BEGIN UPDATE storage_totals SET bytes=bytes-OLD.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS blob_bytes_add AFTER INSERT ON blobs BEGIN UPDATE storage_totals SET bytes=bytes+NEW.bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS blob_bytes_remove AFTER DELETE ON blobs BEGIN UPDATE storage_totals SET bytes=bytes-OLD.bytes WHERE id=1; END;

CREATE TABLE IF NOT EXISTS public_blob_refs (hash TEXT NOT NULL,document_key TEXT NOT NULL,PRIMARY KEY(hash,document_key));
CREATE INDEX IF NOT EXISTS public_blob_refs_document ON public_blob_refs(document_key);
CREATE TABLE IF NOT EXISTS vote_totals (article_id TEXT PRIMARY KEY,up INTEGER NOT NULL DEFAULT 0,down INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS community_uid_unique ON entities(json_extract(head,'$.community.uid')) WHERE kind='users' AND json_extract(head,'$.community.uid') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS review_uid_unique ON entities(json_extract(head,'$.review.uid')) WHERE kind='users' AND json_extract(head,'$.review.uid') IS NOT NULL;
CREATE INDEX IF NOT EXISTS unread_by_owner ON entities(kind,owner_id,json_extract(head,'$.read')) WHERE kind='notifications';
CREATE TABLE IF NOT EXISTS score_totals (user_id TEXT PRIMARY KEY,points INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER IF NOT EXISTS score_add AFTER INSERT ON entities WHEN NEW.kind='scoreEvents' BEGIN INSERT INTO score_totals(user_id,points) VALUES(NEW.owner_id,json_extract(NEW.head,'$.points')) ON CONFLICT(user_id) DO UPDATE SET points=points+excluded.points; END;
CREATE TABLE IF NOT EXISTS support_totals (article_id TEXT PRIMARY KEY,supporters INTEGER NOT NULL DEFAULT 0,bonus_awarded INTEGER NOT NULL DEFAULT 0);
