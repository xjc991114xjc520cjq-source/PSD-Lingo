CREATE INDEX IF NOT EXISTS case_script_aspect ON case_catalog(script,aspect,text_length);
CREATE TABLE IF NOT EXISTS case_corpus_stats(id INTEGER PRIMARY KEY CHECK(id=1),archived_count INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO case_corpus_stats(id,archived_count) SELECT 1,COUNT(*) FROM visual_cases WHERE status='archived';
CREATE TRIGGER IF NOT EXISTS case_count_archive AFTER UPDATE OF status ON visual_cases WHEN OLD.status!='archived' AND NEW.status='archived' BEGIN UPDATE case_corpus_stats SET archived_count=archived_count+1 WHERE id=1;END;
CREATE TRIGGER IF NOT EXISTS case_count_delete AFTER DELETE ON visual_cases WHEN OLD.status='archived' BEGIN UPDATE case_corpus_stats SET archived_count=archived_count-1 WHERE id=1;END;
