# Instagram and Facebook authorization

The code is implemented. In the current KIRA OS production project, the Meta database migration, server credential key and matching private database capability hash have already been provisioned. Preserve that key; it does not need to be generated again. No Meta app or social account has been authorized yet.

The remaining owner steps are to configure the Meta app, supply its App ID, App Secret, Login configuration ID and supported Graph version, then complete consent and verify the account read. The Connections page shows **Setup pending** until the server configuration and database capability check both succeed. Saving a profile link does not authorize an account.

## 1. Prepare the account and Meta app

Use an Instagram **Business or Creator** account linked to the intended Facebook Page. The person authorizing needs Page access that includes analytics. In Meta for Developers, configure **Facebook Login for Business** and a configuration that issues **User access tokens**, not Business Integration System User tokens. This release performs reads when the owner clicks a control; it does not run background jobs.

Configure these read permissions:

```
pages_show_list
pages_read_engagement
read_insights
instagram_basic
instagram_manage_insights
```

Start with the actual account holder added in the app dashboard for an owned/managed-account test. Accounts outside that arrangement need Advanced Access/App Review. Follow the business-verification requirements displayed by Meta. Do not add posting, messaging or advertising permissions merely to make a denied request succeed. Some Business Manager Page-role arrangements need additional permissions that this release deliberately does not request.

Use the canonical production origin configured as `NEXT_PUBLIC_APP_URL`. For the current Vercel hostname, register:

| Meta setting | Exact URL |
|---|---|
| Valid OAuth redirect URI | `https://kira-os-dusky.vercel.app/api/connections/meta/callback` |
| Deauthorize callback URL | `https://kira-os-dusky.vercel.app/api/connections/meta/deauthorize` |
| Data deletion request URL | `https://kira-os-dusky.vercel.app/api/connections/meta/deletion` |

The deletion endpoint accepts signed provider requests and returns a confirmation/status URL after deletion. Publish the app’s actual privacy policy as required by Meta; a private Connections page is not a public privacy policy. Register a new exact URL set if the app later moves to a custom domain. Preview deployments do not inherit permission to use the production callback.

A private hash and timestamp of provider revocations is retained temporarily to reject an OAuth attempt already in progress when access is revoked. Old replay guards are cleared during subsequent authorization setup after one day; they contain no tokens or account names.

## 2. Add server configuration

Set these only in the Vercel server environment, scoped to the intended deployment:

| Setting | Value |
|---|---|
| `KIRA_META_APP_ID` | Meta App ID |
| `KIRA_META_APP_SECRET` | Meta App Secret |
| `KIRA_META_LOGIN_CONFIG_ID` | Facebook Login for Business configuration ID |
| `KIRA_META_GRAPH_VERSION` | A currently supported version selected in the Meta app, for example `v26.0` after validating the version’s requested fields |
| `KIRA_META_CREDENTIAL_KEY` | Already provisioned for the current production project. Preserve this cryptographically random 32-byte Base64 key and its secure backup. |
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS app origin, without a path |

Never give the secrets `NEXT_PUBLIC_` names. Never put provider tokens, the credential key or app secret in a saved link, source record, issue, chat, repository or workspace export. The app uses the session-scoped Supabase client, not a service-role key.

## 3. Provision the database capability

This step is already complete for the current production project. The following procedure is retained for a new environment or an intentional operator-led rotation.

Apply `20260918004008_meta_authorization.sql` first. The credential key derives a server capability using HMAC-SHA256 with the fixed context `KIRA_META_SERVER_CAPABILITY_V1`. Only SHA-256 of that capability is stored in the locked database configuration; the capability itself never reaches a browser.

With the same key already set in a private, git-ignored `.env.local`, this command prints **only a hash and a SQL statement**, never the key or capability:

```sh
node --env-file=.env.local --input-type=module <<'JS'
import { createHash, createHmac } from 'node:crypto';
const key = Buffer.from(process.env.KIRA_META_CREDENTIAL_KEY ?? '', 'base64');
if (key.length !== 32) throw new Error('A 32-byte credential key is required.');
const proof = createHmac('sha256', key).update('KIRA_META_SERVER_CAPABILITY_V1').digest('hex');
const hash = createHash('sha256').update(proof).digest('hex');
console.log(`insert into private.meta_connector_config(singleton,server_proof_hash) values(true,'${hash}') on conflict(singleton) do update set server_proof_hash=excluded.server_proof_hash;`);
JS
```

For a new environment, run the resulting SQL administratively in the intended Supabase project. This is an operator setup step; ordinary authenticated users cannot configure it. The current project’s deployment tooling has already provisioned the key and hash without exposing the key. If the key changes, existing ciphertext requires reconnection; do not rotate it casually or assume the old credentials will decrypt.

## 4. Authorize and verify

After redeploying, the workspace **owner** sees **Connect with Meta**. The provider screen chooses which Pages to make available. This release supports up to 25 selected Pages and verifies the returned Page/linked-Instagram identities before recording authorization; select only the intended accounts. Cancellation, missing scopes, mismatched state, unknown expiry and failed account reads leave a new authorization unsaved.

The page lists actual authorized account identities, permission expiry and last successful account check. **It does not yet ingest insights reports, calculate social metrics, or run automatic sync.** Existing manual follower/post snapshots retain their original provenance.

Facebook User tokens are exchanged for long-lived tokens and their expiry is checked. Expired or revoked tokens require the owner to reconnect. **Check account access** verifies current access on demand. **Disconnect Meta** removes local credentials and attempts provider revocation; if the provider cannot be reached, the UI tells the owner to remove remaining permission in Meta Business Integrations.

Validate the complete hosted consent and account read with the real app before representing the social connection as operational. Local tests cover state replay/cancellation, owner/tenant isolation, credential encryption, expiry, signature validation, safe error output and disconnect races; they cannot replace Meta App Review or real account authorization.

Official references: [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/), [manual OAuth and token inspection](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/), [long-lived tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/), [Instagram insights](https://developers.facebook.com/docs/instagram-platform/insights/), [Page insights](https://developers.facebook.com/docs/graph-api/reference/insights/).
