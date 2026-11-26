-- =====================================================================================================
-- FAISAL HOMES update 002: investors.
--
-- How to use: Supabase dashboard → SQL Editor → New query → paste this whole file → Run. Run it ONCE,
-- on a database that already has supabase/schema.sql. Run it BEFORE deploying the code that uses it.
--
-- "Add investor" on the Personal Investment page now only records the person (name, date, notes).
-- The amount is entered when money is used: Pay Land Owner → payment source "personal investment",
-- where the investor is chosen from this list.
-- =====================================================================================================

CREATE TABLE investors (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  added_date  DATE NOT NULL,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  INT REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INT REFERENCES users(id)
);
CREATE UNIQUE INDEX investors_name_uq ON investors (lower(name));

-- Each personal investment entry is linked to its investor (the name is still stored with the entry).
ALTER TABLE capital_contributions ADD COLUMN investor_id INT REFERENCES investors(id);
CREATE INDEX capital_contributions_investor_idx ON capital_contributions (investor_id);

-- Investment entries made before this update: create their investors from the names used.
INSERT INTO investors (name, added_date, created_by)
SELECT DISTINCT ON (lower(trim(investor_name))) trim(investor_name), contribution_date, created_by
FROM capital_contributions
ORDER BY lower(trim(investor_name)), contribution_date, id;
UPDATE capital_contributions c SET investor_id = i.id FROM investors i WHERE lower(i.name) = lower(trim(c.investor_name));

-- Same protection as every other table: only the FAISAL HOMES server can read or change it.
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE investors FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE investors_id_seq FROM anon, authenticated;
  END IF;
END $$;

INSERT INTO schema_migrations (name) VALUES ('002_investors');
