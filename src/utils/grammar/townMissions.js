// 2026-10-10 폴타운 미션 — 마을 장소와 문법 단원을 잇는 순수 데이터(React·이미지·저장소 없음)
export const TOWN_MISSIONS = [
  { id: 'park', placeKo: '공원', unitId: 'g-easy-05', status: 'ready',
    titleKo: '공원 미션', introKo: '폴과 쿠키가 공원에 왔어요. 공원에 무엇이 있는지 영어로 말해 봐요.',
    grammarEn: 'There is / There are',
    goalKo: '공원에 있는 것의 개수를 There is / There are로 말하기' },
]
export const missionById = (id) => TOWN_MISSIONS.find((m) => m.id === id) || null
export const missionForUnit = (unitId) => TOWN_MISSIONS.find((m) => m.unitId === unitId) || null
export const readyMissions = () => TOWN_MISSIONS.filter((m) => m.status === 'ready')
