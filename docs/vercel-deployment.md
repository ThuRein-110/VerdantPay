# Two independent Vercel projects

For production admin login returning `Origin rejected`, see the [origin diagnosis and exact admin settings](admin-origin-fix.md). `ADMIN_ORIGIN` overrides `APP_ORIGIN` for admin API CSRF checks; aliases require an explicit `ALLOWED_ORIGINS` list and a matching request host.

The operator reports existing independent deployments. Vercel CLI 65.11.0 reports **Logged out**, and deployment credentials and actual app URLs are unavailable in this checkout. Local production builds are verified separately; existing hosted configuration and redeployment are not claimed as verified. Follow the migration/worker rollout in [production upgrade](production-upgrade.md) before enabling new generation.

Use two projects importing the **same repository**. Identify the intended existing projects before creating anything; these names are suggestions:

| Project | Root Directory | Framework |
| --- | --- | --- |
| 3d-printing-mfu-users | users | Next.js |
| 3d-printing-mfu-admin | admin | Next.js |

In each project's Root Directory settings, enable **Include source files outside of the Root Directory in the Build Step**. This is required for sibling workspace packages; setting a root alone is insufficient. [Vercel's monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq) documents this setting and independent projects.

Each app has a vercel.json. From the app root, installation runs `cd .. && pnpm install --frozen-lockfile`, and build runs `cd .. && pnpm exec turbo build --filter=@mfu/users` (or admin). Output remains `.next` inside that project's root. Both apps transpile their workspace source packages and trace files from the repository root. Root pnpm lockfile and workspace manifest must be included in the uploaded source. Use Node 22 and pnpm 10.34.9.

## Finance rollout

