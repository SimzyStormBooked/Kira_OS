# Background manuscript reading

Uploads save the private original and parsed passages before reading starts. The browser starts a durable Workflow and can navigate away. The book page polls saved status every five seconds. Reading is reference extraction, not fiction generation or an autonomous business agent.

## Execution and privacy

Only a job UUID enters Workflow history. Each step loads passages, calls the existing guarded model provider and stores validated citations inside the invocation. Step outputs contain state strings only. No manuscript text, user tokens, provider credentials or model responses are serialized into Workflow events.

The caller-scoped control RPC verifies editor access and source permission. A narrow worker RPC uses the server recording capability and a publishable Supabase client. Tenant and actor come from the saved job. It rechecks permission on every operation and uses the existing validated result recorder. No service-role key enters the web runtime. The first worker atomically binds its run ID; duplicate runs cannot read or charge.

## Throughput and recovery

Two groups of up to four passages run concurrently. Author-row locks make reservations disjoint and cap pending groups at two per manuscript. The daily reservation limit remains 150 per workspace. Gemini uses its supported low thinking setting for this bounded extraction, and is asked for concise salient findings to reduce output truncation and latency; strict validation is unchanged, and source citation checks now match across the source's own whitespace while still storing the passage's exact text. Original passages remain available for retrieval. Parallelism reduces wall time when provider capacity allows; it does not reduce tokens or guarantee a fixed completion time.

Deterministic batch IDs protect against replays. Completed passages are preserved. A known `invalid_output` can receive one automatic recovery attempt for the exact same passage group, including across resumed jobs. SQL atomically records the failed attempt and its usage before reserving a distinct recovery batch. Both attempts have separate usage records and count toward the same daily limit. Recovery is allowed only while the job remains active and permission, run binding and capacity checks hold. The SDK and Workflow step still have zero automatic retries.

Only the response that creates a recovery reservation authorizes its model call. If that response is lost, a replay cannot charge again; the job stops for explicit recovery. Timeouts, funding failures and unknown provider/database outcomes do not trigger automatic paid attempts. A second invalid response stops the job without marking those passages complete. Another in-flight group may still save, but cannot clear a terminal failure or override a pause. Three minutes without progress exposes retry, and pending reservations younger than two minutes cannot be replaced.

Failure telemetry contains a fixed reason (`output_limit`, `schema`, `json`, `citation` or `empty_or_invalid_output`), a sanitized generation ID and at most eight allowlisted schema issue codes/field names. Manuscript passages, model responses and raw provider errors are never logged. Citation and schema acceptance rules remain unchanged.

## Deployment and verification

Apply migrations while manuscript reading is idle and no batch remains pending. Exclude generated Workflow paths from the auth proxy; Workflow owns transport authorization, while the worker independently requires the private server capability. Verify using a clearly labeled synthetic reference document: start, navigate away, wait, reopen and check ready status and citations.

The sequential process endpoint remains for compatibility. Its pending reservation check prevents an extra batch while background work is pending. A crash after generation but before persistence may require an explicitly approved paid retry; this is surfaced rather than hidden. Provider errors and unverified results still need attention. Workflow platform usage and model usage are both billable.

References: [Gemini 3.8 thinking levels](https://ai.google.dev/gemini-api/docs/latest-model?hl=en) and [AI SDK Google options](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai). Production recovery confirmed an actual `length` finish at the previous output budget; concise low-thinking requests produced complete validated results on the affected passages. This is not a claim of complete semantic recall.
