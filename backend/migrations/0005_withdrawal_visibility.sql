-- Clear revoked private manuscript notifications, including legacy withdrawals.
-- Submitted versions are not erased here; only the owner may delete eligible manuscripts.
DELETE FROM blob_links WHERE entity_key IN (
 SELECT n.key FROM entities n WHERE n.kind='notifications'
 AND json_extract(n.head,'$.link') LIKE '#/submission/%'
 AND NOT EXISTS (
  SELECT 1 FROM entities s WHERE s.kind='submissions' AND s.id=substr(json_extract(n.head,'$.link'),14)
  AND (s.owner_id=n.owner_id OR NOT (
   s.status='withdrawn'
   AND COALESCE(json_array_length(json_extract(s.head,'$.reviews')),0)=0
   AND COALESCE(json_array_length(json_extract(s.head,'$.decisions')),0)=0
   AND json_extract(s.head,'$.publishedAt') IS NULL
  ))
 )
);
DELETE FROM records WHERE key IN (
 SELECT n.key FROM entities n WHERE n.kind='notifications'
 AND json_extract(n.head,'$.link') LIKE '#/submission/%'
 AND NOT EXISTS (
  SELECT 1 FROM entities s WHERE s.kind='submissions' AND s.id=substr(json_extract(n.head,'$.link'),14)
  AND (s.owner_id=n.owner_id OR NOT (
   s.status='withdrawn'
   AND COALESCE(json_array_length(json_extract(s.head,'$.reviews')),0)=0
   AND COALESCE(json_array_length(json_extract(s.head,'$.decisions')),0)=0
   AND json_extract(s.head,'$.publishedAt') IS NULL
  ))
 )
);
DELETE FROM entities AS n WHERE n.kind='notifications'
 AND json_extract(n.head,'$.link') LIKE '#/submission/%'
 AND NOT EXISTS (
  SELECT 1 FROM entities s WHERE s.kind='submissions' AND s.id=substr(json_extract(n.head,'$.link'),14)
  AND (s.owner_id=n.owner_id OR NOT (
   s.status='withdrawn'
   AND COALESCE(json_array_length(json_extract(s.head,'$.reviews')),0)=0
   AND COALESCE(json_array_length(json_extract(s.head,'$.decisions')),0)=0
   AND json_extract(s.head,'$.publishedAt') IS NULL
  ))
 );
UPDATE revision SET value=value+1 WHERE id=1;
