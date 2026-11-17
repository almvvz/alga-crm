-- Students. Safe to run on a database that already has this table
-- (the one created by hand during development).
CREATE TABLE IF NOT EXISTS students (
  id           SERIAL PRIMARY KEY,
  full_name    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'lead',
  year         INT,
  programme    TEXT,
  mobile       TEXT NOT NULL,
  source       TEXT NOT NULL,
  parent_name  TEXT,
  parent_phone TEXT,
  created_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT students_status_check CHECK (status IN ('lead', 'trial', 'active', 'inactive'))
);

-- The hand-made table used VARCHAR(n) limits (e.g. programme VARCHAR(25)).
-- Long values would crash inserts, so widen them. A no-op on a fresh database.
ALTER TABLE students
  ALTER COLUMN full_name   TYPE TEXT,
  ALTER COLUMN status      TYPE TEXT,
  ALTER COLUMN programme   TYPE TEXT,
  ALTER COLUMN source      TYPE TEXT,
  ALTER COLUMN parent_name TYPE TEXT;

CREATE INDEX IF NOT EXISTS students_mobile_idx ON students (mobile);
CREATE INDEX IF NOT EXISTS students_status_idx ON students (status);
