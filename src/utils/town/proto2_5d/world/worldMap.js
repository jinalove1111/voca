// 2026-10-10(244차) Paul Town 하이브리드 2.5D 월드 — 순수 데이터. React/이미지/저장소 없음, 결정론.
// 좌표계: 월드 단위(Paul 키 = 12), y는 아래(남쪽)로 증가. 오브젝트 앵커 = 바닥 중앙.
// 발자국 foot {w,d} = 앵커 x 중심 너비 w, y-d..y 구간(sceneFixture 규약과 동일).
// h = 화면상 높이(월드 단위), 너비는 키트 manifest 가로세로비로 결정(이 모듈은 manifest를 모른다).
export const WORLD_W = 320
export const WORLD_H = 240
export const PAUL_H = 12

export const ZONES = [
  { id: 'plaza', nameKo: '중앙 광장', subject: 'Presentation', status: 'ready', rect: { x: 105, y: 60, w: 110, h: 90 }, entrance: { x: 160, y: 122 }, ground: 'paving' },
  { id: 'park', nameKo: '공원', subject: 'Grammar', status: 'ready', rect: { x: 0, y: 60, w: 105, h: 120 }, entrance: { x: 94, y: 112 }, ground: 'grass' },
  { id: 'school', nameKo: '학교', subject: 'Writing', status: 'ready', rect: { x: 215, y: 60, w: 105, h: 120 }, entrance: { x: 236, y: 112 }, ground: 'yard' },
  { id: 'market', nameKo: '시장 거리', subject: 'Speaking', status: 'soon', rect: { x: 0, y: 0, w: 320, h: 60 }, entrance: null, ground: 'street' },
  { id: 'home', nameKo: '집과 정원', subject: 'Conversation', status: 'soon', rect: { x: 0, y: 180, w: 105, h: 60 }, entrance: null, ground: 'garden' },
  { id: 'pond', nameKo: '연못과 강', subject: 'Reading', status: 'soon', rect: { x: 105, y: 150, w: 110, h: 90 }, entrance: null, ground: 'water' },
  { id: 'hill', nameKo: '언덕과 농장', subject: 'Voca', status: 'soon', rect: { x: 215, y: 180, w: 105, h: 60 }, entrance: null, ground: 'farm' },
]

export const SPAWN = { x: 160, y: 122 }

// art -> 크기 클래스. 범위는 CLASS_H(계약 표)와 testTownWorld가 대조한다.
export const CLASS_H = {
  large: [30, 36], shop: [26, 30], structure: [18, 24], tree: [18, 22],
  sign: [10, 14], prop: [5, 9], pot: [4, 6], cookie: [5, 5],
}
const CLS = {
  large: ['buildings/town-hall', 'buildings/school', 'buildings/museum', 'buildings/fire-station', 'buildings/clock-tower'],
  shop: ['buildings/aquarium-shop', 'buildings/art-shop', 'buildings/bakery', 'buildings/bell-shop', 'buildings/bike-shop', 'buildings/bookshop', 'buildings/cafe',
    'buildings/china-shop', 'buildings/clinic', 'buildings/flower-shop', 'buildings/fruit-shop', 'buildings/gift-shop', 'buildings/greengrocer', 'buildings/ice-cream-stall',
    'buildings/music-shop', 'buildings/pet-shop', 'buildings/potion-shop', 'buildings/tailor-shop', 'buildings/toy-shop', 'buildings/my-cottage', 'buildings/cottage-large',
    'buildings/cottage-clock', 'buildings/greenhouse', 'buildings/barn', 'buildings/stable', 'buildings/windmill', 'buildings/observatory', 'buildings/lighthouse', 'buildings/boathouse'],
  structure: ['buildings/gazebo', 'buildings/reading-pavilion', 'buildings/treehouse', 'buildings/bus-stop', 'buildings/ticket-booth', 'buildings/castle-gate',
    'buildings/train-engine', 'props/fountain', 'props/rose-arch', 'props/sailboat'],
  tree: ['nature/tree'],
  sign: ['props/signpost', 'props/street-lamp', 'props/street-clock', 'props/phone-box', 'props/post-box', 'props/wall-fountain', 'props/swing', 'props/balloons', 'props/birdhouse'],
  prop: ['nature/hedge', 'props/bench', 'props/picnic-table', 'props/tent', 'props/dog-house', 'props/bird-bath', 'props/sundial', 'props/bollard', 'props/fence',
    'props/garden-gate', 'props/stepping-stones', 'props/litter-bin', 'props/bike-rack', 'props/flower-cart', 'props/recycling-bin', 'props/stone-bridge', 'props/tool-rack',
    'props/beehive', 'props/water-barrel', 'props/compost-box', 'props/flower-wheelbarrow', 'props/stile'],
  pot: ['props/flower-urn', 'props/sunflower-pot', 'props/strawberry-pot', 'props/vegetable-bed', 'props/watering-can', 'props/gift-box', 'props/stone-steps'],
  cookie: ['character/cookie-sit', 'character/cookie-stand'],
}
export const ART_CLASS = Object.freeze(Object.fromEntries(Object.entries(CLS).flatMap(([c, l]) => l.map((a) => [a, c]))))

