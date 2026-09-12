# AGENT B — Final Report (2026-09-12)

Branch: `design/paul-town-british-world-2026-09-12` (base `main` @ `a87866a`).
Worktree: `C:\Users\jinal\AppData\Local\Temp\claude\C--voca\b18045d8-303d-42c6-badc-6168afe1d187\scratchpad\wt-town-design`.
`C:\voca` (Agent A's worktree) was never touched. No `git push` performed.

## 1. Files created

Docs:
- `docs/design/town/PAUL_TOWN_BRITISH_WORLD.md`
- `docs/design/town/VISUAL_SYSTEM.md`
- `docs/design/town/DISCOVERY_SYSTEM.md`
- `docs/design/town/UX_FLOW.md`
- `docs/design/town/ASSET_MANIFEST.json`
- `docs/design/town/ASSET_MANIFEST.md`
- `docs/design/town/COMPONENT_ARCHITECTURE.md`
- `docs/design/town/OWNER_DECISIONS.md`
- `docs/design/town/AGENT_B_REPORT.md` (this file)
- `docs/design/town/previews/` (directory created, empty — see §8)

Code (all additive, none touch existing files):
- `src/utils/town/townDiscovery.js` — deterministic discovery selector (pure, import 0).
- `src/utils/town/townAmbient.js` — pure ground-variation/depth-cue helpers (import 0).
- `src/components/town/TownDiscoveryCard.jsx` — presentational discovery card, `paulTownV1`-gated.
- `src/components/town/TownWoodenSignHeader.jsx` — presentational wooden-sign wrapper, `paulTownV1`-gated.

Tests:
- `scripts/testTownDiscovery.mjs` — 69 assertions.
- `scripts/testTownPrototypeStatic.mjs` — 41 assertions.

**No existing file was modified** — confirmed by `git diff --stat main..HEAD` (all entries are new files) and by `scripts/testTownPrototypeStatic.mjs` §3, which asserts none of `TownScreen.jsx`/`TownGrid.jsx`/`TownHeader.jsx`/`TownShopPanel.jsx`/`TownInventory.jsx`/`App.jsx` import the new prototype components.

## 2. Commits (all local, branch `design/paul-town-british-world-2026-09-12`)

```
663e924 docs(town): British world design
9aca7d6 docs(town): visual system
3d7b7fb feat(town): discovery system (code + doc + 69 assertions)
59b6557 docs(town): UX flow
4337d56 docs(town): asset manifest
136f907 docs(town): component architecture
d03d21b feat(town): safe frontend prototype (code + 41 assertions)
f6d4db0 docs(town): owner decisions
```

## 3. Tests run + results

| Suite | Assertions | Result |
|---|---|---|
| `scripts/testTownUiStatic.mjs` (existing, required gate) | 95 | PASS (unchanged from baseline) |
| `scripts/testTownLayout.mjs` (existing) | 69 | PASS |
| `scripts/testTownCatalog.mjs` (existing) | 50 | PASS |
| `scripts/testTownLevelLock.mjs` (existing) | 53 | PASS |
| `scripts/testBundleBudget.mjs` (existing) | 10 | PASS (after `npm run build`; TownScreen chunk unchanged 7.2KB/15KB budget) |
| `scripts/testTownDiscovery.mjs` (new) | 69 | PASS |
| `scripts/testTownPrototypeStatic.mjs` (new) | 41 | PASS |
| **Total** | **387** | **0 failures** |

`tests/e2e/townV1.spec.mjs` was **not run in Phase 1**. Rationale: no wired code path
changed (the new components are not imported anywhere — verified statically
above), so the E2E suite cannot exercise anything new, and re-running it
would only re-confirm the existing baseline that the other agent already
validated (480 assertions, `handoff.md` 127차). Given the session's
instruction to avoid unnecessary memory/resource use, this was skipped as a
deliberate, low-risk call. **(Phase 1 status — the components are now wired
and this suite has since been run; see the Phase 2 section below.)**

## 4. Build result

```
npm ci --no-audit --no-fund   → 164 packages installed (worktree had no node_modules)
npm run build                 → vite build succeeded, 249 modules transformed, 18.41s
```
No new errors/warnings attributable to this session's changes (build output
identical in shape to the documented baseline in `scripts/testBundleBudget.mjs`
comments — TownScreen chunk 19.95KB raw / 7.22KB gzip, main chunk 367KB raw /
123.45KB gzip, both within existing budgets).

