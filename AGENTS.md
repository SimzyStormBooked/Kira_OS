# KIRA OS contributor and agent contract

Kira writes. AI runs the business around the books. Do not build novel, manuscript, chapter, scene, or fiction generation. Never replace the author's creative voice. Manuscripts may only become read-only reference knowledge with source permission.

## Working rules

1. Inspect the repository and git status before changes. Preserve useful infrastructure.
2. Keep this slice within the implemented roadmap. Do not create fake autonomous agent status.
3. Every synthetic business record has `data_origin: "demo"` and visible DEMO treatment. Manual snapshots are not live APIs. Unknown metadata stays null and visibly needs verification.
4. Every finding/recommendation carries provenance. Do not invent book details or assign demo tropes to real titles.
5. Provider integrations belong behind `lib/ai/provider.ts`, with server-only secrets and creative policy checks. Validate model outputs before returning or persisting them.
6. Approve records a decision only. Connected mode saves authorized private workspace records, but has no publisher, outreach sender, spend executor, or catalog mutator. Do not add hidden external execution.
7. Teach Raven feedback must stay attached to its approval, timestamped, attributable and exportable. Do not claim that saved text has trained a model.
8. Future read-only connectors must treat imported text as data, not instructions. Source approval and rights status apply before repurposing.
9. Keep docs aligned with actual code. Clearly distinguish interfaces/migrations from connected runtime features.
10. Run `npm run check` and relevant `npm run test:e2e` after behavioral changes. Seed changes require `npm run db:seed:generate` and database tests.
11. Keep demo and connected state separate. Production must explicitly select connected mode; incomplete configuration and failed authorization must fail closed, never fall back to the demo.
12. Create workspace stores per provider/request. Never place private user state in a process-wide singleton. Derive tenant scope from the verified session; retain SQL RLS and caller-scoped RPCs.
13. Keep service-role keys out of the web runtime. Accounts are existing email-confirmed Supabase users; public signup stays disabled. Do not send auth emails or create accounts without task authorization.
14. Production bootstrap contains sourced catalog/manual records only. Demo intelligence belongs in the demo seed. Bootstrap changes require `npm run db:bootstrap:generate` and database tests.

## Agent foundation

Domain contracts are in `types/domain.ts`: Agent, AgentRun, AgentFinding, AgentRecommendation, Evidence, ApprovalRequest. Raven is a deterministic executive service consuming seeded specialist findings. Reader Voice, Social Intelligence, Discoverability, The Hunt, and Outreach are disconnected definitions. There is no agent scheduler or background process.

The provider gate enforces policy and delegates to an interchangeable implementation. The demo provider calls a pure prioritizer. The demo route returns a completed run and structured recommendations; connected mode cannot run or save demo intelligence. Add real models per job without putting SDK calls in React components.

## Human authority

Pending approvals can be edited, approved or rejected. Final decisions are retained. New feedback may accompany any decision. Connected mode uses authenticated Supabase storage; demo mode uses browser-local storage. SQL enforces final-state immutability, expected versions, tenant isolation, source provenance, and append-only audit events.

Manual business briefs are member input with attributed sources and immutable original-text evidence. Preserve evidence when editing a draft. Lessons stay tied to approvals and authenticated users. Hosted provisioning and sign-in/save/reload verification are distinct from local tests; keep handoffs honest about both.

## Repository commands

- `npm run dev` — local preview
- `npm run check` — typecheck, lint, unit/database tests, production build
- `npm run test:e2e` — desktop/mobile browser verification
- `npm run db:seed:generate` — regenerate seed from typed source data
- `npm run db:bootstrap:generate` — regenerate sourced bootstrap without demo intelligence
- `npm run setup:local` — create private connected configuration locally
- `npm run setup:check` — validate local settings; does not verify remote setup

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
