# Bring Cassie's KIRA OS online

One private workspace, ready on her phone or laptop. Vercel hosts it; a dedicated Supabase project keeps her account, briefs, decisions, and lessons together.

**Current state:** Vercel project `storm-booked/kira-os` is deployed at [KIRA OS](https://kira-os-dusky.vercel.app) with access closed until setup is complete. Supabase provisioning is waiting for integration terms; no Supabase resource has been created yet. Initial administrator: `michael@getanswerednow.ai`. Hosted sign-in and shared saving have not been verified.

## 1. One account step

[Accept the Supabase integration terms in Vercel](https://vercel.com/storm-booked/~/integrations/accept-terms/supabase?source=cli), using the StormBooked team. Then tell your setup helper that the terms are accepted.

This lets the helper create the dedicated Supabase resource through Vercel. A separate Supabase CLI login is not required for this route. Keep passwords, secret keys, and access tokens in the setup UI or password manager, rather than chat.

## 2. Let the helper finish the connection

After terms are accepted, the helper can continue the prepared Free-plan integration in region `sfo1`, connect its environment settings to the existing Vercel project, apply all repository migrations, and load `supabase/bootstrap.sql`. The bootstrap includes sourced catalog records and the clearly manual snapshot, with no demo intelligence.

The first administrator must be an **email-confirmed** Supabase email/password user, with its UUID assigned to `authors.owner_user_id`. Public signups stay disabled. The app signs in existing accounts only. Password entry must remain private; no setup script sends invitations or auth email. Cassie can receive her own account and author membership once her email is provided.

Production needs these values before its first verified launch:

| Setting | Value |
| --- | --- |
| `KIRA_WORKSPACE_MODE` | `connected` — even while setup is incomplete, so private access stays closed |
| `NEXT_PUBLIC_SUPABASE_URL` | Dedicated Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key, or legacy **anon** key |
| `KIRA_AUTHOR_ID` | `10000000-0000-4000-8000-000000000001` |
| `NEXT_PUBLIC_APP_URL` | Final HTTPS Vercel URL or custom domain |

Vercel may supply other integration variables. The app specifically requires the names above; it never needs a service-role key. Use a separate database for previews. Set Supabase's Auth Site URL to the final app URL and redeploy after environment changes.

## 3. Open it and try one real idea

The helper verifies the deployed app before calling it ready: sign in, add a business brief, reload, open it in a second browser, edit it, record a decision, save a lesson, and sign out. Private pages must require sign-in again. Then Cassie has a working home for her business, with saved work she can return to.

Live AI models and social integrations are not connected by this setup. Approved documents, covers, and connected intelligence are the next chapter.

## Local setup and the standalone fallback

For a prepared Supabase project, run from the repository root:

```bash
npm ci
npm run setup:local
npm run setup:check
npm run dev
```

The helper asks for the project URL, hides publishable-key entry, and supplies the standard author ID and localhost URL. It writes a git-ignored `.env.local` with private file permissions. Use `npm run setup:local -- --replace` to intentionally update an existing file; unrelated settings are preserved. `setup:check` validates local values only; it cannot verify remote migrations or ownership.

If the Vercel integration is unavailable, an administrator can create a dedicated project directly in Supabase, then run:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Run `supabase/bootstrap.sql` in that project's SQL editor. Do not load `supabase/seed.sql` into the real workspace: that file contains demo intelligence. Create the email-confirmed administrator in **Authentication → Users**, disable public signup, and assign the copied user UUID:

```sql
update public.authors
set owner_user_id = 'EXISTING_AUTH_USER_UUID'
where id = '10000000-0000-4000-8000-000000000001';
```

This should update one author. Configure the existing Vercel project with the settings above and follow the same deployed checks.

For noninteractive local setup, `npm run setup:local -- --from-env` reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the process environment. Alternatively, `SUPABASE_PUBLISHABLE_KEY_FILE` points to a private file containing only the publishable key and takes precedence. `KIRA_AUTHOR_ID` and `NEXT_PUBLIC_APP_URL` are optional, defaulting to the standard author UUID and `http://localhost:3000`. `--replace` remains required for an existing `.env.local`. The helper makes no cloud requests, accepts no key arguments, and prints no keys.
