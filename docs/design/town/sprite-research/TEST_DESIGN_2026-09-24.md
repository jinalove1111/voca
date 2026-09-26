# Paul Town 2.5D -- Manifest-Driven Character Sprite: Test Design
2026-09-24 -- sprite-test-designer (read-only research, no repo files touched)

Scope: design (not implement) the test plan for replacing the emoji glyph
with a manifest-driven sprite renderer in ProtoCharacter.jsx, gated by a
new flag. This file incorporates three decisions confirmed by the team lead
after the initial verbal report:

1. A real flag paulTown2_5dSprite (default false, attachment category,
   with a FEATURE_DETAILS entry) gates whether Proto25DScreen.jsx ever
   constructs/passes a manifest object into ProtoCharacter. Flag tests
   are in scope.
2. A new pure function directionForMove(dx, dy) -> side/front/back will be
   added to characterManifest.js. The direction table test is designed
   against this exact name/signature.
3. Frame stepping is tested via the pure frameIndexAt(elapsedMs, fps,
   framesLength) approach only -- no fake-timer React hook unit test.

## 0. What already exists vs. what is new

The manifest-driven sprite adapter is already implemented and already
default-off, just not wired to a flag yet:

- src/utils/town/proto2_5d/characterManifest.js -- pure, no DOM/React
  import, validateCharacterManifest / resolveCharacterVisual /
  stateKeyForPhase. Covered today by scripts/testProto25dCharacterManifest.mjs
  (72 assertions, extra:false, registered at tests/harness/registry.mjs:355).
  REQUIRED_STATES = [idle, walk, sit] -- no front/back today.
- src/components/town/proto2_5d/ProtoCharacter.jsx:167-274,388-414 --
  sprite branch already renders an img with data-proto-character-sprite
  behind a manifest prop that defaults to undefined; onError already forces
  emoji fallback for the mount; the facing mirror (scaleX(-1)) is already
  isolated onto its own non-animated layer, separate from the bob
  keyframe-animation div and the anchor-offset div; per-frame
  footAnchorPx/seatAnchorPx selection already exists.
- No screen passes a manifest today (Proto25DScreen.jsx never constructs
  one) -- so the sprite path is presently dead code, exercised only by the
  unit suite above.

Genuinely new work this design covers:

- paulTown2_5dSprite flag (features.js) and its wiring into
  Proto25DScreen.jsx (which manifest object it passes, if any, when on).
- frameIndexAt(elapsedMs, fps, framesLength) -- pure export, replaces the
  untestable setInterval math inside useSpriteFrameIndex
  (ProtoCharacter.jsx:177-191).
- directionForMove(dx, dy) -- pure export, and the front/back states it
  selects do not exist in REQUIRED_STATES yet; they must become optional
  additions (not required) so existing/legacy manifests without them stay
  valid -- otherwise the Phase 6A VALID_MANIFEST fixture in the unit test
  would start failing validation.
- A data-proto-character-sprite-frame-index attribute (new, additive,
  sprite-only) so E2E can read frame state deterministically instead of by
  timing.

## 1. Summary table

