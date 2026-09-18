# Bring Cassie's KIRA OS into her day

The private workspace is online at [KIRA OS](https://kira-os-dusky.vercel.app). Vercel project `storm-booked/kira-os` is connected to dedicated Supabase project `obusnqlwuoavwtmryiik`. Real administrator sign-in, brief saving/reloading, a separate-browser read, and sign-out have passed. Eight sourced books are loaded; no demo intelligence is in the private database.

## 1. Sign in and make the account yours

Initial administrator/owner: `michael@getanswerednow.ai`. Use the privately supplied account password, then change it under **Settings → Your password**. The current password is required. Public signup is disabled; each person uses their own confirmed account.

Cassie needs her own email-confirmed Supabase account before access can be granted. An administrator creates that account privately; the app does not create accounts, send invitations, or email passwords.

## 2. Give Cassie her place in the workspace

As the owner, open **Settings → Manage workspace access**. Add her existing account email and choose **Editor** to let her save briefs, approve/reject decisions, and keep lessons. **Viewer** can read and export review data. The owner can change or remove collaborator access; saved work is retained. Ownership itself is not transferred from this screen.

Have her sign in, open the eight-book catalog, and save one business idea at Cassandra's Desk. The optional Guide and Learn & Create workshop provide a quiet introduction. Copying a sign-in link does not grant access, and saving an agent blueprint does not start an agent.

## 3. Activate optional tools when their accounts are ready

**Ask Raven:** the backend is implemented, but Gateway currently has zero credits and no successful live model response has been verified. Vercel currently asks the account owner to add a card to complete verification and unlock its displayed free-credit allowance. Complete that account step in Vercel; the setup helper then checks credits, provisions the private recording capability, runs a bounded hosted test, and enables the feature. Until then, leave `KIRA_AI_ENABLED=false`. No offline/demo answer substitutes for the model.

**Social accounts:** profile shortcuts and the NotebookLM copy bridge can be used independently. Real Meta authorization needs an app, configured callbacks/permissions, and consent from the account owner. Meta app credentials are not configured yet. Follow the [Instagram and Facebook setup guide](lib/connections/SETUP.md). Account authorization does not yet import social metrics or publish content.

## Deployment settings

| Setting | Value |
| --- | --- |
| `KIRA_WORKSPACE_MODE` | `connected` |
| `NEXT_PUBLIC_SUPABASE_URL` | Dedicated Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key or legacy **anon** key |
| `KIRA_AUTHOR_ID` | `10000000-0000-4000-8000-000000000001` |
| `NEXT_PUBLIC_APP_URL` | `https://kira-os-dusky.vercel.app` or the verified custom domain |
| `KIRA_AI_ENABLED` | `false` until AI setup and verification succeed |
| `KIRA_AI_RECORDING_KEY` | Server-only 32 random bytes encoded as 64 hexadecimal characters |

The AI recording key's SHA-256 hex hash belongs in `private.workspace_generation_config` with `singleton=true`; only the literal key belongs in the server environment. The Studio/access/links migrations and the recording key/hash are now provisioned in the hosted workspace. For a new installation, a helper provisions them through the administrative setup connection. Never put the key in a public environment variable or send it in browser props.

Seven privileged integration-injected Supabase secrets were removed from Vercel runtime. The web app uses a publishable/anon key and the signed-in session, never a service-role key, database password, or privileged database URL. Keep administrative credentials out of runtime and source control. Use a separate database for previews and redeploy after environment changes.

The core hosted flow has passed; the latest AI/access/connector additions still require their final integrated deployment checks. Supabase Free does not include its Pro-only leaked-password protection; no upgrade was purchased. Use unique account passwords. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security) and [VERIFICATION.md](VERIFICATION.md).

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
