# FAISAL HOMES — Setting up Supabase and Vercel

FAISAL HOMES runs online:

| Part | Where | What it does |
|---|---|---|
| Database | **Supabase** (PostgreSQL) | All records, balances and reports |
| Login | **Supabase Auth** | Email + password sign-in for staff |
| Files | **Supabase Storage** (private bucket `documents`) | Customer photos, CNIC copies, agreements, bills, company logo |
| Web app + API | **Vercel** | The screens (React) and the API (Express, as a serverless function) |

Staff open the Vercel address in any browser (PC, tablet, phone). Internet is needed.

---

## 1. Create the Supabase project
1. Go to https://supabase.com, sign in, click **New project**.
2. Choose a **region close to Pakistan** (South Asia, Mumbai). Vercel is set to run in Mumbai too (`vercel.json` → `"regions": ["bom1"]`).
   If you choose another Supabase region, change that line to the matching Vercel region (for example `sin1` for Singapore).
3. Choose a strong **database password** and save it somewhere safe. You need it for `DATABASE_URL`.

## 2. Create the database (SQL Editor)
1. Supabase dashboard → **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql), copy **all** of it, paste it, and click **Run**.
3. It should finish with "Success. No rows returned". Run it **only once**, on the empty project.

What it creates:
- every table, view and default setting;
- Pakistan time (`Asia/Karachi`) for the database, so overdue dates are correct;
- row level security on every table and no access for Supabase's public API roles, so the data can only be read through the
  FAISAL HOMES server (the publishable key in the browser cannot read any table);
- the private storage bucket `documents` (max 10 MB per file; images, PDF, Word, Excel).

## 3. Authentication settings
Supabase dashboard → **Authentication** → **Sign In / Providers**:
- **Email** provider: on.
- **Allow new users to sign up**: **off**. Staff logins are created by the administrator inside FAISAL HOMES (no emails are sent),
  so public sign-up is not needed. Even if it stays on, a login without a FAISAL HOMES user gets no access.

## 4. Collect the values
| Variable | Where in Supabase |
|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Project Settings → API Keys → **publishable** key (or the legacy `anon` key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → **secret** key (or the legacy `service_role` key). **Keep it secret** |
| `DATABASE_URL` | **Connect** button → **Transaction pooler** (port 6543). Put your database password in it |
| `DATABASE_CA_CERT` (optional) | Database Settings → SSL Configuration → download the certificate, paste its text |
| `SUPABASE_JWT_SECRET` (optional) | Only for older projects that still use the legacy JWT secret (Project Settings → JWT Keys) |

If the database password contains special characters, URL-encode them in `DATABASE_URL` (`@` → `%40`, `#` → `%23`, `/` → `%2F`).

## 5. Deploy on Vercel
1. Go to https://vercel.com → **Add New → Project** → import the GitHub repository.
2. **Root Directory must be the top of the repository (`./`). Do not choose `client` or `server`.** Framework Preset: **Vite**
   (detected automatically). Leave the build and install commands empty: `vercel.json` sets the build (`dist/`) and the API function.
   If the project already exists: Project → Settings → Build and Deployment → Root Directory → clear it (or `./`) → Save.
3. Under **Environment Variables**, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and
   `APP_TIMEZONE=Asia/Karachi` (plus `DATABASE_CA_CERT` if you use it).
4. Click **Deploy**. Every push to the main branch deploys again automatically.

## 6. First login
1. Open the Vercel address. You see **Create administrator**: enter your name, email and a strong password.
   Do this right after the first deployment (until an administrator exists, anyone with the address could create one).
2. Go to **Users** and add each staff member with their own email, role and a first password
   (tick "must change password" so they choose their own).
3. In **Settings**, enter the company details, upload the logo and check the measurement (Marla) setting.

## 7. Check the setup (optional)
On a PC with this project: copy `.env.example` to `.env`, fill in the same values, then run
```
npm install
npm run check
```
It only reads: it confirms the database connection, Pakistan time, the tables, that the tables are locked against the public API,
the private storage bucket, Supabase Auth and the secret key. It changes nothing.

---

## Local development
1. `.env` with your Supabase values (use a separate Supabase project for development if you do not want test data in the real one).
2. `npm install`, then `npm run dev` (API on port 4000) and, in a second window, `npm run dev:client` (web app on http://localhost:5173).
   `npm run build` makes the production web app in `dist/`; `npm start` then serves both on port 4000.
3. Automatic tests: `npm test`. They start a temporary PostgreSQL 17 and a stand-in for Supabase Auth and Storage on the PC, so they
   never touch your Supabase project. On Windows the PostgreSQL test binaries need the Microsoft Visual C++ 2015-2022 runtime
   (installed with most PCs; if `npm test` stops with a missing DLL error, install "Microsoft Visual C++ Redistributable x64").
   To use an existing PostgreSQL instead, set `TEST_DATABASE_URL`.

## Changing the database later
`supabase/schema.sql` is only for an empty project. Later changes are written as new numbered files (for example
`supabase/migrations/002_xxx.sql`) and run once in the SQL Editor, after a backup. The table `schema_migrations` records what has run.

---

## Backups (very important)
- **Database:** Supabase → **Database → Backups**. Daily backups are part of Supabase's **Pro** plan; the free plan has none.
- **Documents:** Supabase Storage, bucket `documents`.
- **Excel export:** FAISAL HOMES → **Backup & Export → Export all data (Excel)** gives every table in one workbook, readable without
  this software. Download it regularly (at least weekly on the free plan) and keep a copy off-site (USB drive or Google Drive).
- Restoring a backup is done in the Supabase dashboard.

---

## Costs (check the current prices before buying)
| Item | Notes |
|---|---|
| Supabase Free | About 500 MB database and 1 GB file storage. No backups. The project **pauses after a week without use** and must be resumed in the dashboard |
| Supabase Pro | About US$25 per month: daily backups, no pausing, more space |
| Vercel Hobby | Free, but only for personal, **non-commercial** use |
| Vercel Pro | About US$20 per month per team member: required for a business |
| Domain (optional) | A `.pk` or `.com` domain can be connected in Vercel → Domains. HTTPS is included |

## Security checklist
- The `SUPABASE_SERVICE_ROLE_KEY` (secret key) and the database password stay in Vercel's environment variables and your private
  `.env`. Never put them in the code or send them to anyone.
- Give each staff member their own login with the right role. Disable the account of anyone who leaves (Users → Edit → Account active);
  they are blocked at once.
- Keep "Allow new users to sign up" off in Supabase.
- Review the **Audit Log** regularly. Failed sign-in attempts are visible in Supabase → Authentication → Logs.
