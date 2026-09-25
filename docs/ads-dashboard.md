# Ads & Next Steps

Private route `/ads`. Read-only Facebook advertising insights; no ad creation, publishing, pausing or budget changes. User-authorized scheduled reports are separate from general agent blueprints.

## Available behavior

- Explicit isolated sample dashboard and HTML email preview. Fictional data is never persisted or substituted for a failed connection.
- Real Ads Manager CSV import: daily ad rows for 14 consecutive completed days, declared timezone/currency, strict columns and duplicate validation. Always labeled manual, not live synced. Purchase/revenue tracking stays unavailable in CSV mode.
- Import begins with a browser-only file check, inferred dates/currency and a review of reported totals before saving. Account label, currency and timezone reuse the most recent manual snapshot on the next visit; no account timezone is guessed from the author's location. Hourly and demographic breakdowns, ambiguous Results columns, invalid dates and rounded IDs receive actionable errors. Unchanged snapshots in the 12-report recent history open the existing report instead of adding a duplicate. This is a client convenience check, not global server idempotency.
- Saved CSV reports can prepare three editable Ask Raven questions: click-cost review, a small creative test, or tracking gaps. Questions include bounded report metrics and a private source link, with up to four explicitly mapped book references. They preserve an existing question unless the person chooses to replace it. No AI request or spend occurs until the person submits in Ask Raven; sample reports cannot be used as real evidence.
- Connected Meta adapter: authorized account selection; fixed-host Graph requests; encrypted private credentials; 14 completed account-local days; immutable snapshots; daily charts, campaigns, creative previews, search, next steps and campaign/book mappings.
- CPC/CTR comparisons are directional screening, not causal or profitability claims. Missing purchase tracking is unknown. Public inspiration links carry no claim of competitor performance.
- Book-aware business ideas use up to four mapped books and source-backed, spoiler-free reference facts. Creative-writing policy and structured-output validation apply. Each job has an ID before generation; report stores model, usage, evidence and status. At most the first four started connected jobs/day may request AI.
- Daily scheduled refresh at 16:00 UTC. Monday/Thursday jobs create emails for individually subscribed current members. Schedule uses America/Phoenix (9 AM). Content period uses ad-account timezone.
- Durable workflows receive only identifiers. Jobs and email claims prevent duplicate processing. Unsent outbox items may be dispatched for 24 hours. Provider acceptance is not delivery; signed events update delivered/bounced/complained status. A bounce/complaint stops the subscription. Expired consent, role loss, changed account or disconnection prevents pending sends.

## External activation

Meta requires `KIRA_META_APP_ID`, `KIRA_META_APP_SECRET`, `KIRA_META_ADS_LOGIN_CONFIG_ID`, `KIRA_META_GRAPH_VERSION`, existing encrypted-credential key, and the server recording capability. Register `https://kira-os-dusky.vercel.app/api/ads/meta/callback`. Configure Facebook Login for Business to issue User access tokens with read-only `ads_read`; complete applicable Meta access/review requirements and have the account holder consent. Also register the shared deauthorization and deletion callbacks listed in [the Meta setup guide](../lib/connections/SETUP.md); those callbacks support Ads-only setup without the organic login configuration. Test real account access before declaring connected. Existing organic connections use their separate login configuration.

Daily refresh requires `CRON_SECRET` and the deployed `/api/cron/ads` schedule, even while email delivery remains deferred. The scheduler rejects requests without its matching authorization secret.

Email requires verified sender DNS, `RESEND_API_KEY`, `KIRA_ADS_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `KIRA_ADS_EMAIL_VERIFIED=true`, and `CRON_SECRET`. Signed events endpoint: `https://kira-os-dusky.vercel.app/api/ads/webhook`; subscribe to delivered, bounced, complained and suppressed events. Never mark verified based on creation/terms acceptance alone. Confirm a real delivered test before promising emails.

No API credentials or consenting Meta account were configured during initial implementation. A pending sender domain is not a working sender. CSV import is the operational bridge until Meta setup is complete.

## Deployment

Apply migrations `202609200002_ads_dashboard.sql` and `202609200003_character_organization.sql` before releasing code. Server uses user JWT plus narrowly scoped capability RPCs; no service-role key in web runtime. Public ads tables use RLS. Credentials and OAuth state are private.

Run `npm run check`, plus connected desktop/mobile ads/manuscript tests. SQL tests verify tenant isolation, roles, OAuth state use, worker binding, disconnected-worker cancellation, schedule idempotence and email receipt races. Provider tests cover attribution, missing tracking, cross-account rejection and safe cursor pagination. Hosted verification must distinguish working UI/CSV from still-pending external setup.

## Visual reporting

The overview scopes its summary, weighted totals, timeline and campaign cards to All books, one explicitly mapped book, or unmapped campaigns. Book title tiles are identity placeholders, not real cover art. Preview mappings are fictional and isolated from saved mappings.

Switch the seven-day chart among spend, link clicks and cost/link click; the optional dashed line compares the previous seven-day period by day position. Exact dates, arrow/Home/End keyboard day selectors and a 14-day data table accompany the chart. Missing CPC and dates without source rows break the line for every metric. Missing dates say No rows reported instead of appearing as observed zero activity. Overall totals include only reported rows, with coverage shown alongside the weekly summary.

A weekly brief explains the largest relevant click-cost signal and its limits. Book tiles and campaign comparisons show where the reported activity belongs. Creative cards show current and prior totals together with low-sample caveats. A selectable experiment panel explains why to investigate delivery, test an approved cover detail, or check the book's click-through journey, plus what to measure. Saving to Desk retains the campaign, report window and reasoning; it does not change ads. Automatic email activation remains deferred by the owner.