The Memo Finance publication target is [ThuRein-110/VerdantPay](https://github.com/ThuRein-110/VerdantPay). Import the repository root into one Vercel project named **VerdantPay** so Vercel reads [the root configuration](../vercel.json). The `users` service handles the project URL and the customer domain. The `admin` service handles `finance-verdantpay.vercel.app` and hostnames beginning with `finance.`. Add the intended finance hostname to the same project under **Settings → Domains**. The `.vercel.app` alias is a candidate and depends on availability. The shareable sign-in starts at `/finance` on whichever finance hostname is assigned. Both services keep their routes and static assets under their respective hostnames. The app-level configuration files support the independent printing projects described above.

Run `vercel dev --local --listen 127.0.0.1:3340` from the repository root to exercise both services. Use `http://localhost:3340/` for the customer site and `http://finance.localhost:3340/finance` for finance routing. The workspace libraries are built into the Next.js apps. Both apps use Supabase directly. Set the existing `CRON_SECRET` in the project environment to authorize the customer security-retention job, which runs on the default hostname.

Use the existing Verdant Supabase project after verifying its reference and migration history. Finance migrations `202611220019`–`202611220026` follow the shared prerequisites. Review `supabase db push --remote --dry-run` against the verified project before applying pending migrations. Migration `202611220026` creates memberships, preserves existing provisioned finance administrators, and requires MFA for approved finance access. It depends on the email migrations `202611220024` and `202611220025`, whose delivery remains opt-in.

### Finance authentication

1. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in the Vercel project. In Services mode, set `APP_ORIGIN` to the customer site's exact HTTPS origin and `ADMIN_ORIGIN` to the finance site's exact HTTPS origin, with no trailing path.
2. In Verdant's **Authentication → URL Configuration**, add the exact URL `https://<finance-production-host>/finance/auth/callback` to **Redirect URLs**. Use a separate exact callback entry and origin settings for any stable preview host. Keep the customer site's Auth Site URL if sharing its project. On a finance-only project, set Site URL to the finance origin.
3. Enable the Email provider, signup and **Confirm email**. Enable authenticator (TOTP) enrollment and verification. In the confirmation and recovery templates, retain `{{ .ConfirmationURL }}` so Supabase can complete the PKCE exchange. Open links in the browser that requested them. The app expires each flow after 15 minutes and the reset authorization after 10 minutes. For a shared project, review any provider-wide setting change against existing customer flows. Supabase's default SMTP is restricted to project team addresses and has a low rate limit. Use an existing authorized SMTP sender if delivering authentication links to other addresses. [Supabase redirect settings](https://supabase.com/docs/guides/auth/redirect-urls) · [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates) · [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
4. Have the business owner create and confirm their own account. In the SQL Editor for the verified Verdant project, look up that account and substitute its verified UUID below. This is a one-time owner bootstrap. Subsequent finance roles are managed from **Finance → Settings → Account approvals**.

```sql
insert into public.finance_memberships (user_id, role)
select id, 'owner' from auth.users
where id = '<verified-owner-uuid>'::uuid and email_confirmed_at is not null
on conflict (user_id) do update
set role = 'owner', member_id = null, changed_at = now();
```

On the target admin deployment, verify signed-out access, real confirmation and recovery email delivery, approval, owner MFA, scoped team access, logout and export restrictions using approved test accounts. Exercise financial writes in a separate preview environment.

Supabase Free includes 500 MB of database space, 5 GB of egress and 50,000 monthly active users. Free projects can pause after one inactive week. Restore a paused project from the Supabase dashboard and verify access after it resumes. Keep periodic private database dumps and verify restore in a separate environment. Vercel Hobby is limited to personal, non-commercial use, so production business use requires an eligible existing Vercel plan. [Supabase pricing](https://supabase.com/pricing) · [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)

### Optional finance email delivery

1. Confirm the Supabase project reference for Verdant and establish access with `supabase login` if needed. From the repository root, run `supabase link --project-ref <verdant-ref>` and `supabase db push --remote --dry-run`. Confirm that the existing finance migrations are present and the two email migrations `202611220024` and `202611220025` are pending. Apply them with `supabase db push --remote`. Deploy the dormant function with `supabase functions deploy finance-email --project-ref <verdant-ref>`. The config disables the gateway JWT check for this function. The function itself requires a private scheduler bearer token and rejects public calls.
2. Use a dedicated Resend Free team for this sender and verify a sending domain you control. Create a domain-restricted sending API key. The recipient may be a Gmail address. Gmail access and an existing ChatGPT Gmail connection are independent of this setup.
3. In Verdant's Edge Functions secrets, set `MEMO_RESEND_API_KEY`, `MEMO_EMAIL_FROM` (for example, `Memo Finance <finance@your-verified-domain>`), and `MEMO_APPROVED_RECIPIENT` (the single explicitly approved inbox). Set `MEMO_EMAIL_SCHEDULER_TOKEN` to at least 32 random characters and optionally set `MEMO_APP_URL` to the app's trusted HTTPS origin. Supabase provides the function's server-side database URL and service-role credential. Store secrets in the dashboard or a secret manager.
4. In Supabase Vault, create `memo_email_endpoint` with `https://<verdant-ref>.supabase.co/functions/v1/finance-email` and `memo_email_scheduler_token` with the exact same private scheduler token. Once the sending account and recipient are explicitly approved, set `MEMO_EMAIL_ENABLED=true` in Edge secrets and run [the schedule script](../scripts/setup-finance-email-schedule.sql) in the Verdant SQL Editor. The one 15-minute job calls the function only when mail is due. The dashboard settings control verification and the eight email preferences. Use a test email before enabling financial notifications.
5. To stop processing, remove the scheduler job with `select cron.unschedule('memo-finance-email');` and set `MEMO_EMAIL_ENABLED=false`. To pause financial alerts alone, disable delivery in app Settings. In-flight provider requests may already have been accepted.

Resend Free allows 100 emails per day and 3,000 per month. Memo reserves capacity in PostgreSQL before each provider call, counting retries against stricter budgets of 90 attempts per UTC day and 2,700 per UTC month. The queue also pauses when Resend reports reaching these budgets or its own quota. Use a dedicated Free team so unrelated mail cannot consume the same quota. Retries stop after four attempts or 20 hours from the first attempt, within Resend's 24-hour idempotency window. Supabase Free includes 500,000 Edge Function invocations. If the project is offline for an entire reporting day, that day's scheduled summaries are skipped. [Resend free limits](https://resend.com/pricing) · [Resend idempotency](https://resend.com/changelog/idempotency-keys) · [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions) · [Supabase invocation limits](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)

## Authenticated setup

1. Verify the two intended projects import `https://github.com/ThuRein-110/3D-printing-by-memo`, using production branch `main` and the root directories above. Import a missing project only after checking the existing project list. Confirm the expected source commit is present. GitHub publication does not itself create or authenticate either Vercel project.
2. Add SUPABASE_URL, SUPABASE_ANON_KEY and server-only SUPABASE_SERVICE_ROLE_KEY separately in each project's Development/Preview/Production environment. APP_ORIGIN must match that app's exact browser origin for each deployment. Use a stable preview alias or update the value for preview testing. Do not copy a localhost origin into production.
3. Set customer PREVIEW_PROVIDER=disabled initially. Only enable Meshy enqueueing once the separate worker, budget and consent flow are verified. The Meshy API key belongs on the worker, not either web project.
4. Configure Supabase Auth origin allowlists and production SMTP. Provision and MFA-test the admin.
5. Install the current official CLI and authenticate:

```powershell
npm install -g vercel
vercel login
vercel whoami
```

6. Always operate from the monorepo root. Link each already-created project in turn, pulling its own environment before building:

```powershell
vercel link --project 3d-printing-mfu-users
vercel pull --environment=production
vercel build --prod
vercel deploy --prebuilt --prod

vercel link --project 3d-printing-mfu-admin
vercel pull --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Relinking root checkout state is intentional; verify the selected project before each build/deploy. Never reuse a prebuilt artifact for the other app. Alternatively use separate full-repository checkouts. Vercel's [monorepo CLI guidance](https://vercel.com/docs/monorepos/monorepo-faq) also supports VERCEL_ORG_ID / VERCEL_PROJECT_ID without linking. Keep all IDs as operator-provided configuration and tokens in a secret manager.

7. Verify the actual returned sites: public home, mobile configurator, admin unauthenticated redirect, MFA authorization, two-user private downloads, uploads, immutable quotes and manual verification. Record actual URLs and deployment IDs below only after success.

## Deployment record

Users URL: not supplied or verified during this upgrade.

Admin URL: not supplied or verified during this upgrade.

Supabase project: operator reports eight migrations applied; live access unavailable in this checkout. Migration 009 still requires reviewed application.

Worker host: not configured.

The local filtered Next builds confirm package resolution. They do **not** establish a verified Vercel deployment; `vercel build --prod` must still run in an authenticated linked checkout.
