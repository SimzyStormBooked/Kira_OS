# Ads & Next Steps

Private route `/ads`. Read-only Facebook advertising insights; no ad creation, publishing, pausing or budget changes. User-authorized scheduled reports are separate from general agent blueprints.

## Available behavior

- Explicit isolated sample dashboard and HTML email preview. Fictional data is never persisted or substituted for a failed connection.
- Real Ads Manager CSV import: daily ad rows for 14 consecutive completed days, declared timezone/currency, strict columns and duplicate validation. Always labeled manual, not live synced. Purchase/revenue tracking stays unavailable in CSV mode.
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

Switch the seven-day chart among spend, link clicks and cost/link click; the optional dashed line compares the previous seven-day period by day position. Exact dates, keyboard-operable day selectors and a 14-day data table accompany the chart. Missing CPC breaks the line; no fake zero-cost point. CSV days without rows show zero reported activity with an explicit completeness note.

Three deterministic observations explain the snapshot without making profit claims. Creative cards show the current and prior totals together with low-sample caveats. A next-step card can save an experiment to Desk; this does not change ads. Automatic email activation remains deferred by the owner.
