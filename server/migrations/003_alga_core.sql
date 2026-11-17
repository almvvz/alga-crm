-- Alga's real business model (from the Excel workbook): tutors, products,
-- lessons, a finance ledger and editable pricing.
-- Money is stored as integer sen (1 RM = 100).

-- ---------- Pricing / settings ----------
CREATE TABLE settings (
  key     TEXT PRIMARY KEY,
  label   TEXT NOT NULL,
  comment TEXT,
  kind    TEXT NOT NULL CHECK (kind IN ('money', 'number')),
  value   NUMERIC NOT NULL CHECK (value >= 0),
  sort    INT NOT NULL DEFAULT 0
);

INSERT INTO settings (key, label, comment, kind, value, sort) VALUES
 ('intensive_price',        'Intensive: price per person',                 '6 hours for 60 RM', 'money', 6000, 10),
 ('intensive_price_friend', 'Intensive: price per person if two come',     '"Bring a friend" discount', 'money', 5500, 20),
 ('intensive_tutor_pay',    'Intensive: tutor pay for the whole intensive','3 sessions of 2 hours', 'money', 15000, 30),
 ('intensive_bonus',        'Intensive: tutor bonus per student above threshold', NULL, 'money', 1000, 40),
 ('intensive_bonus_after',  'Intensive: students after which the bonus applies', NULL, 'number', 6, 50),
 ('intensive_min',          'Intensive: minimum students to launch',      'Breaks even at 3', 'number', 4, 60),
 ('intensive_max',          'Intensive: maximum students',                 NULL, 'number', 8, 70),
 ('intensive_refund',       'Intensive: refund if leaving after session 1','Session 1 stays paid', 'money', 4000, 80),
 ('duo_price',              'Duo: price per person per lesson (1 hour)',   'Pack of 4 = 100 RM per person', 'money', 2500, 90),
 ('f2f_single',             '1-on-1: single lesson (1 hour)',              NULL, 'money', 4000, 100),
 ('f2f_pack',               '1-on-1: pack price',                          '35 RM per lesson', 'money', 14000, 110),
 ('tutor_rate',             'Tutor rate per lesson (1 hour)',              'Same for duo, 1-on-1, solo and open review', 'money', 2500, 120),
 ('solo_after_duo',         'Solo after duo: price per lesson',            NULL, 'money', 3500, 130),
 ('pack_lessons',           'Lessons in a pack',                           NULL, 'number', 4, 140),
 ('penalty_minor',          'Tutor penalty: minor',                        'Replied after more than 24 hours', 'money', 500, 150),
 ('penalty_medium',         'Tutor penalty: medium',                       'Unprepared or 15+ minutes late', 'money', 1000, 160),
 ('penalty_serious',        'Tutor penalty: serious',                      'No-show without 48 hours notice', 'money', 2000, 170),
 ('noshow_share',           'Share of tutor rate if students did not come','0.5 = half the rate', 'number', 0.5, 180);

CREATE FUNCTION setting(k TEXT) RETURNS NUMERIC
  LANGUAGE sql STABLE AS $$ SELECT value FROM settings WHERE key = k $$;