const o = (id, zone, art, x, y, h, foot) => ({ id, zone, art, x, y, h, solid: !!foot, ...(foot ? { foot } : {}) })
const F = (w, d) => ({ w, d })

const plaza = [
  o('plaza-town-hall', 'plaza', 'buildings/town-hall', 142, 86, 32, F(28, 6)),
  o('plaza-clock-tower', 'plaza', 'buildings/clock-tower', 176, 86, 30, F(8, 4)),
  o('plaza-fountain', 'plaza', 'props/fountain', 160, 110, 18, F(14, 6)),
  o('plaza-castle-gate', 'plaza', 'buildings/castle-gate', 160, 150, 24, F(22, 3)),
  o('plaza-post-box', 'plaza', 'props/post-box', 116, 104, 10, F(3, 2)),
  o('plaza-phone-box', 'plaza', 'props/phone-box', 116, 121, 12, F(4, 2.5)),
  o('plaza-sundial', 'plaza', 'props/sundial', 200, 100, 8, F(3, 2)),
  o('plaza-street-clock', 'plaza', 'props/street-clock', 204, 124, 13, F(2.5, 1.5)),
  o('plaza-wall-fountain', 'plaza', 'props/wall-fountain', 204, 80, 12, F(9, 3)),
  o('plaza-lamp-nw', 'plaza', 'props/street-lamp', 124, 93, 14, F(2, 1.5)),
  o('plaza-lamp-ne', 'plaza', 'props/street-lamp', 196, 93, 14, F(2, 1.5)),
  o('plaza-lamp-sw', 'plaza', 'props/street-lamp', 124, 127, 14, F(2, 1.5)),
  o('plaza-lamp-se', 'plaza', 'props/street-lamp', 196, 127, 14, F(2, 1.5)),
  ...[[136, 141], [148, 141], [172, 141], [184, 141], [114, 140], [206, 140]].map(([x, y], i) => o(`plaza-bollard-${i + 1}`, 'plaza', 'props/bollard', x, y, 6, F(1.6, 1.2))),
]

const park = [
  o('park-signpost', 'park', 'props/signpost', 88, 106, 12, F(3, 2)),
  o('park-rose-arch', 'park', 'props/rose-arch', 103, 112, 18),
  o('park-dog-house', 'park', 'props/dog-house', 74, 100, 9, F(8, 3)),
  o('park-cookie', 'park', 'character/cookie-sit', 80, 103, 5),
  o('park-treehouse', 'park', 'buildings/treehouse', 20, 86, 24, F(18, 6)),
  o('park-gazebo', 'park', 'buildings/gazebo', 52, 86, 20, F(13, 5)),
  o('park-reading-pavilion', 'park', 'buildings/reading-pavilion', 84, 80, 20, F(15, 5)),
  ...[[36, 72], [66, 72], [100, 78], [8, 130], [98, 160], [30, 166]].map(([x, y], i) => o(`park-tree-${i + 1}`, 'park', 'nature/tree', x, y, 20, F(4, 3))),
  ...[[99, 106], [99, 120], [99, 132]].map(([x, y], i) => o(`park-hedge-${i + 1}`, 'park', 'nature/hedge', x, y, 8, F(10, 3))),
  o('park-bench-1', 'park', 'props/bench', 64, 118, 7, F(6, 2)),
  o('park-bench-2', 'park', 'props/bench', 42, 132, 7, F(6, 2)),
  o('park-picnic-table', 'park', 'props/picnic-table', 24, 152, 8, F(10, 3)),
  o('park-swing', 'park', 'props/swing', 30, 134, 14, F(12, 3)),
  o('park-tent', 'park', 'props/tent', 12, 144, 9, F(9, 3)),
  o('park-balloons', 'park', 'props/balloons', 70, 148, 11, F(2, 1)),
  o('park-bird-bath', 'park', 'props/bird-bath', 76, 128, 7, F(4, 3)),
  o('park-birdhouse', 'park', 'props/birdhouse', 14, 108, 10, F(2, 1.5)),
  o('park-urn-1', 'park', 'props/flower-urn', 91, 108, 6, F(4, 2)),
  o('park-urn-2', 'park', 'props/flower-urn', 91, 118, 6, F(4, 2)),
  o('park-pot-1', 'park', 'props/sunflower-pot', 34, 117, 6, F(3, 1.5)),
  o('park-pot-2', 'park', 'props/sunflower-pot', 70, 117, 6, F(3, 1.5)),
  o('park-pot-3', 'park', 'props/sunflower-pot', 12, 117, 6, F(3, 1.5)),
  o('park-stepping-stones', 'park', 'props/stepping-stones', 52, 152, 5),
]

