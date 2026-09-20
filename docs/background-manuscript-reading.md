# Background manuscript reading

Uploads save the private original and parsed passages before reading starts. The browser starts a durable Workflow and can navigate away. The book page polls saved status every five seconds. Reading is reference extraction, not fiction generation or an autonomous business agent.

## Execution and privacy

Only a job UUID enters Workflow history. Each step loads passages, calls the existing guarded model provider and stores validated citations inside the invocation. Step outputs contain state strings only. No manuscript text, user tokens, provider credentials or model responses are serialized into Workflow events.

The caller-scoped control RPC verifies editor access and source permission. A narrow worker RPC uses the server recording capability and a publishable Supabase client. Tenant and actor come from the saved job. It rechecks permission on every operation and uses the existing validated result recorder. No service-role key enters the web runtime. The first worker atomically binds its run ID; duplicate runs cannot read or charge.

## Throughput and recovery

Two groups of up to four passages run concurrently. Author-row locks make reservations disjoint and cap pending groups at two per manuscript. The daily reservation limit remains 150 per workspace. Gemini uses its supported low thinking setting for this bounded extraction, and is asked for concise salient findings to reduce output truncation and latency; strict validation and exact-source citation checks are unchanged. Original passages remain available for retrieval. Parallelism reduces wall time when provider capacity allows; it does not reduce tokens or guarantee a fixed completion time.

Deterministic batch IDs protect against replays. Completed batches are reused; uncertain attempts need explicit retry. Provider calls and workflow steps have no automatic paid retries. Only idempotent persistence is retried. An error stops new work; another in-flight group may finish. Pause is persisted. Three minutes without progress exposes retry, and pending reservations younger than two minutes cannot be replaced.

## Deployment and verification

Apply the migration after the current production manuscript is ready and no batch remains pending. Exclude generated Workflow paths from the auth proxy; Workflow owns transport authorization, while the worker independently requires the private server capability. Verify using a clearly labeled synthetic reference document: start, navigate away, wait, reopen and check ready status and citations.

The sequential process endpoint remains for compatibility. Its pending reservation check prevents an extra batch while background work is pending. A crash after generation but before persistence may require an explicitly approved paid retry; this is surfaced rather than hidden. Provider errors and unverified results still need attention. Workflow platform usage and model usage are both billable.

References: [Gemini 3.8 thinking levels](https://ai.google.dev/gemini-api/docs/latest-model?hl=en) and [AI SDK Google options](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai). Production recovery confirmed an actual `length` finish at the previous output budget; concise low-thinking requests produced complete validated results on the affected passages. This is not a claim of complete semantic recall.
