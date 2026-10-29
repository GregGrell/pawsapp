# PAWSapp

Daily hub for the PAWS Rescue Qatar shelter team: today's schedule, tasks, kennel log, end-of-day report, calendar with appointment close-out, leave and sick reporting, timesheets, petty cash, incidents and visitor sign-in.

- Installable web app (works offline; changes sync when the phone has signal)
- Backend: Supabase project `pawsapp` in the PAWS Rescue Qatar organisation (database, logins, photo storage, reminder service)
- Hosting: GitHub Pages, deployed automatically on every push to `main`

## Run locally
```
npm install
npm run dev
```

## Structure
- `src/pages` — one file per screen
- `src/lib/store.ts` — offline-first data layer (IndexedDB snapshot + outbox)
- `supabase/migrations` — database schema and access rules
- `supabase/functions/notify` — push reminders and alerts (runs every 5 minutes)

The first account to sign up becomes management. Everyone after that is approved by management under More → Staff & permissions.
