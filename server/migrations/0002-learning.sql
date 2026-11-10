CREATE TABLE learning_records(device_id TEXT NOT NULL,id TEXT NOT NULL,created INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(payload)<=3072),PRIMARY KEY(device_id,id));
CREATE INDEX learning_created ON learning_records(created);
CREATE TABLE learning_quota(day TEXT NOT NULL,scope TEXT NOT NULL,count INTEGER NOT NULL CHECK(count BETWEEN 0 AND 6000),PRIMARY KEY(day,scope));
CREATE INDEX rate_limits_expiry ON rate_limits(expires);
