# crpro

Transport operations for a vehicle hire company: reservations and trip assignment, drivers, fleet compliance, servicing, vendors and purchase orders, rate cards and pro-forma invoicing.

crpro is a rewrite of **TransPro**, a PHP/MySQL application, as a TypeScript API and React single-page app.

## Features

- **Reservations.** Book trips, assign an in-house driver and vehicle (or a third-party supplier) and a rate code, then move the trip through *Pending → In progress → Closed* (or *Cancelled*). The API refuses to double-book a driver or vehicle on overlapping dates. You can duplicate a booking, and company names autocomplete with their last-used contact details.
- **Dashboard.** Shows reservation counts, trips starting this week, roadworthy and insurance renewals due in the next 60 days (including overdue ones), services due, and the day's exchange rate.
- **Fleet.** Keeps vehicle records with compliance dates, plus service history and spend per vehicle.
- **Drivers.** Tracks whether each driver is in service and keeps their trip history.
- **Procurement.** Holds vendors and their categories, and multi-line purchase orders with sequential numbers (`PO-2026-00001`). Purchase orders can be printed.
- **Pro-forma invoices.** Build an invoice from one or more closed reservations. Lines are priced from the rate card in USD, and the invoice shows the cedi total at the USD → GHS rate in effect on its date. Invoices can be printed.
- **Rates.** A daily rate card covering vehicle hire, levy, VAT, GETFund levy, driver allowance and fuel.
- **Reports.** Reservations by month, top customers, in-house vs third-party split, service spend by vehicle, and purchase spend by vendor.
- **Users and roles.** *Administrators* manage users, reference data, exchange rates and deletions. *Staff* handle day-to-day operations.

The app works on phones and supports dark mode.

## Stack

| Part | Technology |
| --- | --- |
| API | Node 22, Express 5, TypeScript, Prisma 6, Zod |
| Web | React 19, Vite 7, React Router 7, TanStack Query |
| Database | MySQL 8 |
| Runtime | Docker Compose: `db`, `api`, and `web` (nginx serves the SPA and proxies `/api`) |

## Quick start (Docker Desktop)

```sh
cp .env.example .env     # then edit the passwords and JWT_SECRET
docker compose up -d --build
```

Open <http://localhost:8200>.

On first start the API applies migrations and seeds the database:

- `admin`, with the password set in `SEED_ADMIN_PASSWORD`. If that's empty, a random password is generated; see it with `docker compose logs api`.
- `demo` / `demo12345`, a staff account. It's only created when `SEED_DEMO_DATA=true`.

**All demo data is fictional.** Set `SEED_DEMO_DATA=false` to start with an empty system.

## Development

You need Node 22+ and a MySQL 8 database. The simplest option is the compose `db` service, which listens on `127.0.0.1:3307`.

```sh
docker compose up -d db

cd api
echo 'DATABASE_URL=mysql://root:<MYSQL_ROOT_PASSWORD>@127.0.0.1:3307/crpro' > .env
echo 'JWT_SECRET=dev-secret' >> .env
npm install
npx prisma migrate deploy
SEED_ADMIN_PASSWORD=admin12345 npm run db:seed
npm run dev                      # http://localhost:4000

cd ../web
npm install
npm run dev                      # http://localhost:5173 (proxies /api to :4000)
```

### Tests

```sh
cd api && npm test
```

The API tests run against a separate `<database>_test` database. Each test clears it, so tests never touch your development data.

### Schema changes

Edit `api/prisma/schema.prisma`, then run `npm run db:migrate -- --name <change>`. Commit the generated migration. Containers apply migrations automatically on start.

## Importing data from TransPro

The importer copies a TransPro database straight into crpro, so the real data never passes through git. It brings across users, vehicles, drivers, vendors, rates, reservations, service records, purchase orders and exchange rates.

```sh
# 1. Start crpro with an empty system
SEED_DEMO_DATA=false docker compose up -d --build

# 2. Point at the TransPro database (from inside Docker, the host is host.docker.internal)
docker compose exec -e LEGACY_DATABASE_URL=mysql://root@host.docker.internal:3306/carrental \
  api node dist/scripts/import-legacy.js
```

What happens to the data:

- **Reservation numbers are kept.**
- **Drivers and vehicles are linked by name and registration.** Assignments that can't be matched are kept as third-party free text.
- **Unknown trip codes and vehicle types are noted in the reservation remarks.**
- **Old passwords still work.** TransPro stored them as MD5 hashes. Each one is upgraded to bcrypt the first time that user signs in.

## Changes from TransPro

- **SQL injection is fixed.** Every query is parameterised through Prisma, and every input is validated with Zod.
- **Passwords use bcrypt.** Sessions use a JWT in an httpOnly, SameSite cookie, mutating requests must be JSON (which blocks CSRF), and sign-in attempts are rate-limited.
- **The database schema is normalised.** It has foreign keys, proper date and decimal types, and none of the unused template tables.
- **Menu items that never worked are now built:** add vehicle, add vendor, exchange-rate history, pro-forma invoices, multi-reservation invoices and reports. The old *Stores* screens had no database behind them and were not carried over.
- **The SQL dumps are gone from the repository.** They contained customer details.

## Project layout

```
api/
  prisma/schema.prisma     database schema and migrations
  src/routes/              REST endpoints
  src/lib/                 auth, validation, totals, numbering
  src/scripts/             seed and legacy import
  test/                    API integration tests
web/
  src/pages/               screens
  src/components/          layout, tables, forms, line-item editor
docker-compose.yml
```
