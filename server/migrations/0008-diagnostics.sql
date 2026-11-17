CREATE TABLE IF NOT EXISTS diagnostic_reports(device_id TEXT NOT NULL,id TEXT NOT NULL,build TEXT NOT NULL,task_id TEXT NOT NULL,code TEXT NOT NULL,received INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(device_id,id));
CREATE INDEX IF NOT EXISTS diagnostic_received ON diagnostic_reports(received DESC,id DESC);
CREATE INDEX IF NOT EXISTS diagnostic_build ON diagnostic_reports(build,received DESC);
CREATE INDEX IF NOT EXISTS diagnostic_task ON diagnostic_reports(task_id,received DESC);
CREATE INDEX IF NOT EXISTS diagnostic_id ON diagnostic_reports(id);
CREATE TABLE IF NOT EXISTS diagnostic_usage(day TEXT NOT NULL,pool TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,pool));