-- ---------- Tutors ----------
CREATE TABLE tutors (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  contact           TEXT,
  subject           TEXT,
  major             TEXT,
  year_of_study     TEXT,
  grade             TEXT,
  lecturer          TEXT,
  own_exam_dates    TEXT,
  availability      TEXT,
  trial_date        DATE,
  hard_filters      BOOLEAN,
  rules_signed      BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_rate_cents INT CHECK (agreed_rate_cents >= 0),
  status            TEXT NOT NULL DEFAULT 'Candidate' CHECK (status IN ('Candidate', 'Active', 'On hold', 'Finished')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tutors_name_key ON tutors (lower(name));

-- One row per founder who scored the tutor after the trial lesson (1-5).
CREATE TABLE tutor_scores (
  tutor_id        INT NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  explanation     SMALLINT CHECK (explanation BETWEEN 1 AND 5),
  exam_knowledge  SMALLINT CHECK (exam_knowledge BETWEEN 1 AND 5),
  contact         SMALLINT CHECK (contact BETWEEN 1 AND 5),
  responsibility  SMALLINT CHECK (responsibility BETWEEN 1 AND 5),
  availability    SMALLINT CHECK (availability BETWEEN 1 AND 5),
  PRIMARY KEY (tutor_id, user_id)
);

-- ---------- Students ----------
-- The hand-made table from development becomes the real students table.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students ALTER COLUMN mobile DROP NOT NULL, ALTER COLUMN source DROP NOT NULL;
UPDATE students SET status = CASE WHEN status = 'inactive' THEN 'Finished' ELSE 'Active' END
 WHERE status IN ('lead', 'trial', 'active', 'inactive');
ALTER TABLE students ALTER COLUMN status SET DEFAULT 'Active';
ALTER TABLE students ADD CONSTRAINT students_status_check
  CHECK (status IN ('Active', 'Finished', 'Left with partial refund', '100% refund'));
ALTER TABLE students
  ADD COLUMN subject       TEXT,
  ADD COLUMN product       TEXT CHECK (product IN ('Intensive', 'Duo', '1-on-1 single', '1-on-1 pack', 'Solo after duo')),
  ADD COLUMN tutor_id      INT REFERENCES tutors(id) ON DELETE SET NULL,
  ADD COLUMN group_code    TEXT,
  ADD COLUMN lessons_paid  INT NOT NULL DEFAULT 0 CHECK (lessons_paid >= 0),
  ADD COLUMN rating        SMALLINT CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN ok_to_publish BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN notes         TEXT;

-- ---------- Lessons ----------
CREATE TABLE lessons (
  id              SERIAL PRIMARY KEY,
  lesson_date     DATE NOT NULL,
  lesson_time     TIME,
  subject         TEXT,
  tutor_id        INT REFERENCES tutors(id) ON DELETE SET NULL,
  format          TEXT NOT NULL CHECK (format IN
                    ('Intensive', 'Duo', '1-on-1 single', '1-on-1 pack', 'Solo after duo', 'Open review')),
  group_code      TEXT,
  status          TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN
                    ('Scheduled', 'Held', 'Rescheduled (notice given)', 'Student cancelled >=24h',
                     'Student cancelled <24h (lesson burned)', 'No-show (rescheduled)', 'Tutor cancelled')),
  logged_same_day BOOLEAN NOT NULL DEFAULT FALSE,
  recording_saved BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lessons_date_idx ON lessons (lesson_date DESC);
CREATE INDEX lessons_tutor_idx ON lessons (tutor_id);
CREATE INDEX lessons_group_idx ON lessons (group_code);

CREATE TABLE lesson_students (
  lesson_id  INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  PRIMARY KEY (lesson_id, student_id)
);
CREATE INDEX lesson_students_student_idx ON lesson_students (student_id);

-- Revenue and tutor pay follow the same rules as the Excel "Lessons" sheet.
-- Intensive money is not counted per lesson (same as Excel).
CREATE VIEW lesson_calc AS
SELECT l.*,
       COALESCE(n.cnt, 0) AS student_count,
       ROUND(
         CASE WHEN l.status IN ('Held', 'Student cancelled <24h (lesson burned)') THEN
           CASE l.format
             WHEN 'Duo'            THEN setting('duo_price') * COALESCE(n.cnt, 0)
             WHEN '1-on-1 single'  THEN setting('f2f_single')
             WHEN '1-on-1 pack'    THEN setting('f2f_pack') / NULLIF(setting('pack_lessons'), 0)
             WHEN 'Solo after duo' THEN setting('solo_after_duo')
             ELSE 0 END
         ELSE 0 END
       )::BIGINT AS revenue_cents,
       ROUND(
         CASE WHEN l.format = 'Intensive' THEN 0
              WHEN l.status IN ('Held', 'Student cancelled <24h (lesson burned)') THEN setting('tutor_rate')
              WHEN l.status = 'No-show (rescheduled)' THEN setting('tutor_rate') * setting('noshow_share')
              ELSE 0 END
       )::BIGINT AS tutor_cents
  FROM lessons l
  LEFT JOIN (SELECT lesson_id, COUNT(*) AS cnt FROM lesson_students GROUP BY lesson_id) n
         ON n.lesson_id = l.id;

-- ---------- Finance ledger ----------
CREATE TABLE finance_entries (
  id           SERIAL PRIMARY KEY,
  entry_date   DATE NOT NULL,
  type         TEXT NOT NULL CHECK (type IN
                 ('Student payment', 'Student refund', 'Tutor payout', 'Expense', 'Other income', 'Partner transfer')),
  student_id   INT REFERENCES students(id) ON DELETE SET NULL,
  tutor_id     INT REFERENCES tutors(id) ON DELETE SET NULL,
  party        TEXT,
  purpose      TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  method       TEXT CHECK (method IN ('Transfer', 'E-wallet', 'Cash')),
  -- who received the money (payments) or sent it (payouts, refunds, expenses, partner transfers)
  handled_by   INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note         TEXT,
  created_by   INT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX finance_date_idx ON finance_entries (entry_date DESC, id DESC);
CREATE INDEX finance_student_idx ON finance_entries (student_id);
CREATE INDEX finance_tutor_idx ON finance_entries (tutor_id);

-- Per student: what they paid, what was refunded, what was held. Same as Excel "Students".
CREATE VIEW student_summary AS
SELECT s.*,
       t.name AS tutor_name,
       COALESCE((SELECT SUM(amount_cents) FROM finance_entries f
                  WHERE f.student_id = s.id AND f.type = 'Student payment'), 0)::BIGINT AS paid_cents,
       COALESCE((SELECT SUM(amount_cents) FROM finance_entries f
                  WHERE f.student_id = s.id AND f.type = 'Student refund'), 0)::BIGINT AS refund_cents,
       CASE
         WHEN s.product = 'Intensive' AND s.group_code IS NOT NULL THEN
           (SELECT COUNT(*) FROM lessons l WHERE l.group_code = s.group_code AND l.status = 'Held')
         ELSE
           (SELECT COUNT(*) FROM lesson_students ls JOIN lessons l ON l.id = ls.lesson_id
             WHERE ls.student_id = s.id
               AND l.status IN ('Held', 'Student cancelled <24h (lesson burned)'))
       END::INT AS lessons_held
  FROM students s
  LEFT JOIN tutors t ON t.id = s.tutor_id;