// 학교 마당 울타리: 서쪽 변(정원문 틈 y 108.5..115.5) + 남쪽 변(허브 길 틈 x 260..276). 조각 간격 = 폭 6.8.
const FW = 6.8
const fence = []
for (const y of [108.5, 101.7, 94.9, 122.3, 129.1, 135.9, 142.7, 149.5]) fence.push(o(`school-fence-w${fence.length + 1}`, 'school', 'props/fence', 232, y, 6, F(1.2, FW)))
for (let x = 236, i = 1; x < 312; x += FW) {
  if (x + FW / 2 > 260 && x - FW / 2 < 276) continue
  fence.push(o(`school-fence-s${i++}`, 'school', 'props/fence', Math.round(x * 10) / 10, 150, 6, F(FW, 1.2)))
}
const school = [
  o('school-building', 'school', 'buildings/school', 268, 90, 34, F(32, 7)),
  o('school-bus-stop', 'school', 'buildings/bus-stop', 223, 96, 20, F(16, 4)),
  o('school-bike-rack', 'school', 'props/bike-rack', 224, 126, 6, F(7, 2)),
  o('school-garden-gate', 'school', 'props/garden-gate', 232, 112, 9),
  o('school-litter-bin', 'school', 'props/litter-bin', 238, 121, 7, F(3, 2)),
  o('school-bench', 'school', 'props/bench', 250, 121, 7, F(6, 2)),
  o('school-lamp', 'school', 'props/street-lamp', 238, 107, 14, F(2, 1.5)),
  o('school-tree-1', 'school', 'nature/tree', 243, 99, 20, F(4, 3)),
  o('school-tree-2', 'school', 'nature/tree', 296, 96, 20, F(4, 3)),
  o('school-tree-3', 'school', 'nature/tree', 302, 132, 20, F(4, 3)),
  ...fence,
]
export const OBJECTS = Object.freeze([...plaza, ...park, ...school])

export const PLACES = [
  { id: 'park-green', objectId: 'park-signpost', zone: 'park', nameKo: '공원 잔디밭', doKo: '공원에 무엇이 몇 개 있는지 말해요.', entrance: { x: 88, y: 112 },
    missions: [{ kind: 'grammar', unitId: 'g-easy-05' }, { kind: 'grammar', unitId: 'g-easy-04' }, { kind: 'grammar', unitId: 'g-int-04' }, { kind: 'grammar', unitId: 'g-mid-05' }] },
  { id: 'school-main', objectId: 'school-building', zone: 'school', nameKo: '학교', doKo: '교실에서 문장을 써 봐요.', entrance: { x: 268, y: 95 },
    missions: [{ kind: 'writing' }] },
  { id: 'plaza-hall', objectId: 'plaza-town-hall', zone: 'plaza', nameKo: '마을회관', doKo: '마을 사람들 앞에서 발표해요.', entrance: { x: 142, y: 91 },
    missions: [{ kind: 'course', courseId: 'presentation' }] },
]

