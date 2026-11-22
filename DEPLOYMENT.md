# FAISAL HOMES — Installation, Hosting, Backups & Costs

There are two ways to run FAISAL HOMES. Both use only free, open-source software (PostgreSQL, Node.js, React).
You pay no software licence or subscription. You may still have hardware, electricity, internet, hosting or domain costs, which are listed below.

| | Option A — Office computer (recommended to start) | Option B — Online server (VPS) |
|---|---|---|
| Where it runs | A Windows PC/laptop in your office | A rented Linux server on the internet |
| Who can use it | Anyone on the office Wi-Fi/LAN | Anyone with the link + login, from anywhere |
| Works without internet | Yes | No |
| Monthly cost | Electricity only (you already own the PC) | Server rent (see costs) |
| Main risk | PC theft/damage → keep off-site backup copies | Depends on provider; still keep your own backups |

---

## Option A — Windows office PC (one-click installer)

### 1. Run the installer
1. Download `faisal-homes.zip` and `INSTALL-FAISAL-HOMES.bat` into the same folder (e.g. Downloads). Do not unzip anything.
2. Double-click **INSTALL-FAISAL-HOMES.bat**.
   - If Windows shows "Windows protected your PC", click **More info → Run anyway**. If it shows "Open File – Security Warning", click **Run**.
   - Every time Windows asks *"Do you want to allow this app to make changes to your device?"*, click **YES**.
     That happens when Node.js and PostgreSQL are installed.
3. Wait 5–15 minutes. The black window shows 10 steps, each ending with **OK**.
4. Your browser opens **Create administrator**. Enter your name, a username and a strong password, then click **Create & sign in**.

What the installer does, in order:

| Step | Action |
|---|---|
| 1 | Finds `faisal-homes*.zip` (same folder, Downloads, Desktop or Documents) and extracts a **copy**. The zip is never changed |
| 2 | Checks that all program files and documentation are present |
| 3 | Installs **Node.js 22** if Node.js 20+ is missing (Windows Package Manager, or the signed installer from nodejs.org) |
| 4 | Installs **PostgreSQL 16** if PostgreSQL 14+ is missing (Windows Package Manager, or the signed installer from EnterpriseDB), with a random administrator password saved only in `C:\FaisalHomes\secrets` (readable only by your Windows user). If PostgreSQL was already installed, it asks for that administrator password once and does not save it |
| 5 | Copies the program to `C:\FaisalHomes`. An existing installation is backed up first (database backup + `C:\FaisalHomes-previous-<date>`) and your `.env`, documents and backups are kept. A copy of the zip is kept in `C:\FaisalHomes\setup-files` |
| 6 | Installs program components with `npm` (internet needed) |
| 7 | Creates a separate database user `faisal_app` with its own random password and the database `faisal_homes`, then writes `.env` (readable only by you) |
| 8 | Creates the tables and makes the first backup |
| 9 | Runs the 51-check self-test on **temporary** test databases with made-up data (including an upgrade from the previous version), then deletes them |
| 10 | Creates the **FAISAL HOMES** Desktop shortcut, starts the program and checks that the web page and database answer |

It does **not** change the firewall, start-up programs or other Windows settings, and it does not delete files.
A log without passwords is saved as `C:\FaisalHomes\install-log-<date>.txt`. You can run the installer again at any time,
for example to upgrade to a newer zip. It keeps your data.

**Daily use:** double-click the **FAISAL HOMES** Desktop shortcut. Keep the black *FAISAL HOMES – Server* window open while you work.

**If something goes wrong:** the installer stops with a red message saying what to do, and nothing is deleted. Run it again after fixing the problem.

<details><summary>Manual installation (for an IT person)</summary>

Install PostgreSQL 16 and Node.js 22, create a database and user, copy `.env.example` to `.env` and set `DATABASE_URL` and `PG_BIN_DIR`,
then run `npm run setup` in the program folder and start with `start-windows.bat`.
</details>

### 2. Let other computers and phones in the office use it (optional)
The installer makes FAISAL HOMES reachable **only from this PC**, which is the safest default. To let office PCs and phones on your Wi-Fi use it:
1. Open `C:\FaisalHomes\.env` in Notepad and change `HOST=127.0.0.1` to `HOST=0.0.0.0`. Save, then restart FAISAL HOMES.
2. Find this PC's IP address: open Command Prompt, type `ipconfig`, and note the "IPv4 Address" (e.g. 192.168.1.20).
3. Allow the port through Windows Firewall (Command Prompt **as Administrator**):
   ```
   netsh advfirewall firewall add rule name="FAISAL HOMES" dir=in action=allow protocol=TCP localport=4000
   ```
4. On other devices open `http://192.168.1.20:4000`.
   Tip: in your router settings, reserve this IP for the PC so it does not change.

