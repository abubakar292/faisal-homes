# FAISAL HOMES

**Real Estate Society, Land, Plotting & Installment Management Software**, running on **Supabase** (database, login, file storage)
and **Vercel** (web app + API).

Land records (with land ledger, owner payments and funding sources) → societies & blocks → plots → customers → bookings with
installment plans → payments & receipts → transfers → expenses → financial reports, with role-based security and an audit trail.

| Document | What it covers |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | **Setting up Supabase and Vercel step by step**, local development, backups, costs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technology, database design, business and accounting rules, permissions |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | What is complete and tested, known limitations, next steps |

## Set up (short version, details in [DEPLOYMENT.md](DEPLOYMENT.md))
1. Create a Supabase project. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql) once.
2. In Supabase → Authentication, keep the Email provider on and turn off public sign-ups.
3. Import this GitHub repository into Vercel and add the environment variables from [`.env.example`](.env.example).
4. Open the Vercel address and fill in **Create administrator**. Add the other staff on the **Users** page.

## Local development
```
cp .env.example .env          # fill in your Supabase values
npm run install:all           # installs server and client
npm run check                 # read-only check of the Supabase setup
npm run dev                   # API on http://localhost:4000
npm run dev:client            # web app on http://localhost:5173 (talks to the API above)
npm test                      # 53 automatic tests (start their own temporary PostgreSQL; no Supabase needed)
```

## Daily use: a short guide for office staff

**Sign in** with your email and password. The administrator creates every staff login on the Users page.

**Sell a plot.** Click **New Booking**, then:
1. Search for the customer (or click *Register a new customer*).
2. Choose the society, block and available plot. The size and price fill in automatically.
3. Enter the discount and booking amount (use the 10/20/25/30% buttons).
4. Choose the plan, e.g. *Monthly*, 36 installments. Tick *extra (balloon) payments* for 6 half-yearly payments.
5. Check the schedule on the right. It must say "matches the final price".
6. Click **Confirm booking**, then **Print booking receipt** and **Print booking confirmation**.

**Receive an installment.** Click **Collect Payment**, then:
1. Search the customer, CNIC, mobile or plot number.
2. Click *Next installment*, *All overdue* or *Full balance*, or type any amount (partial payments are fine).
3. Choose the method (cheque needs the cheque number), then **Save payment** → **Print receipt**.

**Wrong entry?** Open the receipt and click **Reverse** (admin only, a reason is required). Nothing is ever deleted. The reversal is shown in the cash book and audit log.

**Who has not paid?** Go to **Installments → Overdue customers**. The **Remind** button opens WhatsApp with a ready message.

**Transfer a plot.** Open the booking and click **Transfer** (admin), then choose the new owner, fee and witnesses. Print the transfer letter.
If installments are overdue, the system blocks the transfer unless an admin enters an override reason.

**Daily closing.** Go to **Reports → Daily Cash Report** and print or export to Excel.

**Backups.** Supabase keeps the database backups (daily on its Pro plan). On **Backup & Export** you can download every table as one
Excel file. Keep a copy off-site.

## Roles
| Role | Can do |
|---|---|
| Admin | Everything, including cancellations, reversals, transfers, schedule changes, users, settings, data export |
| Accountant | Collect payments, receipts, expenses, all reports |
| Sales Staff | Register customers, reserve plots, create bookings (with booking receipt) |
| Viewer | Read-only access; CNIC numbers are masked |

## Project layout
```
supabase/schema.sql  the complete database: run once in the Supabase SQL Editor
api/index.js         Vercel serverless function (the Express API)
server/              Node.js + Express API, business services, PDF/Excel, Supabase Auth + Storage, tests
client/              React + Tailwind web app (Vercel builds it into client/dist)
vercel.json          Vercel build, function and routing settings
```