export const PATHS = [
  { id: 'plaza-ring', width: 5, points: [{ x: 128, y: 96 }, { x: 192, y: 96 }, { x: 192, y: 122 }, { x: 128, y: 122 }, { x: 128, y: 96 }] },
  { id: 'hall-stub', width: 5, points: [{ x: 142, y: 91 }, { x: 142, y: 96 }] },
  { id: 'market-stub', width: 5, points: [{ x: 160, y: 96 }, { x: 160, y: 62 }] },
  { id: 'pond-stub', width: 5, points: [{ x: 192, y: 122 }, { x: 192, y: 146 }] },
  { id: 'park-main', width: 5, points: [{ x: 128, y: 112 }, { x: 14, y: 112 }] },
  { id: 'park-treehouse', width: 5, points: [{ x: 22, y: 112 }, { x: 22, y: 92 }] },
  { id: 'park-gazebo', width: 5, points: [{ x: 52, y: 112 }, { x: 52, y: 92 }] },
  { id: 'home-stub', width: 5, points: [{ x: 52, y: 112 }, { x: 52, y: 176 }] },
  { id: 'school-main', width: 5, points: [{ x: 192, y: 112 }, { x: 268, y: 112 }, { x: 268, y: 95 }] },
  { id: 'hill-stub', width: 5, points: [{ x: 268, y: 112 }, { x: 268, y: 176 }] },
]

// 준비 중 구역의 닫힌 문 — 공유 변 위, 발자국은 변에서 d만큼 이쪽(준비된 구역) 쪽. 길(stub)이 여기서 끝난다.
export const GATES = [
  { id: 'gate-market', zone: 'market', art: 'props/garden-gate', x: 160, y: 60, w: 10, d: 2, h: 9 },
  { id: 'gate-pond', zone: 'pond', art: 'props/garden-gate', x: 192, y: 150, w: 10, d: 2, h: 9 },
  { id: 'gate-home', zone: 'home', art: 'props/garden-gate', x: 52, y: 180, w: 10, d: 2, h: 9 },
  { id: 'gate-hill', zone: 'hill', art: 'props/garden-gate', x: 268, y: 180, w: 10, d: 2, h: 9 },
]

// 준비 중 구역의 계획 배치(프로토타입은 그리지 않음 — 미리보기/후속용). 전부 비-solid, 구역 통째로 막혀 있다.
const soon = []
const row = (zone, arts, y, x0, dx, h) => arts.forEach((art, i) => soon.push({ id: `${zone}-${art.split('/')[1]}`, zone, art, x: x0 + dx * i, y, h }))
const shopsBack = ['cafe', 'bakery', 'fruit-shop', 'bookshop', 'greengrocer', 'flower-shop', 'toy-shop', 'pet-shop', 'music-shop', 'art-shop', 'bike-shop']
const shopsFront = ['ice-cream-stall', 'clinic', 'bell-shop', 'tailor-shop', 'china-shop', 'gift-shop', 'potion-shop', 'aquarium-shop']
row('market', shopsBack.map((s) => `buildings/${s}`), 30, 16, 29, 27)
row('market', shopsFront.slice(0, 4).map((s) => `buildings/${s}`), 58, 32, 32, 27)
row('market', shopsFront.slice(4).map((s) => `buildings/${s}`), 58, 192, 32, 27)
soon.push({ id: 'market-flower-cart', zone: 'market', art: 'props/flower-cart', x: 148, y: 58, h: 9 }, { id: 'market-gift-box', zone: 'market', art: 'props/gift-box', x: 172, y: 58, h: 6 },
  { id: 'market-recycling-bin', zone: 'market', art: 'props/recycling-bin', x: 120, y: 58, h: 8 })
row('home', ['buildings/my-cottage', 'buildings/cottage-large', 'buildings/cottage-clock', 'buildings/greenhouse'], 208, 14, 26.5, 26)
row('home', ['props/flower-wheelbarrow', 'props/beehive', 'props/water-barrel', 'props/compost-box', 'props/tool-rack', 'props/watering-can', 'props/vegetable-bed', 'props/strawberry-pot'], 232, 10, 12, 6)
row('pond', ['buildings/ticket-booth'], 170, 128, 0, 20)
row('pond', ['buildings/train-engine'], 170, 180, 0, 20)
row('pond', ['props/stone-steps'], 188, 160, 0, 6)
row('pond', ['props/stone-bridge'], 204, 160, 0, 8)
row('pond', ['props/sailboat'], 226, 146, 0, 18)
row('pond', ['buildings/boathouse'], 214, 124, 0, 26)
row('pond', ['buildings/lighthouse'], 214, 198, 0, 28)
row('hill', ['buildings/windmill'], 204, 232, 0, 26)
row('hill', ['buildings/observatory'], 204, 304, 0, 26)
row('hill', ['buildings/barn'], 236, 256, 0, 26)
row('hill', ['buildings/stable'], 236, 292, 0, 26)
row('hill', ['props/stile'], 200, 270, 0, 5)
export const SOON_OBJECTS = Object.freeze(soon)