`node_modules/` and `dist/` are gitignored and were not committed.

## 5. Previews (Phase 1 status)

**None generated in Phase 1.** Rationale documented in `OWNER_DECISIONS.md`
§5: the safe prototype components were deliberately left un-wired (§6
below), so toggling `paulTownV1: true` and screenshotting the live app would
produce pixel-identical images to the current baseline — not a preview of
the new design. Per the task's own priority ("prefer finishing 1–6 fully
over a half-done prototype"), session time went to completing docs 1–6 and
a safe, test-covered prototype rather than screenshot tooling. **(Phase 2
generated 5 previews — see the Phase 2 section below.)**

## 6. IP check results

`scripts/testTownDiscovery.mjs` §7 scans every file in `docs/design/town/`
(`.md`/`.json`) plus `src/utils/town/townDiscovery.js` for the 15
operator-specified forbidden terms (exact list: the `FORBIDDEN_TERMS`
constant in that test file — this report deliberately does not repeat the
list in prose, since an earlier draft of this exact document tripped its
own scanner by naming them; see `PAUL_TOWN_BRITISH_WORLD.md` §8 for the same
convention). **Every term: 0 occurrences** across every scanned file
(per-term-per-file assertions all PASS, plus one combined regex assertion).
`scripts/testTownPrototypeStatic.mjs` also re-checks the two new component
files for the top-3 terms as a secondary net — 0 occurrences.

One editorial note: the design docs deliberately do **not** spell out the
15 forbidden terms in prose (only the test file's `FORBIDDEN_TERMS` constant
holds them) — an early draft did list them for documentation purposes and
that self-reference tripped the very scanner it was describing; the docs
were rewritten to point at the test constant instead, which is both safer
and avoids the paradox.

## 7. Compatibility notes

- Reused without modification: `townLayout.js` (8×6 grid, placement/move/
  store, tombstone merge), `townCatalog.js` (17-item catalog, `mergeCatalog`,
  `itemState`), `townLevel.js` (10-level thresholds), `townMessages.js`
  (existing `EVENT_TEMPLATES`/`TOWN_PHRASES`), all `TownScreen`/`TownGrid`/
  `TownHeader`/`TownShopPanel`/`TownInventory` components, `useTownShop.js`,
  `App.jsx` wiring, `supabase_v3_50_town_v1.sql` catalog (read-only reference,
  no DDL/DML anywhere in this session).
- Extended (new, additive files only): discovery content/selector, ambient
  ground-variation helpers, two presentational prototype components.
