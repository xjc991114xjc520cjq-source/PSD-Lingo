CREATE TABLE IF NOT EXISTS workflow_knowledge (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK(revision>0),
 digest TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','withdrawn')),
 payload TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 65536),
 rule_count INTEGER NOT NULL CHECK(rule_count BETWEEN 0 AND 24),
 updated INTEGER NOT NULL,
 device_id TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS workflow_knowledge_insert_budget BEFORE INSERT ON workflow_knowledge
BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM workflow_knowledge WHERE id<>NEW.id)>=32
 OR (SELECT coalesce(sum(bytes),0) FROM workflow_knowledge WHERE id<>NEW.id)+NEW.bytes>262144
 OR (SELECT coalesce(sum(rule_count),0) FROM workflow_knowledge WHERE id<>NEW.id AND status='active')+CASE WHEN NEW.status='active' THEN NEW.rule_count ELSE 0 END>48
 THEN RAISE(ABORT,'knowledge_capacity') END;
END;
CREATE TRIGGER IF NOT EXISTS workflow_knowledge_update_budget BEFORE UPDATE ON workflow_knowledge
BEGIN
 SELECT CASE WHEN (SELECT coalesce(sum(bytes),0) FROM workflow_knowledge WHERE id<>NEW.id)+NEW.bytes>262144
 OR (SELECT coalesce(sum(rule_count),0) FROM workflow_knowledge WHERE id<>NEW.id AND status='active')+CASE WHEN NEW.status='active' THEN NEW.rule_count ELSE 0 END>48
 THEN RAISE(ABORT,'knowledge_capacity') END;
END;
