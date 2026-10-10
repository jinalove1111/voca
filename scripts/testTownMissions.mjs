// 2026-10-10(241차) 폴타운 미션 — 순수 모듈 + App/문법 화면 소스 핀. 저장·네트워크 0.
import fs from 'node:fs'
import { TOWN_MISSIONS, missionById, missionForUnit, readyMissions } from '../src/utils/grammar/townMissions.js'
import { grammarUnitById } from '../src/utils/grammar/grammarUnits.js'
let fail = 0
const check = (n, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`); if (!ok) fail++ }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const mod = read('src/utils/grammar/townMissions.js'), app = read('src/App.jsx'), g = read('src/components/GrammarCourseScreen.jsx')

check('park 미션: g-easy-05 연결, ready, 단원 실재', missionById('park')?.unitId === 'g-easy-05' && missionForUnit('g-easy-05')?.id === 'park' && grammarUnitById('g-easy-05')?.status === 'ready' && readyMissions().length === TOWN_MISSIONS.length)
check('알 수 없는 id/단원은 null', missionById('x') === null && missionForUnit('x') === null)
check('모듈은 React·저장소·이미지 없음', !/import |localStorage|sessionStorage/.test(mod))
check('App: 세션 상태 + Proto25D 미션 props + QA 게이트 유지', /\[grammarEntry, setGrammarEntry\] = useState\(null\)/.test(app) && /missions=\{readyMissions\(\)\}/.test(app) && /completedMissionIds=\{completedMissionIds\}/.test(app) && /onStartMission=/.test(app) && /QA_ONLY_SCREENS = \['home', 'speaking', 'growth', 'proto25d', 'townWorld', 'unit', 'grammarCourses', 'grammarVillage'\]/.test(app))
check('App: 마을 진입이 pilotUnits를 로드하고 완료 id 중복 제거, 플래그 꺼짐이면 홈 폴백', /loadPilotUnits\(\)\.then\(\(r\) => setPilotUnits/.test(app) && /s\.includes\(id\) \? s :/.test(app) && /townReturn \? 'proto25d' : villageBack \? 'grammarVillage' : learningHome\(\)/.test(app) && /townReturn = .*paulTown2_5dEnabled/.test(app))
check('App: 로딩 실패 화면의 홈 버튼이 마을 진입 상태를 비움', /setGrammarEntry\(null\); setScreen\('home'\)/.test(app))
check('Grammar: props initialUnitId/returnTo/onMissionComplete', /initialUnitId = null, returnTo = null, placeId = null, homeLabel = '← 홈', onMissionComplete/.test(g) && /useState\(initialUnitId\)/.test(g))
for (const t of ['gd-mission-intro', 'gd-to-town', 'grammar-missions', 'grammar-mission-', 'gu-place-tag', 'data-return']) check(`Grammar testid ${t}`, g.includes(t))
check('Grammar: 마을 복귀 문구 + 기존 gu-back testid 유지', g.includes('← 마을') && g.includes('마을로 돌아가기') && g.includes('data-testid="gu-back"'))
check('Grammar: 요약 카드 도달 시 onMissionComplete 호출, 저장소 키 없음', /c\.kind === 'summary'[\s\S]{0,120}onMissionComplete/.test(g) && !/localStorage|sessionStorage/.test(g + mod))
process.exit(fail ? 1 : 0)
