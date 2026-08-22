CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL,
    project_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_extension TEXT NOT NULL,
    cdn_url TEXT NOT NULL,
    raw_url TEXT NOT NULL,
    github_url TEXT NOT NULL,
    commit_sha TEXT,
    uploaded_by TEXT NOT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_project ON uploads(project_key);
CREATE INDEX IF NOT EXISTS idx_date ON uploads(upload_date DESC);
