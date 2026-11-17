-- Preserve audit while removing unused entries from all catalogue searches.
ALTER TABLE singflow.catalog_songs ADD COLUMN deleted_at timestamptz;
CREATE TABLE singflow.catalog_import_operations (
 id uuid PRIMARY KEY, actor varchar(254) NOT NULL,
 song_id uuid NOT NULL REFERENCES singflow.catalog_songs(id) ON DELETE CASCADE,
 title varchar(160) NOT NULL, artist varchar(160) NOT NULL, selection_id uuid NOT NULL
);
