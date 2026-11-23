# VerdantPay

VerdantPay is a private finance tracker. Record income, expenses, investments, and payouts manually. Review profit by period, track goals, and export reports in THB. Posting dates follow Asia/Bangkok.

The public entry point is `/`. Supabase Auth handles sign-in, email confirmation, and password recovery. The owner approves accounts, and PostgreSQL policies restrict financial access. A new account stays pending until approval.

## Local development

Use Node.js 22.12+ and pnpm 10.34.9.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3001/`. To connect an authorized Supabase environment, put the finance variables from the deployment runbook in `admin/.env.local`. Use localhost for both app origins when testing locally. Keep service-role credentials on the server.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

The automated suites apply the SQL migrations to embedded PostgreSQL and use synthetic Auth accounts and mail links. They do not send email or write to Verdant.

## Deployment

Build the Next.js app in `admin`. The repository also retains the legacy printing workspace and historical migrations. Those routes are outside the VerdantPay deployment.

See the [standalone deployment runbook](docs/standalone-deployment.md) for the Vercel root, exact Supabase callback, and no-upgrade hosting alternative. See [the finance workflow](docs/admin-workflow.md#memo-finance) for manual entries and owner approval.
