# VerdantPay deployment

VerdantPay serves one Next.js app from `admin`. The public entry route `/` redirects to `/finance`, where authenticated membership determines whether the visitor sees Sign In, Pending Approval, the finance dashboard, or their own team payout records. The tracked printing customer app stays outside this deployment.

## Vercel project recovery

1. Use a Vercel team eligible for the intended business use. Import `ThuRein-110/VerdantPay` or transfer the existing VerdantPay project to an eligible team with the owner's approval. Keep the existing production hostname `verdantpay.vercel.app` attached to that project. Do not link the printing repository or change either printing project.
2. Set **Root Directory** to `admin` and enable **Include source files outside of the Root Directory in the Build Step**. Use the Next.js framework and the install/build/output commands in [admin/vercel.json](../admin/vercel.json). Disconnect any previous Services overrides in the VerdantPay project if they remain after the new root is set. Verify the candidate deployment contains only the finance route tree before promotion.
3. Configure the production environment and Supabase below before enabling live writes. Review the recovery PR and verify the candidate on a protected preview before promoting the reviewed commit.

[Vercel monorepos](https://vercel.com/docs/monorepos) · [Vercel Hobby terms](https://vercel.com/docs/plans/hobby)

## Supabase and environment

- Target the existing **Verdant** project, reference `bslnyxuycfpyxthomnnk`. Confirm authenticated access and compare the live migration history and schema with the finance migrations before applying any changes. In particular, check `profiles`, `roles`, session validation, rate limiting and the `finance_*` objects and grants. The repository also contains old printing migrations. Do not apply them to a finance-only project as a blanket bootstrap.
- The finance files are migrations `202611220019` through `202611220027`. After reviewing their dependencies against the live schema, apply only the missing compatible finance migrations and prerequisites in order. Migration `027` adds general categories and the permission-checked manual income RPC. It preserves existing finance records, reports and allocations.
- Set `SUPABASE_URL=https://bslnyxuycfpyxthomnnk.supabase.co` and configure `SUPABASE_ANON_KEY` plus server-only `SUPABASE_SERVICE_ROLE_KEY` through the host's secret manager. Set both `APP_ORIGIN` and `ADMIN_ORIGIN` to the real finance origin with no trailing path.
- In Verdant's Authentication URL settings, set the finance origin as the Site URL if this project serves only VerdantPay. Add the exact callback URL `https://verdantpay.vercel.app/finance/auth/callback` for Vercel. For another host, substitute its actual HTTPS origin. Keep email confirmation and TOTP enabled. Use an approved SMTP sender for authentication mail to external accounts.
- Provision the verified owner's `finance_memberships` row through the trusted SQL procedure described in the [initial owner setup](vercel-deployment.md#finance-authentication). Verify signup as a separate account, pending access, export denial, owner approval and sign-in with MFA. Enable optional financial email delivery only after explicit sender and recipient approval.

[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Using custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## Free Node.js hosting alternative

An Oracle Cloud Infrastructure Always Free Ampere A1 VM can run the same Next.js Node server. This path requires an authorized Free Tier account, capacity in its home region, and an HTTPS hostname the owner controls. Use an **Always Free-eligible** image and VM configuration within the account allowance. The provider may request a card for identity verification, and it may reclaim idle instances. This option keeps Verdant as the database and uses the VM's HTTPS hostname.

On the authorized VM, use Node.js 22 and pnpm 10.34.9. Check out the reviewed VerdantPay commit with a deploy credential, then run:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mfu/admin exec next start --hostname 127.0.0.1 --port 3001
```

Run that command under a service manager as an unprivileged account. Supply the variables from the Supabase section through its protected environment file. Put an HTTPS reverse proxy in front of `127.0.0.1:3001`, preserve the public `Host` header, and allow public inbound traffic only on the reverse proxy's HTTP/HTTPS ports. Once DNS and TLS work, verify the sign-in and protected routes before advertising the URL. Use the VM's HTTPS hostname in the Supabase redirect allowlist and both app origin settings.

Cloudflare Pages' static export cannot host this app's server-side Auth and exports. Cloudflare Workers with OpenNext would require adapting the Next.js Node proxy and testing the free-tier execution limits on the XLSX export. No Cloudflare compatibility is assumed for this release.

[OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [OCI Free Tier FAQ](https://www.oracle.com/cloud/free/faq/) · [Cloudflare OpenNext support](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
