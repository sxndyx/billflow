# BillFlow

Time tracking and invoicing for freelancers, tutors and contractors, running
entirely on your own Mac. Log the hours you work on a weekly timesheet, then
turn them into an invoice PDF.

No accounts, no subscription, no cloud. Your data stays in a Postgres database
on your machine.

## What it does

- **Timesheet** — log sessions a week at a time, with a "copy last week" button
  for repeating schedules
- **Two hourly rates** — pick one per session, so specialised work can bill higher
- **Invoices** — choose a client and a date range, and every unbilled session in
  it becomes a line item. Sessions are linked to the invoice, so nothing is
  billed twice
- **PDF export** — download an invoice, or email it through your own Gmail account
- **Dashboard** — earnings by period, compared against the previous one
- **Goals** — savings targets with weekly contributions and a projected finish date

## Install

You need macOS with [Homebrew](https://brew.sh). Everything else the installer
handles.

```bash
git clone https://github.com/YOUR_USERNAME/billflow.git
cd billflow
./setup.command
```

Or download the repo as a zip, unzip it, and double-click `setup.command` in Finder.

The installer checks for Node and PostgreSQL and offers to install anything
missing, creates the database, generates a config file with its own secret,
builds the app, and optionally adds **BillFlow** to your Applications folder.

The first time you open it, a short setup asks for your business details, bank
details, hourly rates and first client. Everything there can be changed later
in Settings.

### Doing it by hand

If you would rather not run the installer:

```bash
brew install node postgresql@16
brew services start postgresql@16
createdb billflow
cp .env.example .env
```

Put a secret in `.env` as `SESSION_SECRET`:

```bash
openssl rand -base64 32
```

Then:

```bash
npm install && npm run db:push && npm run dev
```

Open <http://localhost:5001>.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Build client and server for production |
| `npm start` | Run the production build |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Apply the schema to your database |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run app:install` | Install the Mac app and its launch agent |
| `npm run app:schedule` | Show the next scheduled launches |
| `npm run app:uninstall` | Remove both |
| `npm run gmail:auth` | Get a Gmail token for sending invoices |
| `npm run user:password -- <email>` | Set a password (only for `AUTH_PROVIDER=local`) |

## Configuration

Everything lives in `.env`. Copy `.env.example` to get started.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET` | yes | `openssl rand -base64 32` |
| `PORT` | no | Defaults to 5001 |
| `HOST` | no | Loopback in dev, `0.0.0.0` in production |
| `AUTH_PROVIDER` | no | `none` (default), `local`, or `replit` |
| `SINGLE_USER_ID` | no | Pins which account single-user mode acts as |
| `GOOGLE_CLIENT_ID` | for email | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | for email | Google Cloud OAuth client |
| `GOOGLE_REFRESH_TOKEN` | for email | From `npm run gmail:auth` |
| `GMAIL_SENDER_EMAIL` | for email | Address invoices are sent from |

The default port is 5001 rather than 5000 because macOS uses 5000 for the
AirPlay Receiver.

## Running it as a Mac app

```bash
npm run app:install
```

This puts **BillFlow.app** in `~/Applications` and registers two launch agents:
one that keeps the server running and restarts it if it crashes, and one that
can open the app on a schedule.

Problems are logged to `~/Library/Logs/BillFlow.log`, and the server's own
output to `~/Library/Logs/BillFlow-server.log`.

### Opening itself on a schedule

Handy if you invoice on a fixed cycle. Edit `script/macos/schedule.conf`:

```
ANCHOR_DATE=2026-01-10
INTERVAL_WEEKS=2
LAUNCH_TIME=14:30
```

`ANCHOR_DATE` is any date the app *should* open, and the weekday comes from it,
so a Tuesday date makes it a Tuesday schedule. `INTERVAL_WEEKS=1` is weekly, `2`
is fortnightly, `4` is roughly monthly. Apply changes with:

```bash
npm run app:install
```

Check what it will do with `npm run app:schedule`.

Two caveats. launchd can express "every Saturday" but not "every second
Saturday", so the agent wakes weekly and a script decides whether it is an on
week. And the agent only fires while you are logged in, so if the Mac is asleep
at the scheduled time macOS runs it when you next wake it.

## Sending invoices by email

Optional. Everything else works without it, and you can always download the PDF
and attach it yourself.

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create a project and enable the **Gmail API**
2. Create an OAuth client of type **Web application**, with
   `http://localhost:5055/oauth2callback` as an authorised redirect URI
3. Put the client ID and secret in `.env`
4. Run `npm run gmail:auth` and follow the printed link
5. Paste the resulting `GOOGLE_REFRESH_TOKEN` and your `GMAIL_SENDER_EMAIL` into `.env`

The Settings page shows whether it is connected.

## Authentication

BillFlow is built for one person on one machine, so by default there is no
sign-in at all.

- **`none`** (default) — single-user. No login screen, no sessions; every
  request acts as the one account. There is **no access control**, so only run
  it bound to loopback. Do not set `HOST=0.0.0.0` or expose it through a tunnel.
- **`local`** — email and password, hashed with scrypt, sessions in Postgres.
  Set a password with `npm run user:password -- you@example.com`.
- **`replit`** — Replit OIDC, for running on Replit.

## How it is put together

```
client/          React app (Vite)
server/          Express API
  auth/          Pluggable auth providers
  routes.ts      All API routes
  gmail.ts       Gmail sending via Google OAuth2
  pdf-generator.ts
shared/          Schema and API contracts used by both sides
script/          Build, setup and macOS packaging
```

React with Vite, Express, PostgreSQL through Drizzle ORM, Tailwind and shadcn/ui.
Client and API are served from the same port.

The core idea is that a **work session is the unit of truth**. Each one records
a date, start and end time, a client and which rate applies. Invoices are built
by selecting unbilled sessions in a date range, which links them so they cannot
be billed twice.

Note that there are two PDF generators: the in-browser download uses
`@react-pdf/renderer`, and the email attachment path uses `pdfkit` on the
server. They are kept visually in step.

## Licence

MIT
