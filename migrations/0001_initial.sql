CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','owner'))
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token TEXT NOT NULL UNIQUE, expiresAt TEXT NOT NULL, ipAddress TEXT, userAgent TEXT,
 createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(userId);
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 accountId TEXT NOT NULL, providerId TEXT NOT NULL, accessToken TEXT, refreshToken TEXT,
 idToken TEXT, accessTokenExpiresAt TEXT, refreshTokenExpiresAt TEXT, scope TEXT,
 password TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(userId);
CREATE TABLE IF NOT EXISTS verifications (
 id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt TEXT NOT NULL,
 createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS assignments (
 id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 80), description TEXT NOT NULL DEFAULT '',
 due_at TEXT, priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS assignments_status_due_idx ON assignments(status,due_at);
CREATE TABLE IF NOT EXISTS assignment_progress (
 assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 is_completed INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0,1)), completed_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(assignment_id,user_id)
);
CREATE TABLE IF NOT EXISTS personal_tasks (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160), description TEXT NOT NULL DEFAULT '',
 subject TEXT NOT NULL DEFAULT 'Personal', due_at TEXT,
 priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High')),
 is_completed INTEGER NOT NULL DEFAULT 0 CHECK(is_completed IN (0,1)), completed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS personal_tasks_user_due_idx ON personal_tasks(user_id,due_at);
CREATE TABLE IF NOT EXISTS assignment_resources (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
 title TEXT NOT NULL, url TEXT, object_key TEXT, description TEXT NOT NULL DEFAULT '',
 resource_type TEXT NOT NULL DEFAULT 'link' CHECK(resource_type IN ('link','file')),
 sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((resource_type='link' AND url IS NOT NULL) OR (resource_type='file' AND object_key IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS assignment_suggestions (
 id TEXT PRIMARY KEY, submitted_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160), subject TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', proposed_due_at TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewer_notes TEXT, reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT,
 approved_assignment_id TEXT UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS suggestions_status_created_idx ON assignment_suggestions(status,created_at);
