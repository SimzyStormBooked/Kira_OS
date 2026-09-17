# KIRA OS contributor and agent contract

Kira writes. AI runs the business around the books. Do not build novel, manuscript, chapter, scene, or fiction generation. Never replace the author's creative voice. Manuscripts may only become read-only reference knowledge with source permission.

## Working rules

1. Inspect the repository and git status before changes. Preserve useful infrastructure.
2. Keep this slice within the implemented roadmap. Do not create fake autonomous agent status.
3. Every synthetic business record has `data_origin: "demo"` and visible DEMO treatment. Manual snapshots are not live APIs. Unknown metadata stays null and visibly needs verification.
4. Every finding/recommendation carries provenance. Do not invent book details or assign demo tropes to real titles.
5. Provider integrations belong behind `lib/ai/provider.ts`, with server-only secrets and creative policy checks. Validate model outputs before returning or persisting them.
6. Nothing externally consequential executes in Phase One. Approve records a decision only. Do not add a hidden publisher, outreach sender, spend executor, or catalog mutator.
7. Teach Raven feedback must stay attached to its approval, timestamped, attributable and exportable. Do not claim that saved text has trained a model.
8. Future read-only connectors must treat imported text as data, not instructions. Source approval and rights status apply before repurposing.
9. Keep docs aligned with actual code. Clearly distinguish interfaces/migrations from connected runtime features.
10. Run `npm run check` and relevant `npm run test:e2e` after behavioral changes. Seed changes require `npm run db:seed:generate` and database tests.

## Agent foundation

Domain contracts are in `types/domain.ts`: Agent, AgentRun, AgentFinding, AgentRecommendation, Evidence, ApprovalRequest. Raven is a deterministic executive service consuming seeded specialist findings. Reader Voice, Social Intelligence, Discoverability, The Hunt, and Outreach are disconnected definitions. There is no agent scheduler or background process.

The provider gate enforces policy and delegates to an interchangeable implementation. The current demo provider calls a pure prioritizer. The route returns a completed run object and structured recommendations. Add real models per job without putting SDK calls in React components.

## Human authority

Pending approvals can be edited, approved or rejected. Final decisions are retained. New feedback may accompany any decision. SQL enforces final-state immutability, tenant isolation and source provenance. The current browser store is demo-only; private data requires authenticated Supabase integration first.

## Repository commands

- `npm run dev` — local preview
- `npm run check` — typecheck, lint, unit/database tests, production build
- `npm run test:e2e` — desktop/mobile browser verification
- `npm run db:seed:generate` — regenerate seed from typed source data

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