// 키트 target -> 소속(홈) 구역. 같은 art를 다른 구역에서 여러 번 배치(instance)할 수는 있다.
export const ZONE_PLAN = {
  plaza: ['buildings/town-hall', 'buildings/clock-tower', 'props/fountain', 'props/post-box', 'props/phone-box', 'props/sundial', 'props/wall-fountain', 'props/street-lamp',
    'props/street-clock', 'props/bollard', 'buildings/castle-gate', 'buildings/museum', 'buildings/fire-station'],
  park: ['props/signpost', 'buildings/gazebo', 'buildings/reading-pavilion', 'buildings/treehouse', 'nature/tree', 'nature/hedge', 'props/bench', 'props/picnic-table', 'props/swing',
    'props/rose-arch', 'props/flower-urn', 'props/sunflower-pot', 'props/bird-bath', 'props/birdhouse', 'props/stepping-stones', 'props/tent', 'props/balloons', 'props/dog-house',
    'character/cookie-sit', 'character/cookie-stand'],
  school: ['buildings/school', 'buildings/bus-stop', 'props/bike-rack', 'props/litter-bin', 'props/fence', 'props/garden-gate'],
  market: [...shopsBack, ...shopsFront].map((s) => `buildings/${s}`).concat(['props/flower-cart', 'props/gift-box', 'props/recycling-bin']),
  home: ['buildings/my-cottage', 'buildings/cottage-large', 'buildings/cottage-clock', 'buildings/greenhouse', 'props/flower-wheelbarrow', 'props/beehive', 'props/water-barrel',
    'props/compost-box', 'props/tool-rack', 'props/watering-can', 'props/vegetable-bed', 'props/strawberry-pot'],
  pond: ['buildings/ticket-booth', 'buildings/train-engine', 'props/stone-bridge', 'props/sailboat', 'buildings/boathouse', 'buildings/lighthouse', 'props/stone-steps'],
  hill: ['buildings/windmill', 'buildings/barn', 'buildings/stable', 'buildings/observatory', 'props/stile'],
}

export const EXCLUDED_ART = [
  { art: 'backgrounds/park-backdrop', reasonKo: '원근 배경 — 수업 화면 전용' },
  { art: 'backgrounds/plaza-topdown', reasonKo: '바닥 그림과 중복·시점 다름' },
  { art: 'props/treasure-chest', reasonKo: '보상 연출 후보 — 이번 범위 아님(보상 규칙 변경 없음)' },
  { art: 'props/star-trophy', reasonKo: '보상 연출 후보 — 이번 범위 아님(보상 규칙 변경 없음)' },
  { art: 'character/paul-portrait', reasonKo: '운영자 결정 대기' },
  { art: 'animals/squirrel', reasonKo: '운영자 결정 대기(화풍)' },
  { art: 'animals/rabbit', reasonKo: '운영자 결정 대기(화풍)' },
  { art: 'animals/fox', reasonKo: '운영자 결정 대기(화풍)' },
  { art: 'animals/duck', reasonKo: '운영자 결정 대기(화풍)' },
  { art: 'animals/owl', reasonKo: '운영자 결정 대기(화풍)' },
]

// 화면이 실제로 그리는 art(준비된 구역 오브젝트 + 문) — worldArt.js가 import할 목록.
export const activeArts = () => [...new Set([...OBJECTS.map((x) => x.art), ...GATES.map((g) => g.art)])].sort()

let cache = null
// 충돌 박스(AABB). 준비 안 된 구역은 통째로 하나의 박스.
export function solids() {
  if (cache) return cache
  const list = []
  for (const ob of OBJECTS) if (ob.solid) list.push({ id: ob.id, x0: ob.x - ob.foot.w / 2, x1: ob.x + ob.foot.w / 2, y0: ob.y - ob.foot.d, y1: ob.y })
  for (const g of GATES) list.push({ id: g.id, x0: g.x - g.w / 2, x1: g.x + g.w / 2, y0: g.y - g.d, y1: g.y })
  for (const z of ZONES) if (z.status === 'soon') list.push({ id: `zone-${z.id}`, x0: z.rect.x, x1: z.rect.x + z.rect.w, y0: z.rect.y, y1: z.rect.y + z.rect.h })
  cache = Object.freeze(list)
  return cache
}

export const pxPerUnit = (vw, vh) => {
  const v = Math.min(Number(vw), Number(vh)) / 60
  return Number.isFinite(v) ? Math.min(9, Math.max(5, v)) : 5
}
