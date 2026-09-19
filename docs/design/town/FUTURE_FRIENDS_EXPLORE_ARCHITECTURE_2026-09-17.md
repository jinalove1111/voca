# Paul Town — FUTURE Friends' Town & Explore: architecture notes (2026-09-17)

DESIGN ONLY. Nothing here is implemented. No migration, no RPC, no SQL, no
economy change. These notes exist so the V2 world renderer being prepared
tonight does not paint itself into a corner.

## A. Friends' Town (친구 마을) — read-only visit

### Flow
student → bottom-nav 친구 마을 → list of permitted classmates → tap → read-only
render of that classmate's town → 돌아가기 (back to own town).

### Invariants (must hold by construction, not by UI hiding)
Visitor can NEVER: move, store, delete, buy, spend the owner's Paul Dollars,
change the owner's layout or any owner data, trigger welcome/claim, or see
private fields (PIN, health, notes).

### Minimal future architecture
1. **Permission scope = same class.** Reuse the existing `student_class_assignments`
   table (already the source for class membership). A visit is allowed iff the
   viewer and the target share an active `class_id`. No new table is needed for
   permissions; a per-student opt-out flag (`town_visible_to_class`) would be
   the only schema addition, and it is OPTIONAL and deferred.
2. **Server-authorized read.** One SECURITY DEFINER, SELECT-only RPC
   `get_town_shop_state_readonly(p_target_student_id)` that derives the VIEWER
   from the session token exactly like `api/grant-xp.js` does today (never
   from the request body), checks the shared-class rule, and returns only:
   `{ starsEarned, level, owned[], placements[] , gardenPoints }`. No dollars
   balance, no ledger, no PIN/health fields. Rate-limited like existing RPCs.
3. **Client mode prop.** `TownScreenV2` already owns all mutations; introduce
   `mode: 'owner' | 'visitor'`. In visitor mode: Shop and Inventory sheets are
   not mounted at all; `TownObjectLayer` renders placements with the
   tap-to-open popover disabled; `TownPlacementOverlay` never mounts; the HUD
   shows the owner's name + level + a "구경 중" chip and hides the $ chip; the
   mutation callbacks passed to `TownScene` are `null`. The world renderer
   (geometry, layers, assets) is reused 100 % — visitor mode is a data source
   swap plus disabled handlers, not a second renderer.
4. **Static contract test to add later:** visitor-mode `TownScreenV2` must not
   reference `placeTownItem/moveTownItem/storeTownItem/purchase/claimWelcome`
   in its visitor branch (extend the existing "5 mutation entry points" test).
5. **Persistence untouched:** placements stay in the owner's record; the
   visitor session writes nothing (the RPC is SELECT-only).

### Explicitly out of scope
Likes/comments, gifting, stealing/destructive interaction, cross-class
discovery, public towns.

## B. Explore (탐험하기) — exit only, souvenirs later

### Visual/navigation contract (kept by the V2 world)
The "To the Sea →" sign at (80,92) and the bottom-nav slot are the only
entrance; both are inert until Explore exists. The sea branch of the lane
leaves the screen at (100,96) so a future scene can attach without moving
any landmark.

### How future exploration rewards return WITHOUT a second currency
- Exploration yields **souvenirs**, which are ordinary catalog items with
  `priceCurrency: 'none'` (or price 0 + `acquire: 'explore'`) — i.e. they
  enter the SAME `owned[]`/inventory/placement pipeline as purchased
  decorations. No new balance, no new ledger, no XP/star/Paul-Dollar change.
- Granting a souvenir = the existing ownership write path (server-side, same
  RPC family as purchase, price 0), so persistence, inventory badges, place/
  move/store and V1 compatibility work unchanged.
- Souvenirs occupy the 47 cells like any decoration (object class
  `decoration`); collision rules apply.
- Stars/XP stay tied to learning only; Explore must not mint Paul Dollars.

### Explicitly out of scope
Explore gameplay, maps, timers, streak pressure, any grind mechanic.