- Not touched at all: anything under `C:\voca` (Agent A's worktree), any
  SQL file, `src/config/features.js` default values (`paulTownV1` remains
  `false`), any `.claude/agents/*` or infra config.
- Phase 1 deferred wiring into `TownGrid.jsx`/`TownScreen.jsx` with an
  explicit reason recorded (`COMPONENT_ARCHITECTURE.md` §6,
  `OWNER_DECISIONS.md` §3). Phase 2 (coordinator-directed) went ahead and
  wired it — see the Phase 2 section below for what actually shipped and
  the two regressions the static analysis's "low-risk" prediction missed.

## 8. Owner decisions requiring operator input

See `docs/design/town/OWNER_DECISIONS.md` for the full QUESTION/WHY/OPTIONS/
RECOMMENDATION/SAFE DEFAULT write-ups:
1. Next-level unlock preview in `TownHeader`.
2. Whether/how to add the 5 category-based Paul guide lines to `townMessages.js`.
3. Timing of actually wiring the safe prototype into live screens.
4. Whether to add the 4 proposed catalog items (pending economy-audit price decisions).
5. Screenshot omission rationale (duplicated from §5 above for completeness).

## 9. Final state confirmation

- `git status --short` in the worktree: **clean** (verified above, no output).
- `C:\voca` was never read or written by this session (all file operations
  used the worktree path above).
- No `git push`, no destructive git operations, no SQL/DB changes, no env
  changes, no new npm dependencies added to `package.json` (only existing
  lockfile dependencies materialized via `npm ci` to enable the build/test run).
- `paulTownV1` remains `false` by default (unchanged in `src/config/features.js`,
  which this session did not modify).

---

## PHASE 2 (2026-09-12) — Wire the prototype inside TownScreen

Coordinator directed a follow-up phase: wire the Phase 1 prototype live
inside the already-flag-gated `TownScreen` tree, keep the required
regression gate green, run the full 480-assertion E2E spec, and generate
real previews. Same worktree/branch, same safety rules (no push, no
`C:\voca`, no DB, `paulTownV1` default stays `false`).

### Files changed in Phase 2

- `src/App.jsx` — one-line addition: `<TownScreen ... studentId={studentId} />`
  (plumbing only, `studentId` already existed in scope; no other line
  touched, `testTownUiStatic.mjs` §5 App.jsx wiring regex still matches
  unchanged).
- `src/components/town/TownScreen.jsx` — imports `TownWoodenSignHeader`,
  wraps the existing `<TownHeader level={level} starsEarned={starsEarned}
  dollarsAvailable={balance} />` call (byte-identical props, still present)
  and the existing Paul guide `HeroReaction` card, each in its own
  `<TownWoodenSignHeader>`. Passes `studentId` through to `TownGrid`.
  `HeroReaction` render count is still exactly 1.
- `src/components/town/TownGrid.jsx` — imports `ambientClassFor`/
  `depthClassFor` (`townAmbient.js`) and `placeKeyForItemId` (`townDiscovery.js`)
  and `TownDiscoveryCard`. Adds `depthClassFor(y, TOWN_GRID.rows)` to each
  cell's `<button>` className and `ambientClassFor(x, y)` to the non-home/
  non-path background className (0 new DOM nodes, pure className string
  concatenation). For items with no discovery content (11 of 17), the
  open action-strip markup is byte-identical to pre-Phase-2. For the 6
  discovery-mapped items, the strip becomes a `flex-col` card that also
  renders `<TownDiscoveryCard itemId={placed.itemId} studentId={studentId} />`
  below the existing 이동/보관 buttons, with deterministic x-based edge
  alignment (`left-0` / `right-0` / centered) so the wider card never
  clips off-screen for edge-column placements.
- `scripts/testTownPrototypeStatic.mjs` — section 3 rewritten from
  "assert NOT wired anywhere" to "assert wired only inside TownScreen's own
  tree, not leaked into App.jsx/Dashboard.jsx/PaulTown.jsx/TownHeader.jsx/
  TownShopPanel.jsx/TownInventory.jsx" (10 new positive-wiring assertions +
  9 negative-leak assertions across those 6 files, total suite now 51
  assertions, up from 41).
- `docs/design/town/AGENT_B_REPORT.md` — fixed a self-referential IP-scan
  false positive (§6 originally spelled out the 15 forbidden terms in
  prose, which made this very file fail its own scanner once it existed —
  rewritten to point at the test constant, same convention already used in
  `PAUL_TOWN_BRITISH_WORLD.md` §8 and `DISCOVERY_SYSTEM.md` §5).
- `docs/design/town/OWNER_DECISIONS.md` — appended Phase 2 resolution notes
  to §3 (wiring timing) and §5 (screenshot rationale); no existing text
  removed.
- `docs/design/town/previews/` — 5 PNGs + `README.md` + `_manifest.json`
  (see §Previews below).

