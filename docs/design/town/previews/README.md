# Paul Town British World — Phase 2 Previews (2026-09-12)

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
| `town_360x640.png` | 360×640 (mobile) | Town tab — wooden-sign header (⭐Lv/💵) + wooden-sign Paul guide card + ambient ground tint across the 8×6 grid, `tree`/`red-post-box` placed |
| `town_768x1024.png` | 768×1024 (tablet) | Same Town tab, wider layout — ambient tint bands and depth shading (top rows lighter, bottom rows normal) clearly visible across the full grid, `book-shop` also placed |
| `town_1280x800.png` | 1280×800 (desktop) | Same Town tab at desktop width |
| `town_200pct_zoom.png` | 720×1280 viewport, `document.documentElement.style.zoom = '2'` (CSS 200%) | Confirms no horizontal overflow / no broken layout at 200% zoom |
| `town_discovery_card_open.png` | 360×640 | Placed `빨간 우체통`(red-post-box, one of the 6 discovery-mapped items) tapped open — shows the existing 이동/보관 action sheet with the `TownDiscoveryCard` line rendered inside it (no new modal), edge-aware alignment keeps it fully on-screen even though the item sits in the leftmost column |

## Notes

- All PNGs are viewport screenshots (not full-page) and are each well under
  the 300KB requirement (largest is `town_1280x800.png` at ~290KB).
- `TownHeader.jsx` itself was not modified — the wooden-sign look comes
  entirely from `TownWoodenSignHeader` wrapping it in `TownScreen.jsx`
  (data props/PD/level display semantics unchanged, verified by
  `scripts/testTownPrototypeStatic.mjs`).
- The ambient ground tint (`src/utils/town/townAmbient.js`) and per-row
  depth shading are deterministic (`(x+y) % 3` and row-band opacity) —
  reloading the same layout always produces the same pattern.
- These files (and this README) are the actual deliverable; the scratch
  scripts used to generate them (`shootTownPreviews.mjs`,
  `runTownE2E_agentB.mjs`) live outside this worktree in the shared
  scratchpad directory and are not part of this repo.
