# Creative workspace refresh — October 2026

The connected home has a character-art carousel, a dismissible October welcome note, four direct next steps, saved-work shortcuts, and larger pinned portrait cards. Character Studio includes a separate public-art gallery with a full-size viewer and an explicit private-profile creation form. The bookshelf and shared navigation use the same warm literary palette.

The note describes this release, not a computed change log since a person's last sign-in. Only its dismissal preference is kept in localStorage, scoped to the release and a hash of the viewer email; it can be reopened. It contains no private activity, manuscripts or answers.

Saved work appears before general exploration, with a jump link in the invitation. Once any private character profile exists, profiles and their explicitly labeled search appear first in Character Studio; the public collection is collapsed below. A withdrawn latest manuscript is a supported resume state and opens book details without breaking other summaries. A full or unavailable browser store still permits note dismissal and reopening in the current tab.

## Artwork and authorship

The six public photographs below come from Kira Stanley's own published [Syndicate Mafia character-sticker listing](https://www.kirastanleyauthor.com/product-page/syndicate-mafia-character-stickers). These are shop photographs of illustrated stickers, not original illustration masters. Character names follow that listing. The gallery links back to the source and displays full photographs without generating replacement likenesses.

| Character | Local asset | Published photograph |
| --- | --- | --- |
| Rayla | public/artwork/kira/rayla.jpg | https://static.wixstatic.com/media/69d668_86a7fbc0d3e6466d97e2849e45851cbe~mv2.jpg |
| Avery | public/artwork/kira/avery.jpg | https://static.wixstatic.com/media/69d668_947b7ebb59464fe2872f7aec00af1b88~mv2.jpg |
| Cosmo | public/artwork/kira/cosmo.jpg | https://static.wixstatic.com/media/69d668_2d9e49c01ae540338405919860384ef4~mv2.jpg |
| Ax | public/artwork/kira/ax.jpg | https://static.wixstatic.com/media/69d668_45637d3c15944c358e2125ceffa2e61b~mv2.jpg |
| Lex | public/artwork/kira/lex.jpg | https://static.wixstatic.com/media/69d668_81a5ba1a59e149978b9c626c5baf65d9~mv2.jpg |
| Falcon | public/artwork/kira/falcon.jpg | https://static.wixstatic.com/media/69d668_45f1b9e19b5e4831969113ca48246ccc~mv2.jpg |

The server enables this collection only for the verified Kira author workspace. Other authors receive an empty collection. The JPEGs are already-public static assets; there is no confidentiality claim about them. Public photographs are neither manuscript evidence nor permission to reuse artwork in an ad. No character biography, manuscript identity or private portrait record is created from a photograph. Starting a profile opens a name-only form and requires an explicit save. An existing unfinished draft takes priority over the selected artwork's name.

## Controls and private portraits

Pinned profiles with ready private portraits replace the public carousel lineup. Their existing short-lived signed images bypass the shared Next.js image optimizer and are never placed in browser storage. The home summary refreshes while visible every four minutes and on window focus to renew five-minute signatures. Existing caller-scoped queries, role checks and RLS remain in force.

The carousel advances every twelve seconds, pauses on hover or keyboard focus, stops when the document is hidden, and has manual selection and a play/pause control. Reduced-motion preferences disable automatic rotation and arrival animation. Broken artwork has a readable fallback; a renewed private URL can recover from a previous image failure.

No database migration or new paid service is required. This release does not activate Meta authorization, send email, modify advertising budgets, or alter saved book findings.

## Verification

`tests/workspace-resume.test.ts` checks tenant-scoped artwork selection and the summary boundary. `tests/e2e-connected/creative-home.spec.ts` uses the synthetic connected fixture to verify dismissal/reopen/reload, actual image decoding, manual and timed carousel controls, reduced motion, failed-image recovery, explicit profile saving, preserved drafts, accessibility and desktop/mobile overflow. Public artwork is injected into fixture display responses only; that is not proof of a hosted user's private data.