**No file outside this list was touched.** `TownHeader.jsx`,
`TownShopPanel.jsx`, `TownInventory.jsx`, `townLayout.js`, `townCatalog.js`,
`townLevel.js`, `townMessages.js`, `useTownShop.js`, `useStudent.js`,
`Dashboard.jsx`, `PaulTown.jsx` — all unmodified, confirmed by
`scripts/testTownPrototypeStatic.mjs` section 3.

### Two regressions found and fixed (by actually running the E2E suite)

Static analysis in Phase 1 (`COMPONENT_ARCHITECTURE.md` §4) predicted the
wiring was "structurally safe" — running `tests/e2e/townV1.spec.mjs`
(480 assertions) proved that prediction half-wrong. Both were caught on the
first full run against `npm run preview --port 4191` and fixed before the
final green run:

1. **CSS stacking-context bug.** `depthClassFor` originally added an
   `opacity-90`/`opacity-100` class to the outer per-cell wrapper `<div>` —
   the same element that also parents the `absolute z-10` move/store action
   strip. CSS `opacity < 1` creates a new stacking context, which trapped
   the popup's `z-10` inside that single cell's context; any later-DOM-order
   sibling cell then painted over it, making the popup's buttons
   unclickable (`locator.click: Timeout 30000ms exceeded ... <button
   aria-label="빈 칸 (2, 2)"> ... subtree intercepts pointer events`). Fix:
   moved `depthClassFor` onto the `<button>` itself (a sibling of the
   popup, not an ancestor), so the wrapper never creates a stacking context.
2. **Popup width regression at edge columns.** The action-strip container
   was originally restructured unconditionally to `flex-col` +
   `min-w-[160px]` (to fit the discovery card), which widened the popup
   even for items with no discovery content. At the three wider viewports
   (768×1024, 1280×800, 844×390) the grid no longer needs to horizontal-
   scroll (it fits inside `max-w-lg`), so a popup wider than the leftmost
   cell's available space overflowed into the container's clipped region,
   again blocking the click (`<div class="min-h-screen p-4 pb-24">
   intercepts pointer events`). Fix: non-discovery items (11 of 17) now
   render the exact pre-Phase-2 markup (no width change at all); only the
   6 discovery-mapped items use the wider layout, and their popup now
   aligns `left-0`/`right-0`/centered based on the cell's x-coordinate
   instead of always centering, keeping it fully on-screen even in the
   leftmost/rightmost column (confirmed visually in the discovery-card
   preview screenshot).

### Tests run (Phase 2)

| Suite | Assertions | Result |
|---|---|---|
| `scripts/testTownUiStatic.mjs` | 95 | PASS (unchanged) |
| `scripts/testTownLayout.mjs` | 69 | PASS |
| `scripts/testTownCatalog.mjs` | 50 | PASS |
| `scripts/testTownLevelLock.mjs` | 53 | PASS |
| `scripts/testTownDiscovery.mjs` | 69 | PASS |
| `scripts/testTownPrototypeStatic.mjs` (rewritten) | 51 | PASS |
| `scripts/testBundleBudget.mjs` | 10 | PASS (TownScreen chunk 11.9KB gzip, budget 15KB — no lazy-loading needed) |
| `tests/e2e/townV1.spec.mjs` (via scratch runner, `npm run preview --port 4191 --strictPort`) | 480 | **PASS, 0 unmocked requests, 0 mock errors** (final confirmed run, matching the exact committed HEAD) |
| **Total** | **877** | **0 failures** |

Build: `npm run build` succeeded on every iteration (4 rebuilds across the
fix cycle); final `dist/assets/TownScreen-*.js` = 30.4KB raw / 11.9KB gzip
(budget 15KB gzip) — no lazy-loading of discovery content was needed.

