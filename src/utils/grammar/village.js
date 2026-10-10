// 문법 마을(Grammar Village) 데이터 — 순수 모듈(React/이미지 import 없음). 2026-10-10 (243차).
// 좌표: district box 기준 퍼센트. x,y = 아트 하단 중앙(anchor), w = box 너비 대비 %. 높이는 아트 비율(manifest)에서 파생:
//   높이% = w * (h/w) * aspect  (aspect = box 너비/높이).  box는 최대 720px 컬럼 안의 같은 비율.
// bands: 바닥 띠(path/water) — y,h는 box 높이 대비 %, 전체 너비. backdrop은 box 전체를 덮는다(object-fit: cover, 가로 중앙·세로 위 정렬). ground는 backdrop 없는 구역의 바탕색.
// 그리기 순서: place+decor를 y(오름차순)로 정렬해 뒤→앞으로 쌓는다(앞쪽 = y 큰 것이 위).
// place = 탭 가능한 학습 장소(unitIds 있으면 미션 시작, 비어 있으면 soonKo만 보이는 '준비 중' 장소). decor = 장식(탭 불가, alt="").
// 커버리지 규칙: manifest의 모든 target이 place.art / decor.art / backdrop / VILLAGE_HELD 중 정확히 한 곳에 1번 나온다.
export const VILLAGE_DISTRICTS = [
  {
    id: 'park', nameKo: '공원', introKo: '공원에 있는 것을 세고, 할 수 있는 일을 말해요.',
    aspect: 0.7, ground: '#9ccb4e', backdrop: 'backgrounds/park-backdrop', bands: [],
    places: [
      { id: 'park-green', nameKo: '공원 잔디밭', art: 'props/signpost', doKo: '공원에 무엇이 몇 개 있는지 말해요.', unitIds: ['g-easy-05', 'g-easy-04', 'g-int-04', 'g-mid-05'], x: 50, y: 76, w: 18 },
    ],
    decor: [
      { art: 'buildings/gazebo', x: 17, y: 38, w: 26 },
      { art: 'buildings/reading-pavilion', x: 50, y: 38, w: 24 },
      { art: 'buildings/treehouse', x: 84, y: 38, w: 26 },
      { art: 'nature/tree', x: 10, y: 54, w: 18 },
      { art: 'props/birdhouse', x: 26, y: 54, w: 8 },
      { art: 'props/rose-arch', x: 46, y: 54, w: 13 },
      { art: 'props/bird-bath', x: 64, y: 54, w: 11 },
      { art: 'animals/owl', x: 78, y: 54, w: 9 },
      { art: 'nature/hedge', x: 92, y: 54, w: 14 },
      { art: 'props/tent', x: 14, y: 72, w: 19 },
      { art: 'props/picnic-table', x: 32, y: 72, w: 16 },
      { art: 'animals/fox', x: 68, y: 72, w: 10 },
      { art: 'props/swing', x: 85, y: 72, w: 20 },
      { art: 'animals/rabbit', x: 22, y: 86, w: 8 },
      { art: 'animals/squirrel', x: 34, y: 86, w: 9 },
      { art: 'props/stepping-stones', x: 50, y: 90, w: 16 },
      { art: 'animals/duck', x: 66, y: 86, w: 8 },
      { art: 'props/stile', x: 79, y: 88, w: 14 },
      { art: 'props/stone-steps', x: 93, y: 88, w: 12 },
      { art: 'props/bench', x: 15, y: 98, w: 18 },
      { art: 'character/cookie-sit', x: 29, y: 98, w: 11 },
      { art: 'props/dog-house', x: 41, y: 98, w: 10 },
      { art: 'props/flower-urn', x: 58, y: 98, w: 9 },
      { art: 'props/balloons', x: 70, y: 98, w: 8 },
      { art: 'character/cookie-stand', x: 85, y: 98, w: 10 },
    ],
  },
  {
    id: 'home', nameKo: '집과 정원', introKo: '집 안팎의 물건이 어디에 있는지 묻고 답해요.',
    aspect: 0.75, ground: '#a8d26a', backdrop: null, bands: [{ kind: 'path', y: 77, h: 8 }],
    places: [
      { id: 'my-cottage', nameKo: '우리 집', art: 'buildings/my-cottage', doKo: '집 안 물건이 어디 있는지, 식구가 무엇을 하는지 말해요.', unitIds: ['g-easy-02', 'g-int-02'], x: 50, y: 38, w: 32 },
      { id: 'cottage-garden', nameKo: '정원 있는 집', art: 'buildings/cottage-large', doKo: '마당의 고양이가 어디 있는지 말해요.', unitIds: ['g-int-06'], x: 30, y: 65, w: 32 },
    ],
    decor: [
      { art: 'buildings/cottage-clock', x: 17, y: 34, w: 27 },
      { art: 'buildings/greenhouse', x: 84, y: 34, w: 26 },
      { art: 'props/tool-rack', x: 66, y: 64, w: 12 },
      { art: 'props/beehive', x: 79, y: 64, w: 10 },
      { art: 'props/water-barrel', x: 91, y: 64, w: 11 },
      { art: 'props/garden-gate', x: 12, y: 84, w: 15 },
      { art: 'props/fence', x: 32, y: 84, w: 22 },
      { art: 'props/vegetable-bed', x: 62, y: 86, w: 20 },
      { art: 'props/compost-box', x: 85, y: 86, w: 12 },
      { art: 'props/flower-wheelbarrow', x: 16, y: 97, w: 15 },
      { art: 'props/watering-can', x: 33, y: 97, w: 11 },
      { art: 'props/strawberry-pot', x: 50, y: 97, w: 11 },
      { art: 'props/sunflower-pot', x: 66, y: 97, w: 10 },
    ],
  },
  {
    id: 'school', nameKo: '학교', introKo: '교실과 교문에서 부탁하고, 소개하고, 규칙을 말해요.',
    aspect: 1, ground: '#b6d98a', backdrop: null, bands: [{ kind: 'path', y: 58, h: 8 }],
    places: [
      { id: 'school', nameKo: '학교', art: 'buildings/school', doKo: '교실에서 부탁하고, 친구를 소개하고, 규칙을 말해요.', unitIds: ['g-easy-01', 'g-easy-03', 'g-adv-01', 'g-adv-05', 'g-mid-02', 'g-mid-03'], x: 50, y: 50, w: 34 },
    ],
    decor: [
      { art: 'buildings/bus-stop', x: 22, y: 90, w: 24 },
      { art: 'props/bike-rack', x: 52, y: 90, w: 16 },
      { art: 'props/street-clock', x: 90, y: 64, w: 8 },
      { art: 'props/litter-bin', x: 74, y: 90, w: 9 },
    ],
  },
  {
    id: 'market', nameKo: '시장 거리', introKo: '가게에서 좋아하는 것을 말하고, 묻고, 주문해요.',
    aspect: 0.5, ground: '#d9c9a0', backdrop: null, bands: [{ kind: 'path', y: 48, h: 16 }],
    places: [
      { id: 'cafe', nameKo: '카페', art: 'buildings/cafe', doKo: '카페에서 좋아하는 것을 묻고, 권하고 답해요.', unitIds: ['g-easy-07', 'g-int-08'], x: 13, y: 44, w: 22 },
      { id: 'bakery', nameKo: '빵집', art: 'buildings/bakery', doKo: '빵집에서 무엇을 좋아하는지 묻고 되물어요.', unitIds: ['g-int-03'], x: 37.5, y: 44, w: 22 },
      { id: 'fruit-shop', nameKo: '과일 가게', art: 'buildings/fruit-shop', doKo: '가게에서 좋아하는 과일을 말해요.', unitIds: ['g-easy-06'], x: 62.5, y: 44, w: 22 },
      { id: 'bookshop', nameKo: '서점', art: 'buildings/bookshop', doKo: '책을 가리키며 이것과 저것을 말해요.', unitIds: ['g-easy-08'], x: 87, y: 44, w: 22 },
      { id: 'ice-cream-stall', nameKo: '아이스크림 가게', art: 'buildings/ice-cream-stall', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 먹고 싶은 것 권하고 답하기', x: 13, y: 76, w: 22 },
      { id: 'flower-shop', nameKo: '꽃집', art: 'buildings/flower-shop', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 꽃을 가리키며 이것과 저것 말하기', x: 37.5, y: 76, w: 22 },
      { id: 'toy-shop', nameKo: '장난감 가게', art: 'buildings/toy-shop', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 장난감 빌려 달라고 부탁하기', x: 62.5, y: 76, w: 22 },
      { id: 'pet-shop', nameKo: '애완동물 가게', art: 'buildings/pet-shop', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 동물이 좋아하는 것 말하기', x: 87, y: 76, w: 22 },
      { id: 'music-shop', nameKo: '음악 가게', art: 'buildings/music-shop', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 악기를 할 수 있는지 묻고 답하기', x: 13, y: 91, w: 22 },
      { id: 'art-shop', nameKo: '미술 가게', art: 'buildings/art-shop', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 그림 그리는 모습을 지금 하는 일로 말하기', x: 37.5, y: 91, w: 22 },
      { id: 'bike-shop', nameKo: '자전거 가게', art: 'buildings/bike-shop', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 자전거를 탈 수 있는지 말하기', x: 62.5, y: 91, w: 22 },
      { id: 'greengrocer', nameKo: '채소 가게', art: 'buildings/greengrocer', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 채소를 세고 좋아하는 것 말하기', x: 87, y: 91, w: 22 },
      { id: 'clinic', nameKo: '병원', art: 'buildings/clinic', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 아플 때 해야 할 일 조언하기', x: 62.5, y: 29, w: 22 },
    ],
    decor: [
      { art: 'buildings/aquarium-shop', x: 13, y: 14, w: 22 },
      { art: 'buildings/gift-shop', x: 37.5, y: 14, w: 22 },
      { art: 'buildings/potion-shop', x: 62.5, y: 14, w: 22 },
      { art: 'buildings/bell-shop', x: 87, y: 14, w: 22 },
      { art: 'buildings/tailor-shop', x: 13, y: 29, w: 22 },
      { art: 'buildings/china-shop', x: 37.5, y: 29, w: 22 },
      { art: 'props/street-lamp', x: 50, y: 63, w: 8 },
      { art: 'props/bollard', x: 12, y: 62, w: 8 },
      { art: 'props/recycling-bin', x: 90, y: 62, w: 10 },
      { art: 'props/flower-cart', x: 30, y: 62, w: 18 },
      { art: 'props/gift-box', x: 70, y: 62, w: 10 },
    ],
  },
  {
    id: 'square', nameKo: '광장', introKo: '광장에서 시간과 마을 소식, 지금 하는 일을 말해요.',
    aspect: 0.75, ground: '#d6cfae', backdrop: null, bands: [{ kind: 'path', y: 60, h: 14 }],
    places: [
      { id: 'town-hall', nameKo: '마을회관', art: 'buildings/town-hall', doKo: '마을 소식을 읽고 일어난 일과 만약의 경우를 말해요.', unitIds: ['g-mid-06', 'g-high-02'], x: 50, y: 34, w: 32 },
      { id: 'clock-tower', nameKo: '시계탑', art: 'buildings/clock-tower', doKo: '시계탑 아래에서 어제, 오늘, 내일을 구분해 말해요.', unitIds: ['g-mid-01', 'g-high-01'], x: 16, y: 66, w: 16 },
      { id: 'fountain', nameKo: '분수', art: 'props/fountain', doKo: '광장에서 사람들이 지금 하는 일을 말해요.', unitIds: ['g-int-05'], x: 50, y: 72, w: 26 },
      { id: 'post-box', nameKo: '우체통', art: 'props/post-box', doKo: '전해 들은 말을 다른 사람에게 전해요.', unitIds: ['g-high-05'], x: 84, y: 68, w: 15 },
      { id: 'museum', nameKo: '박물관', art: 'buildings/museum', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 전시물 비교해서 설명하기', x: 16, y: 34, w: 28 },
      { id: 'fire-station', nameKo: '소방서', art: 'buildings/fire-station', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 안전 규칙 말하기 (must / have to)', x: 84, y: 34, w: 26 },
    ],
    decor: [
      { art: 'props/phone-box', x: 94, y: 90, w: 9 },
      { art: 'props/wall-fountain', x: 14, y: 90, w: 14 },
      { art: 'props/sundial', x: 38, y: 92, w: 11 },
      { art: 'buildings/castle-gate', x: 64, y: 98, w: 24 },
    ],
  },
  {
    id: 'station', nameKo: '역과 강', introKo: '가 본 곳과 다리 위에서 있었던 일을 말해요.',
    aspect: 0.75, ground: '#c8d8a0', backdrop: null, bands: [{ kind: 'water', y: 48, h: 22 }],
    places: [
      { id: 'station', nameKo: '기차역', art: 'buildings/ticket-booth', doKo: '가 본 곳과 해 본 일을 묻고 답해요.', unitIds: ['g-adv-06'], x: 22, y: 40, w: 24 },
      { id: 'stone-bridge', nameKo: '돌다리', art: 'props/stone-bridge', doKo: '집에 가는 길 다리 위에서 있었던 일을 말해요.', unitIds: ['g-high-06'], x: 50, y: 66, w: 34 },
    ],
    decor: [
      { art: 'buildings/train-engine', x: 72, y: 40, w: 34 },
      { art: 'props/sailboat', x: 84, y: 64, w: 14 },
      { art: 'buildings/boathouse', x: 20, y: 96, w: 28 },
      { art: 'buildings/lighthouse', x: 84, y: 96, w: 18 },
    ],
  },
  {
    id: 'hill', nameKo: '언덕과 농장', introKo: '언덕 위 농장과 별 보는 곳이에요. 곧 새 미션이 생겨요.',
    aspect: 0.75, ground: '#b5d27a', backdrop: null, bands: [],
    places: [
      { id: 'observatory', nameKo: '천문대', art: 'buildings/observatory', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 별을 보며 계획 말하기 (be going to)', x: 66, y: 36, w: 26 },
      { id: 'windmill', nameKo: '풍차', art: 'buildings/windmill', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 만들어지는 과정 말하기 (수동태)', x: 26, y: 54, w: 24 },
      { id: 'barn', nameKo: '헛간', art: 'buildings/barn', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 농장 동물을 세고 설명하기', x: 70, y: 72, w: 32 },
      { id: 'stable', nameKo: '마구간', art: 'buildings/stable', doKo: '', unitIds: [], soonKo: '미션 준비 중 — 동물이 어디 있는지 위치 말하기', x: 28, y: 92, w: 30 },
    ],
    decor: [],
  },
]

// 어느 장소에도 연결하지 않은 단원(장소가 장식이 되므로) — 마을 끝 '문법 노트' 목록에서 같은 덱을 연다.
export const VILLAGE_NO_PLACE_UNITS = [
  { unitId: 'g-int-01', reasonKo: '상자 속 물건 맞히기 게임이라 특정 장소가 필요 없어요.' },
  { unitId: 'g-int-07', reasonKo: '어제와 오늘의 시간 비교가 핵심이라 장소가 도움이 안 돼요.' },
  { unitId: 'g-adv-02', reasonKo: '크기·키 비교는 장소와 상관없어요.' },
  { unitId: 'g-adv-03', reasonKo: '이유와 결과는 어느 장소에서나 말할 수 있어요.' },
  { unitId: 'g-adv-04', reasonKo: 'when/if 문장은 날씨·상태가 핵심이라 장소를 쓰지 않아요.' },
  { unitId: 'g-mid-04', reasonKo: '사람이나 사물을 설명하는 문형이라 특정 장소가 필요 없어요.' },
  { unitId: 'g-high-03', reasonKo: '긴 문장 속 관계사 해석이라 장소가 힘이 없어요.' },
  { unitId: 'g-high-04', reasonKo: '현실과 반대되는 상상이라 실제 장소와 맞지 않아요.' },
]

// 지도에 일부러 올리지 않은 키트 이미지.
export const VILLAGE_HELD = [
  { art: 'props/treasure-chest', reasonKo: '보상 연출용 그림이라 운영자 결정 전까지 쓰지 않아요.' },
  { art: 'props/star-trophy', reasonKo: '보상 연출용 그림이라 운영자 결정 전까지 쓰지 않아요.' },
  { art: 'backgrounds/plaza-topdown', reasonKo: '지도 배경 후보이지만 용량이 예산을 넘어 보류했어요.' },
  { art: 'character/paul-portrait', reasonKo: '인물 사진풍이라 키트 변환에서 제외됐어요(운영자 확인 필요).' },
]

// 수업(덱/장면) 안에서 쓰는 그림. 공원/집 장식으로 지도에도 함께 나온다(허용된 중복 용도 — 지도에서는 1번만).
export const VILLAGE_LESSON_ART = ['character/cookie-sit', 'nature/tree', 'props/bench', 'props/sunflower-pot']

export const placeById = (id) => VILLAGE_DISTRICTS.flatMap((d) => d.places).find((p) => p.id === id) || null
export const districtOfPlace = (placeId) => VILLAGE_DISTRICTS.find((d) => d.places.some((p) => p.id === placeId)) || null
export const placeForUnit = (unitId) => VILLAGE_DISTRICTS.flatMap((d) => d.places).find((p) => p.unitIds.includes(unitId)) || null
// 마을 순서(지도 위에서 아래로, 장소 순) 뒤에 문법 노트 단원을 붙인 전체 34개 단원 순서.
export const villageUnitOrder = () => [
  ...VILLAGE_DISTRICTS.flatMap((d) => d.places.flatMap((p) => p.unitIds)),
  ...VILLAGE_NO_PLACE_UNITS.map((n) => n.unitId),
]