| # | Behavior | File (extend/new) | Assertions (est.) | Gating | Flakiness avoidance |
|---|---|---|---|---|---|
| 1 | frameIndexAt pure function (deterministic frame stepping) | scripts/testProto25dCharacterManifest.mjs (extend) -- new export in characterManifest.js | 18 | extra:false | Pure math, no timers, no DOM |
| 2 | idle: frame frozen, correct state frame | tests/e2e/townProto25d.spec.mjs new S-sprite-1 | 4 | extra:false | Read data-proto-character-sprite-frame-index 3x at 200ms apart, assert unchanged |
| 3 | walking: frame index advances, deterministic | S-sprite-2 | 5 | extra:false | Poll the same attribute via existing waitUntil helper alongside data-character-phase==walking; assert >=2 distinct values before returning to idle -- no fixed sleep, no wall-clock threshold |
| 4 | directionForMove(dx,dy) -> side/front/back table | scripts/testProto25dCharacterManifest.mjs (extend) | 12 | extra:false | Pure input/output table + determinism + purity, no DOM |
| 5 | left/right mirror transform scoped correctly | extend S3/S4 (S-sprite-3) | 6 | extra:false | getComputedStyle().transform matrix read on 3 nested layers (bob / facing / anchor-offset), both facings, both emoji+sprite modes |
| 6 | reduced-motion: movement continues, bob/frame frozen | extend S5 | 4 | extra:false | Reuses existing emulateMedia({reducedMotion:reduce}) context; asserts style left/top change while frame-index attribute stays constant |
| 7 | foot anchor + shadow tracking, 4 viewports | extend S9 loop | 16 (4 viewports x 4 checks) | extra:false | Reuses waitForBoxStable + existing S9 360/390/412/1280 loop, no new context |
| 8 | bench seat anchor within 3px (sprite-mode parallel to the 3 ink checks) | S8/S9 -- see section 3 rewrite policy | 3 new (+3 existing kept, conditionalized) | extra:false | Deterministic anchor math from manifest seatAnchorPx projected the same way as item 7, no canvas measureText needed in sprite mode |
| 9 | leaving -> idle state machine unchanged | reuse existing S3/S8 assertions | 0 new | n/a | Byte-identical -- stateKeyForPhase already maps leaving to walk (characterManifest.js:121-125), already asserted at testProto25dCharacterManifest.mjs:157-158 |
| 10 | image load failure -> emoji fallback | new S-sprite-4 | 3 | extra:false | Route sprite URL to 404 via page.route, one scenario only, no per-viewport repeat |
| 11 | flag OFF (default) -> DOM identical to today | new S-flag-2 (parallel to existing S2) | 3 | extra:false | 3-sample persistence check, same pattern as current S2 (townProto25d.spec.mjs:302-332) |
| 12 | flag source default false | new S-flag-1 (parallel to existing S1) | 1 | extra:false | Source-regex read of features.js, same technique as current S1 (townProto25d.spec.mjs:290-300) |

Total new assertions planned: approximately 75 (18+4+5+12+6+4+16+3+0+3+3+1).
This is additive on top of the existing 72 (testProto25dCharacterManifest.mjs)
+ 88 (testProto25dBench.mjs) + 190 (townProto25d.spec.mjs E2E) already
gating in verify:all -- none of those existing counts should drop.

## 2. Detail per area

### 2.1 frameIndexAt -- deterministic frame stepping (item 1)

useSpriteFrameIndex (ProtoCharacter.jsx:177-191) currently drives frames
with a raw setInterval, which is untestable deterministically. Extract the
math into a new pure export in characterManifest.js:

  frameIndexAt(elapsedMs, fps, framesLength) // -> integer index

Test table (pure, no timers/DOM, folded into the existing unit suite next
to the Phase 6A block):

- elapsedMs=0 -> 0
- elapsedMs just under one frame period (1000/fps) -> 0
- elapsedMs exactly one period -> 1
- several periods -> wraps via modulo framesLength (mirrors the existing
  wraparound convention already in resolveCharacterVisual,
  characterManifest.js:153)
- fps<=0 or framesLength<=1 -> always 0
- negative/NaN elapsedMs, negative/NaN fps -> 0, no throw (matches this
  file header comment "never throw" convention)
- determinism: same inputs called twice -> identical output

Per decision (3), useSpriteFrameIndex itself is NOT unit-tested with fake
timers. Its correctness (that it actually calls frameIndexAt with a real
elapsed-time source on each tick) is covered end-to-end by items 2/3 below
via the new data-proto-character-sprite-frame-index attribute --
integration coverage, not hermetic hook coverage.

### 2.2 Idle frozen / walking advances (items 2-3, E2E)

Add data-proto-character-sprite-frame-index={spriteFrameIndex} to the
sprite img wrapper (new, additive, only rendered when isSprite) so E2E can
read frame state without timing races -- mirrors the existing
data-character-phase pattern.

- Idle: sample the attribute 3x at 200ms apart, assert all three equal.
- Walking: start a walk via the existing tap-to-move flow (S3 pattern),
  poll the attribute alongside data-character-phase==walking using the
  existing waitUntil helper, assert at least 2 distinct values observed
  before the phase returns to idle. No fixed sleep, no wall-clock
  threshold on frame count (walk duration is fixed at WALK_TRANSITION_MS
  = 650ms already, so this is bounded by the existing phase-transition
  wait, not a new timeout).

### 2.3 directionForMove(dx, dy) table (item 4)

Signature confirmed by the team lead: directionForMove(dx, dy) returns one
of side / front / back. Proposed tie-break rule for the implementer to
confirm (stated explicitly here since no such rule exists anywhere in the
codebase today -- only left/right facingToward on dx,
benchInteraction.js:386-407; dy is never inspected for direction anywhere
currently):

- abs(dx) >= abs(dy) (including the exact-tie case) -> side -- this
  preserves current behavior by construction, since all existing call
  sites only ever compute dx-based facing.