### 3. Start automatically when the PC turns on (optional)
Either:
- copy the Desktop shortcut into the Startup folder (press Win+R, type `shell:startup`, press Enter, paste the shortcut there), or
- **Task Scheduler** → Create Task → Trigger "At log on" → Action "Start a program" → `C:\FaisalHomes\start-windows.bat`, or
- run it as a Windows service with **NSSM** (https://nssm.cc): `nssm install FaisalHomes "C:\Program Files\nodejs\node.exe" "C:\FaisalHomes\server\src\index.js"` and set the start directory to `C:\FaisalHomes`.

### 4. Try it with demo data first (optional)
In the `server` folder run `npm run seed:demo` on an **empty** database. It creates sample land, plots, customers and payments
(login `admin` / `Admin@12345`). When you are ready to use it for real, create a fresh database (or drop and re-create
`faisal_homes`) and start again without demo data.

---

## Option B — Online server (VPS, Linux)

Use this when partners or staff must log in from outside the office.

1. Rent a VPS with **at least 2 GB RAM** and Ubuntu 24.04 (see costs below). Point your domain (e.g. `app.yourdomain.pk`) to its IP.
2. Install Docker, copy the project, edit the passwords in `docker-compose.yml`, then:
   ```
   docker compose up -d
   ```
3. Put HTTPS in front with **Caddy** (free certificates from Let's Encrypt). `/etc/caddy/Caddyfile`:
   ```
   app.yourdomain.pk {
     reverse_proxy 127.0.0.1:4000
   }
   ```
4. Open `https://app.yourdomain.pk` and create the administrator.
5. Without Docker: install PostgreSQL 16 + Node 22, copy the folder, create `.env` (set `COOKIE_SECURE=true`), run `npm run setup`,
   and keep it running with `pm2 start server/src/index.js --name faisal-homes` or a systemd service.

> The Docker files are provided but were not run in the build environment (Docker was not available there).
> The application itself was tested on PostgreSQL 16 and Node.js 22.

---

## Backups (very important)

- **Automatic:** every day at the time set in *Settings → Automatic backup* (default 23:00). Office PCs are often switched off at night,
  so FAISAL HOMES also makes a **catch-up backup when it starts** if the last one is older than 24 hours.
- **Manual:** *Backup & Restore → Backup now* (do this before any big change).
- **What is inside:** the complete database (`pg_dump`) **plus all uploaded documents** (CNIC copies, agreements…), in one `.zip`.
- **Where:** `storage\backups` inside the program folder, and also copied to `BACKUP_COPY_DIR` if set.
- **Off-site copy:** a backup on the same PC does not protect you from theft, fire or disk failure. Use at least one:
  - Install *Google Drive for desktop* and set `BACKUP_COPY_DIR` to a folder inside your Google Drive, or
  - Weekly, download the latest backup to a USB drive kept at home.
- **Restore:** *Backup & Restore → Restore* (or *Upload backup & restore* on a new PC). Type `RESTORE` to confirm. A safety backup of
  the current data is always made first, and everyone is logged out after the restore.
- **Excel export:** *Backup & Restore → Export all data (Excel)* gives every table in one workbook, which you can read without this software.

Test a restore once on a spare PC so you know it works before you need it.

---

## Cost breakdown (prices checked November 2026: confirm before buying)

### Software: Rs 0
PostgreSQL, Node.js, React, Tailwind and all libraries used are open source. There is no FAISAL HOMES subscription.

### Option A — Office PC
| Item | Cost |
|---|---|
| Computer | Already owned. Any Windows 10/11 PC with 8 GB RAM is enough; a dedicated desktop is better than a laptop that leaves the office |
| Electricity / internet | Your normal office bills. Internet is only needed for off-site backup copies |
| UPS (recommended) | One-time purchase, local market price. It protects the database from sudden power cuts |
| USB backup drive | One-time purchase, local market price |
| Google Drive off-site copy | The free tier is 15 GB. A paid Google One plan is needed only when backups exceed that (check current Google One pricing) |

### Option B — VPS
| Item | Cost |
|---|---|
| VPS (2 vCPU / 4 GB) — Hetzner CX23 | About €5.49–5.99 per month excl. VAT after Hetzner's 2026 price increases; new-server availability has been limited (https://www.hetzner.com/cloud) |
| VPS (1 vCPU / 2 GB) — DigitalOcean Basic | US$12 per month (https://www.digitalocean.com/pricing/droplets) |
| Provider backups (optional) | DigitalOcean: +20% (weekly) or +30% (daily) of the server price. Your own FAISAL HOMES backups are still needed |
| Domain `.pk` | About Rs 3,899 per year through a Pakistani reseller such as HosterPK (rates rose in Oct 2025); .pk is sold in 2-year terms |
| HTTPS certificate | Free (Let's Encrypt, via Caddy) |
| Your time / IT person | Setup, plus checking updates and backups monthly |

Prices change often (Hetzner raised prices twice in 2026), so treat these as estimates.

---

## Updating to a new version
1. Make a manual backup.
2. Put the new `faisal-homes.zip` next to `INSTALL-FAISAL-HOMES.bat` and run the installer again. It backs up the database and the old
   program, keeps `.env`, documents and backups, installs the new files and applies database changes automatically.
3. Start the program again with the Desktop shortcut.

## Security checklist
- Use strong passwords. Give each staff member their own account with the right role.
- Never share the `postgres` database password. Keep `.env` private.
- Use HTTPS (`COOKIE_SECURE=true`) when the system is reachable from the internet.
- Review *Audit Log* regularly. Disable accounts of staff who leave (*Users → Edit → Account active*).
