# ALGA CRM

```bash
npm run install:all
# database: your local Postgres 14 (Homebrew). Create it once if needed:  createdb alga
cp server/.env.example server/.env      # set ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev:server                      # terminal 1 (creates tables, makes the first founder)
npm run dev:client                      # terminal 2 -> open http://localhost:5173
```
Migrations run automatically on every start. Your existing `students` table is kept (old statuses become Active/Finished).
Add the second founder in the app: **Team → New founder**.

## Move your Excel data in (once)

Create both founders first, with full names starting **Almaz** and **Alikhan**, then:
```bash
cd server
npm run import:excel -- /path/to/workbook.xlsx --dry-run   # preview, saves nothing
npm run import:excel -- /path/to/workbook.xlsx             # real import
```
It prints payments, payouts, revenue, tutor pay, margin and prepayment. Compare with your Excel **Summary** and **Settlement** sheets. They should match to the sen. Warnings list anything it could not link (e.g. a misspelled student name).
It refuses to run if the app already has lessons or finance entries.

## Run both side by side (suggested cutover)
1. Import. 2. For a few days enter every lesson and payment in both. 3. Compare Dashboard / Settlement with Excel each evening. 4. When they agree, stop using Excel. Keep it as an archive.

## Deploy free: Render + Neon
1. **Neon** (neon.tech): create a project, copy the connection string. If the app fails to connect, delete `&channel_binding=require` from it.
2. Push this folder to a private GitHub repo.
3. **Render**: New → Blueprint → pick the repo (uses `render.yaml`). Set `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (long), `ADMIN_NAME`.
4. Open your Render URL, sign in, choose a new password. Then delete `ADMIN_PASSWORD` in Render.
5. Create the second founder in **Team**. To import Excel into the live database, run the import locally with `DATABASE_URL` set to the Neon string.

Free-tier facts: Render's free service sleeps after 15 minutes idle (first visit then takes ~1 minute) and has no disk (fine, everything is in Neon). Neon free has no time limit, 1 GB storage. Render's own free Postgres expires after 30 days, which is why Neon is used. If sleeping annoys you, Render's paid always-on plan is about $7/month.

## Backups
Neon keeps short point-in-time history on the free plan, but also export regularly: **Students / Lessons / Finance → CSV** buttons, or `pg_dump "$DATABASE_URL" > backup.sql`.

## Safety notes
Passwords are hashed (scrypt), sessions live in the database in an httpOnly cookie, login is rate limited, writes from other websites are rejected, new/reset accounts must change their password, HTTPS is enforced by Render. Use long unique passwords.

## Not built yet (next phase)
Funnel/leads pipeline, intensives (min/max, deadline, refunds), duos (partner left), waitlist, penalties and complaints, tutor logins. Intensive money counts as "prepayment" in Settlement until intensives are added.
Changing a price in **Pricing** also recalculates past lessons (same as the Excel).

## Tests
`createdb alga_test && DATABASE_URL=postgres://localhost/alga_test npm test` (tests wipe that database; they refuse to run unless its name contains "test").