The E2E spec was run via a scratch-only runner (`runTownE2E_agentB.mjs`,
outside this worktree in the shared scratchpad directory, not committed —
imports `tests/e2e/townV1.spec.mjs`'s exported `run(browser, baseURL)` and
closes the browser after) against `vite preview --port 4191 --strictPort`.
No copy/text was changed to make the spec pass — both fixes were structural
(CSS/DOM), and the spec file itself was not touched.

### Previews (Phase 2)

Generated with a scratch-only script (`shootTownPreviews.mjs`, same
location convention as the E2E runner, not committed) using
`tests/e2e/lib/mockRoutes.mjs` for the base mocks (login/textbook/etc.) plus
a small `page.route` override layered on top of only the three Town-shop
`api/grant-xp` actions, purely so the fixture student starts pre-owning a
few items (level 8, $340, owned includes `tree`/`bench`/`red-post-box`/
`book-shop`) instead of scripting a full purchase flow — this does not
change the mocked response shape/contract, only the values, and is not part
of the committed `mockRoutes.mjs`. `localStorage.paulEasyVoca_features =
{"paulTownV1":true}` was set via `addInitScript`, matching the coordinator's
instruction.

| File | Size | Contents |
|---|---|---|
| `docs/design/town/previews/town_360x640.png` | 67.6KB | 360×640 — wooden-sign header + guide card, ambient ground tint, `tree`/`red-post-box` placed |
| `docs/design/town/previews/town_768x1024.png` | 189.1KB | 768×1024 — same, wider layout, `book-shop` also placed, ambient tint bands + depth shading clearly visible |
| `docs/design/town/previews/town_1280x800.png` | 290.2KB | 1280×800 — desktop |
| `docs/design/town/previews/town_200pct_zoom.png` | 176.5KB | 720×1280 viewport, `document.documentElement.style.zoom='2'` — confirmed no horizontal overflow |
| `docs/design/town/previews/town_discovery_card_open.png` | 78.2KB | 360×640 — `빨간 우체통`(red-post-box, leftmost column) tapped open, discovery card visible inside the existing action sheet, edge-alignment keeps it fully on-screen |

All 5 files are under the 300KB requirement. `docs/design/town/previews/README.md`
lists them with the same descriptions. IP re-scan (`scripts/testTownDiscovery.mjs`
§7) still reports 0 occurrences of all 15 forbidden terms across every `.md`/
`.json` file in `docs/design/town/` plus `townDiscovery.js` — re-run after
every Phase 2 doc edit, last confirmed at 69/69 PASS.

### Owner decisions updated

`docs/design/town/OWNER_DECISIONS.md` §3 (prototype wiring timing) and §5
(screenshot omission) are now marked RESOLVED with a dated Phase 2 addendum
(original Phase 1 text left intact, append-only). §1 (next-level preview),
§2 (guide-copy wiring into `townMessages.js`), and §4 (proposed catalog
items) remain open — Phase 2 did not touch `TownHeader.jsx`, `townMessages.js`,
or the catalog/SQL, so those decisions are unaffected.

### Commits (Phase 2, all local on `design/paul-town-british-world-2026-09-12`)

```
2334c06 chore(town): pass studentId prop to TownScreen (plumbing)
5c9e9ec feat(town): wire safe prototype inside TownScreen tree (initial wiring, had 2 bugs below)
84e8e71 fix(town): resolve E2E regressions from Phase 2 wiring in TownGrid.jsx
dcc01fd docs(town): Phase 2 previews
7fcb2de docs(town): mark OWNER_DECISIONS #3/#5 resolved
```

### Final state confirmation (Phase 2)

- `git status --short`: clean (verified after every commit and at session end).
- `C:\voca` never touched.
- No `git push`, no destructive git operations, no SQL/DB changes, no env
  changes.
- `npm ci` was run once in Phase 1 to materialize `node_modules/` from the
  existing lockfile (worktree had none) — no `package.json` changes, no new
  dependencies added in either phase.
- `paulTownV1` still defaults to `false` in `src/config/features.js`
  (untouched) — the wiring only takes effect for students/sessions that
  explicitly opt in via that flag, exactly as before.
