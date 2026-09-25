# Find Your Readers

This release replaces the Discoverability roadmap page with an authenticated, author-scoped workspace at `/discoverability`.

## What works

- Save public HTTPS website pages, optionally associated with a book. Explicitly start a durable background audit and leave the page while it works. Each saved observation includes its source URL, method, and time.
- Observe the returned HTML title, description, canonical, H1 headings, noindex declaration, and filename-like image alternatives. This is not a rendered-browser, indexing, ranking, accessibility, or comprehensive SEO audit.
- Turn findings into private next steps or Desk briefs. Marking a step applied is a member's record, not independently verified publication or impact.
- Save Amazon edition links, descriptions, seven keyword fields, and categories as manual review notes. Preserve supplied keyword fields up to 200 characters; flag fields above the 50-character KDP guidance without silently truncating originals. Optimistic versions prevent overwriting another member's edits.
- Import one English Search Console Dates, Pages, or Queries CSV (under 2 MB, at most 10,000 rows). Dates exports have recomputed totals and impression-weighted position. Page/query exports do not establish property totals. Imports retain their supplied property and dates and are labeled manual snapshots.
- View daily reported clicks or impressions with an accessible source table. Missing dates remain unknown. No estimated sales, keyword volumes, or invented SEO scores.

## Google activation gates

The code includes a real read-only Search Console OAuth flow, but production connection is disabled until an owner configures a Google OAuth web client. A Gemini API key is not an OAuth client.

1. Enable the Search Console API in an owner-controlled Google Cloud project and configure the Google consent application. Follow Google's requirements for test users, publishing, and any required verification.
2. Create a web OAuth client with this exact production callback: `https://kira-os-dusky.vercel.app/api/discovery/google/callback`.
3. Add server-only Vercel production variables `KIRA_GOOGLE_CLIENT_ID`, `KIRA_GOOGLE_CLIENT_SECRET`, and `KIRA_GOOGLE_CREDENTIAL_KEY` (32 cryptographically random bytes, base64 encoded). The existing `KIRA_AI_RECORDING_KEY` capability and `NEXT_PUBLIC_APP_URL` are also required. Keep values out of source control and chat.
4. Deploy the updated environment. Cassy then authorizes `webmasters.readonly`, selects her verified website property, and explicitly refreshes the report.

Tokens are encrypted with AES-256-GCM and bound to author and consenting user. State is short-lived, single-use, cookie-bound, and protected with PKCE. Refresh jobs recheck membership, property permission, and connection revision. Disconnect cancels queued work and removes API reports; failed provider revocation is reported with instructions to revoke in Google Account connections. Manual reports remain.

If a website has not been verified, Wix owners can use [Wix's SEO Setup Checklist](https://support.wix.com/en/article/connecting-your-site-to-google-in-the-wix-seo-setup-checklist). Its Google connection requires a Premium site with a connected domain. Google data may take time to appear after setup. The product includes this guide and offers CSV import independently of KIRA OAuth setup.

## Boundaries and operation

No Wix edits, Amazon publishing, advertising spend, GA4 conversions, Amazon Attribution ingestion, automatic keyword generation, scheduled discovery email, or autonomous SEO agent are implemented here. The Facebook Ads workflow is separate.

Migration `202609230002_discovery_workspace.sql` adds isolated tables and capability-gated RPCs. Runtime uses session/publishable Supabase credentials, never a service-role key. Public HTML fetching resolves and pins public IPs, checks robots rules, validates every redirect, and bounds DNS, time, and response size. It sends no workspace or manuscript data to target sites.

Jobs allow one active check per page / one Google refresh, a one-minute debounce, 40 jobs per author per day, and a ten-minute stale-job recovery window. Last good results survive failed checks. Workflow step retries are disabled; explicit retries reserve a fresh job after stale work is retired.

## Validation

Run `npm run check` and the connected discovery browser suite. The latter uses explicitly synthetic loopback fixtures and is not evidence of a live Google connection. Hosted verification must separately confirm migration history, private access, saved records, and a real background website audit.

Keyword advice is a review aid grounded in [Amazon's guidance](https://kdp.amazon.com/en_US/help/topic/G201298500), not a claim that a phrase has search volume or converts readers.