- abs(dy) > abs(dx) and dy < 0 (moving toward smaller y, i.e. away from the
  viewer/up-screen) -> back.
- abs(dy) > abs(dx) and dy > 0 (moving toward larger y, toward the viewer/
  down-screen) -> front.
- dx===0 and dy===0 -> side (neutral default, analogous to facingToward
  existing "zero vector returns 0, caller keeps prior facing" convention
  at benchInteraction.js).

Test table (pure, no DOM):

- 4 dominant-dx cases (positive/negative, large/small magnitude) -> side
- 2 dominant-dy-negative cases -> back
- 2 dominant-dy-positive cases -> front
- 1 exact-tie case (abs(dx)===abs(dy)) -> side
- 1 zero-vector case -> side
- determinism (same inputs twice -> identical output): 1
- purity (no throw on NaN/undefined inputs, safe fallback to side): 1

Total: 12. Also requires (implementer, not this design) that
validateCharacterManifest REQUIRED_STATES treat front/back as optional
additions on top of the existing required idle/walk/sit -- covered by
re-running the existing VALID_MANIFEST fixture (no front/back keys)
through validateCharacterManifest and asserting it is still ok:true
(regression guard, folds into the existing control-group section at
testProto25dCharacterManifest.mjs:140-168, not counted as a new assertion
since it reuses that section existing check).

### 2.4 Left/right mirror scope (item 5)

Existing code already puts scaleX(-1) only on the facing-only layer
(ProtoCharacter.jsx:389), separate from the bob-animation div and the
anchor-offset div -- already matches the constraint. Test: read
getComputedStyle().transform on three nested divs (bob div, facing div,
anchor-offset div) for facing=-1 vs facing=1, in both emoji and sprite
mode; assert the matrix a component is -1 only on the facing div, and 1
(untouched) on its parent (bob) and child (anchor-offset) at both facings.
Reuses the existing matrix-parsing helper (townProto25d.spec.mjs:219-228,
readCharacterScale), extended to also read the b component for a full
mirror check.

### 2.5 Reduced-motion (item 6)

Extend S5 (already the reduced-motion scenario) rather than adding a new
browser context: after a walk-triggering tap, assert left/top style values
change (position continues moving -- matches the existing
distSoonAfterTap<30 check at townProto25d.spec.mjs:649) while the new
sprite frame-index attribute stays constant across the same window, and
animationName stays none (existing check at lines 626/659 already covers
the bob animation for emoji mode; re-run for sprite mode).

### 2.6 Foot/shadow tracking across viewports (item 7)

Extend the existing S9 loop (360/390/412/1280, already iterating) rather
than adding a 5th scenario. For each viewport: compute the expected screen
point from leftPct/topPct plus spriteOffsetDx/Dy (already computed in
ProtoCharacter.jsx:272-273), and assert the rendered img foot-anchor pixel
(its getBoundingClientRect() bottom minus the known footAnchorPx offset)
is within 1px of that projection; assert the shadow
(data-proto-character-shadow) center tracks the same leftPct/topPct
(existing shadow logic already does this for emoji mode -- re-run the same
check when isSprite).

### 2.7 Bench seat anchor -- rewriting the 3 ink assertions (item 8)

The three r.check blocks at townProto25d.spec.mjs:1679-1693
(contactErrorPx<3, inkBottomScreenY>=seatY-1,
inkBottomScreenY<=benchBottom+1), plus their support code
(measureGlyphInkOnScreen, SEAT_CONTACT_FRACTION_REF), are canvas-glyph-
ink-specific and become meaningless once a sprite has a real seatAnchorPx
-- no glyph, no font metrics to measure.

Rewrite policy: keep + add, do not delete. Wrap the existing three checks
in an emoji-mode-only condition so the emoji fallback scenario (item 10,
the 404 case) still exercises the exact same ink-measurement contract
byte-for-byte, and add a parallel sprite-mode block (3 new assertions)
that asserts the same numeric contract (<3px error against benchArt
measured seat line) using different measurement: read the sprite img
getBoundingClientRect(), compute the contact pixel using seatAnchorPx
(from the manifest, projected the same way item 7 does) instead of canvas
measureText.

Keep unchanged (no rewrite, no wrapping needed -- these are box/z-index
checks, not glyph-ink checks, and already apply correctly to either mode):

- The two non-ink checks at townProto25d.spec.mjs:1652-1661 (boxAnchor-
  based "expected seat px" comparison).
- The z-index check at townProto25d.spec.mjs:1694-1697.

