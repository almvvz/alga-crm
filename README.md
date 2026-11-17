# Alga CRM
 
A custom CRM I built for **Alga**, an exam-prep tutoring startup I co-founded. It replaced a 12-sheet Excel workbook that tracked students, lessons, tutor pay and profit sharing, and it is used in production by both founders.
 
> Screenshots: add 2-3 images here (`docs/dashboard.png`, `docs/lessons.png`, `docs/settlement.png`).
> Use demo data only, never real student information.
 
## What it does
 
- **Dashboard**: net cash, margin, lessons held, and students running out of paid lessons (renewal alerts)
- **Students**: products (1-on-1, duo, pack, intensive), lessons paid / held / remaining
- **Lessons**: log lessons with statuses (held, burned, no-show, cancelled); revenue and tutor pay are calculated automatically from the pricing rules
- **Finance ledger**: payments, refunds, tutor payouts, expenses, partner transfers, with CSV export
- **Tutors**: onboarding pipeline with blind scoring by each founder and an automatic hire / don't-hire rule
- **Settlement**: 50/50 profit split, who holds which cash, what each tutor is owed
- **Pricing**: all prices editable in one place
- **Auth**: founder accounts, forced password change on first login, deactivate and reset password
## Tech stack
 
| Layer | Tools |
|---|---|
| Client | React 19, Vite, Tailwind CSS v4, React Router |
| Server | Node.js, Express 5, PostgreSQL (`pg`) |
| Auth | scrypt password hashing, server-side sessions in Postgres, httpOnly cookies |
| Hosting | Render (app) + Neon (database) |
| Testing | `node:test` against a real Postgres, Playwright end-to-end checks |
 
## Engineering decisions worth noting
 
- **Money is stored as integer sen**, never floats, so there are no rounding errors.
- **Business rules live in SQL views** (revenue, tutor pay, lessons remaining), so every screen shows the same numbers.
- **Reconciled with the old system**: the Excel import was verified to match the original totals to the sen.
- **Security basics**: hashed passwords, rate-limited login, cross-site write protection, CSV formula-injection protection, input validation on every route.
- **Row locking** on writes that must not race, and a **migration system** with advisory locks.
- **Automated tests** cover login, permissions, the pricing rules, settlement maths and validation.
## Run it locally
 
```bash
npm run install:all
createdb alga
cp server/.env.example server/.env     # set ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev:server                     # terminal 1
npm run dev:client                     # terminal 2 -> http://localhost:5173
```
 
Run the tests (they wipe the database they point at, so use a throwaway one named `*test*`):
 
```bash
createdb alga_test
DATABASE_URL=postgres://localhost/alga_test npm test
```
 
## Status
 
Used daily for lessons, payments and tutor payouts. Next up: leads funnel, intensives (min/max group sizes and refunds), duo pairing, penalties.
 
## Author
 
Built by me, right here (https://github.com/almvvz). I did the product work, data model and architecture; AI coding assistance helped with implementation.
 