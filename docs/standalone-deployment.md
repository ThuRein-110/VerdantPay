# VerdantPay deployment

VerdantPay serves one Next.js app from `admin`. The public entry route `/` redirects to `/finance`, where authenticated membership determines whether the visitor sees Sign In, Pending Approval, the finance dashboard, or their own team payout records. The tracked printing customer app stays outside this deployment.

## Cloudflare Workers Free

VerdantPay uses Cloudflare's vinext adapter. Use Node.js 22.18 or later for this build and keep the account on Workers Free. The Worker uses static assets and Supabase HTTPS requests. Cache stores, image optimization, Cron Triggers, and paid bindings are disabled.

```sh
pnpm install --frozen-lockfile
pnpm --filter @mfu/admin build:vinext
pnpm --filter @mfu/admin deploy:workers --dry-run
```

For the existing **verdantpay** Worker, set **Settings → Builds** as follows:

| Setting | Value |
| --- | --- |
| Repository | `ThuRein-110/VerdantPay` |
| Production branch during recovery | `recovery/standalone-verdantpay` |
| Root directory | `admin` |
| Build command | `pnpm -w install --frozen-lockfile && pnpm run build:vinext` |
| Deploy command | `pnpm run deploy:workers --tag "$WORKERS_CI_COMMIT_SHA"` |
| Preview command, if enabled | `pnpm run preview:workers` |

The workspace install uses the root lockfile and links the packages that Finance imports. vinext writes `admin/.cloudflare/output/v1/`. The prebuilt deploy command uploads that output without rediscovering the framework from the workspace root. The tag lets you match the deployed Worker version to the Git commit in Workers Builds. Retry the build after saving the trigger settings.

Authenticate with the official Cloudflare CLI and confirm the authorized account and Free subscription before publishing. Declare the five runtime values in the Worker's secret bindings. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side. Use the assigned `workers.dev` origin for both app origins and allowlist that exact `/finance/auth/callback` URL in Verdant. Configure email confirmation separately with a permitted recipient and SMTP setup.

```sh
pnpm --filter @mfu/admin exec cf auth login
pnpm --filter @mfu/admin deploy:workers
```

Verify the deployed root, Auth flows, pending-user access, owner approval, and report exports. Workers Free limits each HTTP invocation to 10 ms of CPU. Check actual invocation CPU and errors, including XLSX export with a representative report. Local duration includes database wait and cannot establish the production CPU budget.

[Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) · [Workers Builds settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## Vercel project recovery

1. Use a Vercel team eligible for the intended business use. Import `ThuRein-110/VerdantPay` or transfer the existing VerdantPay project to an eligible team with the owner's approval. Keep the existing production hostname `verdantpay.vercel.app` attached to that project. Do not link the printing repository or change either printing project.
2. Set **Root Directory** to `admin` and enable **Include source files outside of the Root Directory in the Build Step**. Use the Next.js framework and the install/build/output commands in [admin/vercel.json](../admin/vercel.json). Disconnect any previous Services overrides in the VerdantPay project if they remain after the new root is set. Verify the candidate deployment contains only the finance route tree before promotion.
3. Configure the production environment and Supabase below before enabling live writes. Review the recovery PR and verify the candidate on a protected preview before promoting the reviewed commit.

[Vercel monorepos](https://vercel.com/docs/monorepos) · [Vercel Hobby terms](https://vercel.com/docs/plans/hobby)

## Supabase and environment

- Target the existing **Verdant** project, reference `bslnyxuycfpyxthomnnk`. Confirm authenticated access and compare the live migration history and schema with the finance migrations before applying any changes. In particular, check `profiles`, `roles`, session validation, rate limiting and the `finance_*` objects and grants. The repository also contains old printing migrations. Do not apply them to a finance-only project as a blanket bootstrap.
- The finance files are migrations `202611220019` through `202611220027`. On an empty project, the finance-only staging command below copies those files and the standalone prerequisites into a temporary CLI work directory. Migration `027` adds general categories and the permission-checked manual income RPC.
- Set `SUPABASE_URL=https://bslnyxuycfpyxthomnnk.supabase.co` and configure `SUPABASE_ANON_KEY` plus server-only `SUPABASE_SERVICE_ROLE_KEY` through the host's secret manager. Set both `APP_ORIGIN` and `ADMIN_ORIGIN` to the real finance origin with no trailing path.
- In Verdant's Authentication URL settings, set the finance origin as the Site URL if this project serves only VerdantPay. Add the exact callback URL `https://verdantpay.vercel.app/finance/auth/callback` for Vercel. For another host, substitute its actual HTTPS origin. Keep email confirmation and TOTP enabled. Use an approved SMTP sender for authentication mail to external accounts.
- Provision the verified owner's `finance_memberships` row through the trusted SQL procedure described in the [initial owner setup](vercel-deployment.md#finance-authentication). Verify signup as a separate account, pending access, export denial, owner approval and sign-in with MFA. Enable optional financial email delivery only after explicit sender and recipient approval.

[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Using custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

```powershell
$stage = node scripts/stage-finance-migrations.mjs
supabase link --project-ref bslnyxuycfpyxthomnnk --workdir $stage
supabase db push --remote --workdir $stage --dry-run --skip-vault
```

Review the exact target and list before applying. Omit `--dry-run` to apply approved pending migrations. Use the temporary workspace for subsequent finance migrations on Verdant.

## Free Node.js hosting alternative

An Oracle Cloud Infrastructure Always Free Ampere A1 VM can run the same Next.js Node server. This path requires an authorized Free Tier account, capacity in its home region, and an HTTPS hostname the owner controls. Use an **Always Free-eligible** image and VM configuration within the account allowance. The provider may request a card for identity verification, and it may reclaim idle instances. This option keeps Verdant as the database and uses the VM's HTTPS hostname.

On the authorized VM, use Node.js 22 and pnpm 10.34.9. Check out the reviewed VerdantPay commit with a deploy credential, then run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mfu/admin exec next start --hostname 127.0.0.1 --port 3001
```

Run that command under a service manager as an unprivileged account. Supply the variables from the Supabase section through its protected environment file. Put an HTTPS reverse proxy in front of `127.0.0.1:3001`, preserve the public `Host` header, and allow public inbound traffic only on the reverse proxy's HTTP/HTTPS ports. Once DNS and TLS work, verify the sign-in and protected routes before advertising the URL. Use the VM's HTTPS hostname in the Supabase redirect allowlist and both app origin settings.

Cloudflare Pages' static export omits the application's server-side Auth and exports. The Workers configuration above preserves the server routes.

[OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [OCI Free Tier FAQ](https://www.oracle.com/cloud/free/faq/) · [Cloudflare OpenNext support](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