testProto25dBench.mjs "3c" section (seatSinkLocalPx, lines 193-305) is a
pure function for the emoji glyph-sink correction only -- stays
byte-identical. Sprite mode does not need sink correction because the
manifest seatAnchorPx is already the correct contact point by construction
(characterManifest.js:145 doc comment). No changes there.

### 2.8 Leaving -> idle (item 9)

No new test. stateKeyForPhase already maps leaving to walk
(characterManifest.js:121-125), and this is already asserted at
testProto25dCharacterManifest.mjs:157-158. Reuse S3 existing
walking->idle assertions and S8 existing sitting->leaving->idle timeline
assertions (townProto25d.spec.mjs:1119-1142) unchanged -- zero new
assertions, zero rewrites.

### 2.9 Image load failure -> emoji fallback (item 10)

One new scenario S-sprite-4: mount with the flag ON plus a minimal real
manifest fixture (construct inline in the spec, following the existing
VALID_MANIFEST shape from the unit test -- no such fixture exists in prod
code yet since no screen passes one today), route the sprite image URL to
a 404 via page.route matching the character-sheet asset path and fulfilling
status 404 (pattern already used repo-wide for asset mocking, see
mockRoutes.mjs), trigger the existing onError handler
(ProtoCharacter.jsx:404), then assert data-proto-character-glyph
reappears and data-proto-character-sprite is gone. Single scenario, not
repeated per viewport -- this is a code-path test, not a geometry test.

### 2.10 Flag tests (items 11-12)

Mirror the existing S1/S2 exactly, using the confirmed flag name
paulTown2_5dSprite:

- S-flag-1 reads features.js source via regex for
  "paulTown2_5dSprite: false" (same technique as the existing S1 at
  townProto25d.spec.mjs:290-300).
- S-flag-2 is a new browser context with the flag left at its default (no
  setDeviceFlags override) -- 3-sample persistence check (same pattern as
  existing S2, townProto25d.spec.mjs:302-332) asserting no
  data-proto-character-sprite node ever appears, i.e. DOM stays
  byte-identical to pre-change behavior even with paulTown2_5d (the parent
  town flag) ON.

Also required of the implementer (not a new test, a wiring constraint this
design assumes): Proto25DScreen.jsx must only ever construct/pass a
manifest object to ProtoCharacter when paulTown2_5dSprite is true -- when
false, manifest stays undefined exactly as today, so every existing
emoji-mode assertion in S1-S10 continues to hold with zero changes.

## 3. What must stay byte-identical (no rewrite)

- scripts/testProto25dCharacterManifest.mjs existing 72 assertions
  (manifest validation, emoji fallback rules, resolveCharacterVisual
  phase mapping) -- additive only.
- scripts/testProto25dBench.mjs sections 1-4b and 5 (all of it) -- sink
  correction and bench geometry are emoji/glyph-specific and unaffected by
  sprites.
- townProto25d.spec.mjs S1-S4, S6, S7, S8 (except the 3 ink checks per
  section 2.7), S8b, S8c, S10 -- all existing extra:false gating
  assertions; per TESTING.md recorded total (190 E2E assertions as of the
  173rd session) these must not regress in count or pass/fail.
- The two non-ink bench-seat checks at townProto25d.spec.mjs:1652-1661
  and 1694-1697.

## 4. Files referenced

- src/components/town/proto2_5d/ProtoCharacter.jsx -- sprite adapter,
  lines 167-274, 388-414 (existing); new frame-index data attribute (new).
- src/utils/town/proto2_5d/characterManifest.js -- pure contract
  (existing); needs frameIndexAt + directionForMove additions, and
  front/back made optional in REQUIRED_STATES handling.
- src/components/town/proto2_5d/Proto25DScreen.jsx -- never passes
  manifest today; would own the new flag gate and dx/dy-based direction
  computation.
- src/config/features.js -- line 113 "paulTown2_5d: false" is the naming/
  comment convention the new paulTown2_5dSprite flag should follow; line
  370 lists the attachment category array where it should be added.
- scripts/testProto25dCharacterManifest.mjs, scripts/testProto25dBench.mjs
  -- unit suites to extend.
- tests/e2e/townProto25d.spec.mjs -- S1-S10 sections referenced above,
  line numbers noted per item.
- tests/e2e/lib/mockRoutes.mjs -- route-mocking convention for the
  404-image scenario.
- tests/harness/registry.mjs:351-355 -- registration pattern, extra:false.
- TESTING.md:1498-1501, 1608-1637 -- current assertion-count ledger to
  update alongside any new suite/assertions from this design.
