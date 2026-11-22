# Admin workflow

## Memo Finance

Open **Finance** from the admin navigation or visit `/finance` on the admin deployment. New users select **Create account**, confirm their email in the same browser, and wait on **Pending approval**. From **Settings → Account approvals**, the owner can assign Finance admin, link a Team member to an existing profit-share member, or revoke access. Approved users complete authenticator verification. Team accounts can see their linked allocations and payment history. For lost passwords, open **Forgot password** and follow the emailed link in the same browser.

On mobile, **Records** on the dashboard opens transaction history and the financial registers. The centered plus opens the entry sheet. **Appearance** under Settings lets you restore the system theme or switch between English and Thai. The light and dark theme toggle is also available on the account screens.

### Email notifications

After the sender and recipient are approved and the schedule is active, open **Settings → Email Notifications**. Enter the approved address, request a verification code, paste the code from your inbox, and select **Verify address**. Select any combination of income receipts, expenses, investments, team payouts, and the four summaries. Check **Enable email delivery to my verified address**, then save. **Send Test Email** queues a nonfinancial test. The history lists the latest 30 messages and any delivery or quota errors. **Sent** indicates acceptance by Resend.

The daily summary covers yesterday. The weekly summary covers the previous Monday through Sunday. The monthly and yearly reports cover the previous calendar month and year. Reports use Asia/Bangkok and are queued on their first reporting day from 08:00. A monthly report uses the recorded close when available and a labeled estimate based on the effective profit-sharing agreement otherwise. Income notifications follow customer receipts, and profit summaries use recognized income. Investment notifications cover capital contributions and asset purchases.

### Future Gmail import

An import feature would ask each administrator to opt in through their own Google OAuth consent flow. It would use a read-only scope, restrict candidates to an administrator-selected label or query, and keep refresh tokens encrypted on the server. It would deduplicate by Gmail message ID, extract draft records, and require an administrator to review them before posting. Revocation would stop sync and delete its stored authorization. Delivery to a Gmail address requires no Gmail OAuth access.

- Create the invoice in **Records → Orders** before recording a receipt. Deposits and refunds post to the payment account. Use **Recognize revenue** on the order when the work is complete.
- Record inventory purchases in **Filament inventory**, and enter equipment in **Investments**. Finalize print jobs against their actual spools in the **Print cost calculator**. A job reversal restores the stock and leaves an audit entry.
- Use **Team** to close an ended month and create its allocations from the agreement that was effective during that period. The initial rates are 15% for each member and the residual for the owner. Record payouts after payment, including partial payouts. The cards show balances from the allocation ledger and rates as of the selected period end.
- Use **Reports** for Excel and CSV downloads. Profit reports use the recognized revenue and booked costs. Transaction records show cash movement, including transfers and capital. Excel downloads are capped at 5,000 rows per sheet.
- Use **Goals** to track a savings target and manually update the amount set aside. Goal updates leave cash, revenue, expenses, and team allocations alone.

For a local browser check with isolated synthetic data, run `pnpm --filter @mfu/admin build`, then `pnpm exec playwright test --config tests/finance-browser/playwright.config.ts`. The fixture runs the PostgreSQL migrations in memory and simulates Auth and its mailbox over loopback. Screenshots are available in `test-results/finance-preview/`.

## Printing administration

Create the initial account and role out of band using the Supabase setup guide. Sign in, enroll TOTP if necessary, and complete MFA. All data routes verify role and AAL2 again.

The dashboard and operational lists show real database rows, capped at the latest 100. They never display fabricated revenue. A live metrics panel separates manually verified cash receipts, completed-order net sales, recorded costs/labor and missing-cost exceptions. Provider reservations are labeled as allowances rather than actual billing. Materials, spools, pricing versions, promotions, production records, gallery consent and settings use schema-validated configuration editors with an explicit reviewed-change checkbox. The upgraded editor provides structured, translated fields; slicer/settings JSON remains a technical configuration editor. All operational controls support four languages and light/dark/system themes. Settings and AI generation jobs add daily quotas, monthly allowance, reviewed credit cost, concurrency and provider-reported consumed-credit telemetry. See [production upgrade](production-upgrade.md) for setup.

Record actual stock in Inventory and enable colors in Materials. Spool records track suppliers, batches and remaining grams. Aggregate customer availability changes through audited inventory transactions. Use the order reservation form to reserve, consume or release material; settlement is idempotent and consumption does not subtract available grams twice. Spool-level reconciliation remains manual.

Dedicated filament images require the publication checkbox. Only purpose-marked filament media is served by the sanitized public color endpoint; arbitrary customer images cannot be published through material IDs.

For an order:

1. Move submitted → reviewing. Open the linked quote. View the customer’s private files.
2. Enter real slicer results, profile and design/finishing effort in Production. Review the shared pricing model and enter a final total; the server enforces service floors.
3. Upload an actual final design mesh for the customer. The upload control returns and fills the file ID. Issue the final quote. Then move the order to awaiting_customer_approval.
4. Customer accepts the real design and quote, or requests changes. Accepted rates and totals stay immutable.
5. Move approved → awaiting_deposit. Inspect private payment evidence, compare with bank records, and manually verify it. Only then can the order enter paid_deposit.
6. Move through designing/printing/finishing/ready/shipped/completed as appropriate. Record failures and reprint reasons in production records. Internal production notes are not exposed to customer roles.

Download quotation PDFs from quote details. Authenticated document endpoints also support `kind=invoice` for accepted final quotes and `kind=receipt` only for manually verified payments. PDFs embed the OFL-licensed Noto Sans Thai font and paginate Thai and English notes. They are ordinary business documents, not a claim of legally compliant tax invoices.

Audit logs cover database changes to rates, promotions, orders, materials, settings, payments and gallery publication. Server service-role mutations have a null JWT actor; order and final quote RPCs record the authenticated actor. Full per-handler actor attribution is a known launch gap.
