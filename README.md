# Studyflow — School Homework Tracker

Studyflow is a React/Vite homework tracker backed by Cloudflare Workers, Better Auth, D1, and R2. Student completion is private per account. Owners can publish and manage assignments, attach resources, and review student suggestions.

## Cloudflare setup

1. Install dependencies with `npm install`.
2. Create a Cloudflare D1 database named `school-homework` and an R2 bucket named `school-homework-resources`.
3. Put the D1 database ID into `wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`.
4. Apply the schema: `npm run d1:migrate:local` for local development or `npm run d1:migrate:remote` for production.
5. Set Worker secrets (never commit them): `npx wrangler secret put BETTER_AUTH_SECRET` using a random secret of at least 32 characters. For password recovery emails, also set `RESEND_API_KEY` and `RESEND_FROM`; the sender domain must be verified with Resend.
6. Set `APP_ORIGIN` in `wrangler.toml` to the exact public origin (scheme + hostname, no trailing slash) before deploying. For local development, keep `http://localhost:5173`.
7. Run `npm run dev` for the Vite UI and `npm run cf:dev` in a second terminal for the Worker. The Vite server proxies `/api` to the local Worker.
8. Build and deploy with `npm run build` then `npm run cf:deploy`. The Worker serves the built app and API from the same origin.

## Accounts and owner access

Users register and sign in with email and password. Better Auth manages sessions and password-reset tokens in D1. To make an account an owner, first register it, then run this statement against the production D1 database using the account's exact email:

```sql
UPDATE users SET role = 'owner' WHERE email = 'owner@example.com';
```

Sign out and back in after changing the role. Public registration can only create student accounts; the role is not accepted from the browser.

## Storage and features

- D1 stores Better Auth data, assignments, per-user progress, personal tasks, resources metadata, and suggestions.
- R2 stores owner-uploaded PDF and image resources. Upload limit is 15 MB per file; allowed formats are PDF, PNG, JPG, and WEBP.
- Student progress and personal tasks are scoped to the signed-in user. Owner routes check the server-side role.
- Password reset email delivery is disabled until `RESEND_API_KEY` is configured. `RESEND_FROM` should be a verified sender, for example `Studyflow <noreply@example.com>`.
- Existing files under `supabase/` are historical and are no longer used by the app.

## Commands

```bash
npm run dev
npm run cf:dev
npm run build
npm run d1:migrate:local
npm run d1:migrate:remote
npm run cf:deploy
```
