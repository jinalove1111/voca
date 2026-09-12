# Paul Town British World — Previews (2026-09-12, updated Phase 3)

Screenshots of the safe prototype (`TownWoodenSignHeader` + `townAmbient`
ground/depth tint + `TownDiscoveryCard`) wired live inside `TownScreen`
(flag `paulTownV1`, only mounted when ON — flag stays `false` by default in
`src/config/features.js`, unchanged by this session).

Captured with `npm run preview -- --port 4191 --strictPort` + the fixture
student (`tests/e2e/fixtures/index.mjs`) + `tests/e2e/lib/mockRoutes.mjs`
base mocks, with a scratch-only override on the three `api/grant-xp` Town
actions (`get_town_shop_state`/`purchase_town_item`/`claim_town_welcome`) to
put the fixture student at level 8 with a few items pre-owned — this is a
screenshot convenience only (the mocked economy shape/contract is unchanged;
see `AGENT_B_REPORT.md` Phase 2 section for the exact script). No production
data, no real network calls (0 unmocked requests, confirmed by the same run
that produced 480/480 `tests/e2e/townV1.spec.mjs` assertions passing).

## Files

| File | Viewport | What it shows |
|---|---|---|
| `town_360x640.png` | 360×640 (mobile) | Town tab — wooden-sign header (⭐Lv/💵) + wooden-sign Paul guide card + ambient ground tint across the 8×6 grid, `tree`/`red-post-box` placed. **Phase 3**: header now wraps onto 2 rows below the `sm:` (640px) breakpoint — row 1 is the ⭐Lv chip + 💵 chip/caption, row 2 is the full-width progress bar + "다음 레벨까지 ⭐N" line, which no longer truncates to "…" |
| `town_768x1024.png` | 768×1024 (tablet) | Same Town tab, wider layout — ambient tint bands and depth shading (top rows lighter, bottom rows normal) clearly visible across the full grid, `book-shop` also placed. Header stays single-row here (≥640px), pixel-identical to before Phase 3 |
| `town_1280x800.png` | 1280×800 (desktop) | Same Town tab at desktop width, single-row header (unchanged by Phase 3) |
| `town_200pct_zoom.png` | 720×1280 viewport, `document.documentElement.style.zoom = '2'` (CSS 200%) | Confirms no horizontal overflow / no broken layout at 200% zoom. 720px is above the `sm:` breakpoint so the header renders single-row here too — the 2-row wrap only applies below 640px (i.e. real phones at 100% zoom, not this 200%-zoom proxy viewport) |
| `town_discovery_card_open.png` | 360×640 | Placed `빨간 우체통`(red-post-box, one of the 6 discovery-mapped items) tapped open — shows the existing 이동/보관 action sheet with the `TownDiscoveryCard` line rendered inside it (no new modal), edge-aware alignment keeps it fully on-screen even though the item sits in the leftmost column. Also picks up the Phase 3 header fix (same 360px width) |

## Notes

- All PNGs are viewport screenshots (not full-page) and are each well under
  the 300KB requirement (largest is `town_1280x800.png` at ~290KB).
- **Phase 3 (2026-09-12)**: `TownHeader.jsx` was modified to fix a real bug
  found in `town_360x640.png` — the "다음 레벨까지 ⭐N" text was truncated to
  an ellipsis at 360px width (UX_FLOW.md 3-second rule #4 violation). Fixed
  with `flex-wrap` + `order-*`/`sm:order-none` classes only (no new DOM, no
  data/prop changes) — below the `sm:` (640px) breakpoint the header wraps
  onto 2 rows so the text always gets the full card width; at ≥640px it's
  pixel-identical to Phase 2 (confirmed: `town_768x1024.png`/
  `town_1280x800.png` are byte-unchanged by this fix). The wooden-sign look
  is still entirely `TownWoodenSignHeader` wrapping `TownHeader` from
  `TownScreen.jsx` — `TownHeader`'s data props/PD/level display semantics
  are unchanged, verified by `scripts/testTownPrototypeStatic.mjs` and
  `scripts/testTownUiStatic.mjs` (95/95, including the caption assertions).
- The ambient ground tint (`src/utils/town/townAmbient.js`) and per-row
  depth shading are deterministic (`(x+y) % 3` and row-band opacity) —
  reloading the same layout always produces the same pattern.
- These files (and this README) are the actual deliverable; the scratch
  scripts used to generate them (`shootTownPreviews.mjs`,
  `runTownE2E_agentB.mjs`) live outside this worktree in the shared
  scratchpad directory and are not part of this repo.
