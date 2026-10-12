# Studyflow — School Homework Tracker

Studyflow is a responsive React/Vite homework tracker with independent completion state, personal-task creation, assignment detail views, light/dark themes, search, filtering, and a Supabase-ready architecture.

## Run locally

```bash
npm install
npm run dev
```

The current UI runs immediately in demo mode and persists its sample state in the browser. For production, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then connect the data/auth repository to Supabase. Never use a service-role key in Vite.

## Production setup

1. Create a free Supabase project and run `supabase/migrations/001_initial.sql` in SQL Editor.
2. Enable email/password auth and configure Site URL plus redirect URLs for local and Cloudflare Pages domains.
3. Create the first user, then provision the owner role using the SQL comment in the migration.
4. Add the two Vite environment variables in Cloudflare Pages.
5. Build with `npm run build`; deploy the `dist` directory.

## Verification checklist

Test anonymous reads, two students with independent progress, owner-only moderation, RLS against direct requests, duplicate approval, mobile layout, keyboard focus, reduced motion, light/dark/system themes, expired sessions, failed saves, and password-reset redirects.

Supabase credentials, email delivery, production redirects, owner provisioning, and Cloudflare/GitHub connection require manual configuration. The included demo mode is intentionally not a substitute for those production steps.
