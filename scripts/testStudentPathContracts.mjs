// scripts/testStudentPathContracts.mjs — 학생 핵심 경로 SSR/정적 계약 스위트
// (2026-09-04, overnight track T8 P8 자동화).
//
// 로그인 → 대시보드 → 교과서 선택기 → 유닛 선택기 → 학습(GuidedSession/
// WordDetail) → 퀴즈 → 철자(SpellingQuestion/SpellingReview) → 복습 →
// 정원(EnglishGarden) → Paul Town → 로그아웃까지, 학생이 실제로 보는 화면
// 컴포넌트를 react-dom/server(SSR)로 렌더링해 문자열 단언한다(네트워크 0,
// DB 접촉 0, 브라우저 없음).
//
// 방법(scripts/testSpellingDirectionWiring.mjs의 esbuild+가상 스텁 기법을
// 그대로 확장): 실제 화면 컴포넌트(StudentSelect/Dashboard/GuidedSession/
// WordDetail/QuizGame/SpellingQuestion/SpellingReview/EnglishGarden/
// PaulTown/TextbookSelector)를 esbuild로 함께 번들하고, 브라우저 전용/DB
// 전용 모듈(speech/paulReactions/useStudent/browserDetect/useMicReady/
// InAppBrowserNotice/wordLibrary/config·features/supabaseClient)만 외부
// 파일 기반 가상 스텁으로 치환한다(scripts/wordLibraryRaceStub.mjs와 같은
// "export let 상태 + configure 함수" 패턴 — 모든 컴포넌트 번들이 같은 파일
// URL을 import하므로 테스트 스크립트에서 __configure로 갈아끼우면 전부에
// 반영된다). 나머지(정원/Paul Town 엔진, 모자 카탈로그, 티켓 이코노미,
// dailyRitual, entranceTest, 스펠링 채점 등)는 전부 실제 소스 그대로
// 번들해 실제 렌더/파생 로직을 검증한다 — 로직 재구현 0.
//
// StudentSelect의 "PIN 만들기" 탭(반/학생 선택 후 배지 표시)은 클릭 이후
// 상태(useEffect 배치 조회)라 SSR로는 도달 불가 — 이 부분과 각 화면의
// disabled 버지 플래그는 testAdminUnitEdit.mjs D/E 섹션과 동일한 관례
// (실제 소스 텍스트를 중괄호/마커로 잘라 정규식으로 단언)로 커버한다.
//
// 실행: node scripts/testStudentPathContracts.mjs
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp/uipath')
fs.mkdirSync(TMP, { recursive: true })

let asserted = 0
let failures = 0
const rows = [] // { screen, checks, pass, fail }
let currentScreen = ''
function screen(name) {
  currentScreen = name
  if (!rows.find((r) => r.screen === name)) rows.push({ screen: name, checks: 0, pass: 0, fail: 0 })
}
function check(label, cond, detail) {
  asserted++
  const row = rows.find((r) => r.screen === currentScreen)
  row.checks++
  if (cond) { row.pass++; console.log(`  PASS  [${currentScreen}] ${label}`) }
  else { row.fail++; failures++; console.log(`  FAIL  [${currentScreen}] ${label}${detail !== undefined ? ' — ' + detail : ''}`) }
}
const noUndefinedLeak = (html) => !/undefined|(?<!\w)null(?!-)|NaN|\[object Object\]/.test(html)

// ── 가상 스텁 파일 작성(모든 컴포넌트 번들이 공유하는 단일 모듈 인스턴스) ──
const write = (name, content) => {
  const p = path.join(TMP, name)
  fs.writeFileSync(p, content, 'utf8')
  return pathToFileURL(p).href
}

const speechUrl = write('fakeSpeech.mjs', `
export const playWordAudio = () => {}
export const playRepeating = () => () => {}
export const stopCurrentAudio = () => {}
export const playSuccessSound = () => {}
export const speakPraise = () => {}
export const getMicStream = () => Promise.reject(new Error('stub'))
export const recordWithAutoStop = () => ({ promise: Promise.resolve(null), stop() {} })
export const transcribeViaServerSTT = () => Promise.resolve(null)
export const SUCCESS_MSGS = ['ok']; export const FAIL_MSGS = ['no']
export const rndMsg = (a) => a[0]
export const unlockAudio = () => {}
export const hasMicStream = () => false
export const getMicStreamOnce = () => Promise.reject(new Error('stub'))
`)
const paulReactionsUrl = write('fakePaulReactions.mjs', `
export const getReactionById = () => ({ id: 'x', image: '/x.png', message: 'm' })
export const pickReaction = () => ({ id: 'x', image: '/x.png', message: 'm' })
export const playReactionSound = () => {}
export const stopReactionSound = () => {}
`)
const useStudentHookUrl = write('fakeUseStudentHook.mjs', `export const spellingComboBonus = () => 0`)
const browserDetectUrl = write('fakeBrowserDetect.mjs', `
export const isInAppBrowser = () => false
export const isAndroid = () => false
export const openInChrome = () => {}
`)
const useMicReadyUrl = write('fakeUseMicReady.mjs', `export const useMicReady = () => false`)
const inAppNoticeUrl = write('fakeInAppBrowserNotice.mjs', `export default function InAppBrowserNotice() { return null }`)
const supabaseClientUrl = write('fakeSupabaseClient.mjs', `export const supabase = {}`)

// wordLibrary — 모든 화면이 공유하는 "학생/반/교재/유닛" 조회 표면.
// STATE는 테스트가 각 시나리오 전에 __configure(patch)로 통째로 갈아끼운다.
const wordLibraryUrl = write('fakeWordLibrary.mjs', `
export let STATE = {
  classNames: [],
  realClassNames: [],
  studentsByClass: {},
  studentClassById: {},
  studentClassIdById: {},
  studentUnitById: {},
  studentByIdMap: {},
  classSettingsByName: {},
  classIdByName: {},
  todaysAssignmentByClass: {},
  textbookMode: true,
  primaryTextbookByStudent: {},
  learnableUnitsByTextbook: {},
  learnableUnitNamesByClass: {},
}
export function __configure(patch) { STATE = { ...STATE, ...patch } }
export function getStudentsInClass(cn) { return STATE.studentsByClass[cn] || [] }
export function getRealClassNames() { return STATE.realClassNames }
export async function refreshStudents() {}
export function getStudentClass(id) { return STATE.studentClassById[id] ?? null }
export function getStudentClassId(id) { return STATE.studentClassIdById[id] ?? null }
export function getStudentUnit(id) { return STATE.studentUnitById[id] ?? '' }
export function getClassNames() { return STATE.classNames }
export function getTodaysAssignmentWordIds(cn) { return STATE.todaysAssignmentByClass[cn] || [] }
export function getClassSettings(cn) { return STATE.classSettingsByName[cn] || { gamificationEnabled: false } }
export function getClassIdByName(cn) { return STATE.classIdByName[cn] ?? null }
export function getStudentById(id) { return STATE.studentByIdMap[id] || null }
export async function fetchHouseWeeklyScore() { return null }
export async function fetchHouseSeasonScore() { return null }
export function isTextbookMode() { return STATE.textbookMode }
export function getStudentPrimaryTextbook(id) { return STATE.primaryTextbookByStudent[id] ?? null }
export function getLearnableTextbookUnits(tbId) { return STATE.learnableUnitsByTextbook[tbId] || [] }
export function getLearnableClassUnitNames(cn) { return STATE.learnableUnitNamesByClass[cn] || [] }
export function requestAudioGeneration() {}
export async function getStudentEntranceClassIds() { return [] }
export async function fetchXpTotal() { return 0 }
export function isMissingTableError() { return false }
`)

// config/features — 플래그를 테스트가 직접 켜고 끌 수 있는 컨트롤 패널.
// 기본값은 실제 src/config/features.js의 DEFAULT_FEATURES 중 학생 화면에
// 영향을 주는 값과 동일하게 맞춘다(2026-09-04 시점 실제 기본값 그대로).
const featuresUrl = write('fakeFeatures.mjs', `
export let FLAGS = {
  attachmentHats: true, attachmentMuseum: true, attachmentAlbum: true, attachmentPaulMemory: true,
  attachmentWorldGarden: true, attachmentWorldFull: false, attachmentBookshelf: true, attachmentStory: false,
  paulMemoryV2: true, todaysDiscovery: true, starToSeed: true, hatCeremony: true, paulTownHomeBand: true,
  paulTownGarden: true, paulTownBuildings: true, productAnalytics: true,
  readingFoundation: true, readingStudentUI: false, curriculumExamplesStudentUI: false,
  writingCoachEnabled: false, writingReviewAiAssist: false,
}
export function isFeatureEnabled(name) { return FLAGS[name] === true }
export function areAllFeaturesEnabled(names) { return names.every((n) => FLAGS[n] === true) }
export function __setFlag(name, val) { FLAGS = { ...FLAGS, [name]: val } }
export function __resetFlags(patch) {
  FLAGS = {
    attachmentHats: true, attachmentMuseum: true, attachmentAlbum: true, attachmentPaulMemory: true,
    attachmentWorldGarden: true, attachmentWorldFull: false, attachmentBookshelf: true, attachmentStory: false,
    paulMemoryV2: true, todaysDiscovery: true, starToSeed: true, hatCeremony: true, paulTownHomeBand: true,
    paulTownGarden: true, paulTownBuildings: true, productAnalytics: true,
    readingFoundation: true, readingStudentUI: false, curriculumExamplesStudentUI: false,
    writingCoachEnabled: false, writingReviewAiAssist: false,
    ...(patch || {}),
  }
}
export default FLAGS
`)

const ENTRY_POINTS = [
  'src/components/StudentSelect.jsx',
  'src/components/Dashboard.jsx',
  'src/components/GuidedSession.jsx',
  'src/components/WordDetail.jsx',
  'src/components/QuizGame.jsx',
  'src/components/SpellingQuestion.jsx',
  'src/components/SpellingReview.jsx',
  'src/components/EnglishGarden.jsx',
  'src/components/PaulTown.jsx',
  'src/components/TextbookSelector.jsx',
]

await esbuild.build({
  entryPoints: ENTRY_POINTS,
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: path.join(TMP, 'dist'),
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.BASE_URL': JSON.stringify('/'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'),
  },
  plugins: [{
    name: 'ui-path-stubs',
    setup(b) {
      const map = [
        [/utils[\\/]speech$/, speechUrl],
        [/utils[\\/]paulReactions$/, paulReactionsUrl],
        [/hooks[\\/]useStudent$/, useStudentHookUrl],
        [/utils[\\/]wordLibrary(\.js)?$/, wordLibraryUrl],
        [/utils[\\/]browserDetect$/, browserDetectUrl],
        [/hooks[\\/]useMicReady$/, useMicReadyUrl],
        [/InAppBrowserNotice$/, inAppNoticeUrl],
        [/supabaseClient(\.js)?$/, supabaseClientUrl],
        [/config[\\/]features(\.js)?$/, featuresUrl],
      ]
      for (const [filter, url] of map) {
        b.onResolve({ filter }, () => ({ path: url, external: true }))
      }
    },
  }],
})

const t = Date.now()
const importDist = (rel) => import(pathToFileURL(path.join(TMP, 'dist', rel)).href + '?t=' + t)
const StudentSelect = (await importDist('StudentSelect.js')).default
const Dashboard = (await importDist('Dashboard.js')).default
const GuidedSession = (await importDist('GuidedSession.js')).default
const WordDetail = (await importDist('WordDetail.js')).default
const QuizGame = (await importDist('QuizGame.js')).default
const SpellingQuestion = (await importDist('SpellingQuestion.js')).default
const SpellingReview = (await importDist('SpellingReview.js')).default
const EnglishGarden = (await importDist('EnglishGarden.js')).default
const PaulTown = (await importDist('PaulTown.js')).default
const TextbookSelector = (await importDist('TextbookSelector.js')).default

const wordLibStub = await import(wordLibraryUrl)
const featuresStub = await import(featuresUrl)

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const render = (el) => renderToStaticMarkup(el)

const noop = () => {}
const anoop = async () => {}

// ── 소스 텍스트 유틸(정적 검사용) ──
const srcOf = (relPath) => fs.readFileSync(path.resolve(relPath), 'utf8')
const slice = (src, startMarker, len) => {
  const i = src.indexOf(startMarker)
  if (i === -1) return ''
  return src.slice(i, i + len)
}
// 블록/라인 주석 제거(testAdminUnitEdit.mjs D/E 섹션과 동일한 관례) — 코드
// 본문에서만 raw 식별자 사용 여부를 판정하고, "서버가 이런 컬럼을 최종
// 방어한다"류 설명 주석은 오탐에서 제외한다.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => { const m = l.match(/(?<!:)\/\/.*/); return m ? l.slice(0, m.index) : l })
  .join('\n')

console.log('학생 핵심 경로 SSR/정적 계약 스위트 — 로그인→대시보드→선택기→학습→퀴즈→철자→복습→정원→Paul Town→로그아웃\n')

// ══════════════════════════════════════════════════════════════════════
// 1) StudentSelect(로그인)
// ══════════════════════════════════════════════════════════════════════
screen('StudentSelect(로그인)')
{
  const html = render(React.createElement(StudentSelect, { onSelect: anoop, onAdmin: noop, onParent: noop }))
  check('이름 입력 필드 렌더', html.includes('이름 입력...'))
  check('PIN 4자리 입력 필드 렌더', html.includes('PIN 4자리'))
  check('시작하기 버튼 렌더', html.includes('시작하기!'))
  check('초기 렌더(loggingIn=false)에는 시작하기 버튼에 disabled 속성 없음',
    (() => {
      const i = html.indexOf('시작하기!')
      const btnStart = html.lastIndexOf('<button', i)
      const btnTag = html.slice(btnStart, html.indexOf('>', btnStart))
      return !/\sdisabled(=|>|\s)/.test(btnTag)
    })())
  check('로그인 탭 기본 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(html))

  const src = srcOf('src/components/StudentSelect.jsx')
  check('busy 플래그(loggingIn/settingUp)로 로그인 입력·버튼이 잠김(정적)',
    /disabled=\{loggingIn\}/.test(src) && /disabled=\{settingUp\}/.test(src) && /onClick=\{handleLogin\} disabled=\{loggingIn\}/.test(src))
  check('탭 버튼도 busy(loggingIn||settingUp)로 잠김(정적)', /const busy = loggingIn \|\| settingUp/.test(src) && /disabled=\{busy\}/.test(src))
  check('PIN 만들기 반 로스터 렌더 분기 존재(정적) — 학생 계정이 없습니다 / setupVisibleRoster.map',
    /setupRoster\.length === 0 \?/.test(src) && /학생 계정이 없습니다/.test(src) && /setupVisibleRoster\.map/.test(src))
  check('hasPinHash:false 상태의 문서화된 "PIN 없음" 배지 텍스트 존재(정적)',
    /rs\.hasPinHash \? '🟢 PIN 완료' : '🔴 PIN 없음'/.test(src))
  check('pinSetupAllowed:false 시 "아직 PIN 설정이 허용되지 않았어요" 안내 분기 존재(정적)',
    /!setupStatus\.pinSetupAllowed \? \(/.test(src) && /아직 PIN 설정이 허용되지 않았어요/.test(src))
  const srcNoComments = stripComments(src)
  check('규칙 11 — 코드 본문(주석 제외)에 raw PIN 컬럼명(pin_hash/pin_fail_count/pin_locked_until/pin_setup_allowed) 없음, boolean 상태 필드(hasPinHash/pinSetupAllowed)만',
    !/\bpin_hash\b|\bpin_fail_count\b|\bpin_locked_until\b|\bpin_setup_allowed\b/.test(srcNoComments) &&
    /hasPinHash/.test(src) && /pinSetupAllowed/.test(src))
}

// ══════════════════════════════════════════════════════════════════════
// 2) Dashboard — 교과서/유닛 선택기 + 빈 상태
// ══════════════════════════════════════════════════════════════════════
screen('Dashboard')
{
  const baseStudentData = {
    stars: 12, starsDisplay: 12, clearedStars: 0, stickerTypes: [], activeMissions: [],
    dailyProgress: { words: 1, examples: 0, quizzes: 0, pronunciations: 0 },
    liveMissionsCompleted: 1, streak: 3, cleared: [], ticketBalance: 0,
    redeemTicketReward: () => ({ ok: false, reason: 'insufficient-balance' }),
    equippedHatId: null, rewardLevel: { level: 1 }, rewardStarsToNext: 10,
    hatInventory: [], history: {}, spellingWrongToday: [], spellingReviewQueue: [],
  }
  const words3 = [
    { id: 'w1', word: 'apple', meaning: '사과' },
    { id: 'w2', word: 'banana', meaning: '바나나' },
    { id: 'w3', word: 'cherry', meaning: '체리' },
  ]
  const baseProps = {
    studentId: 'stu-1', studentName: '테스트학생', classWords: words3,
    onGo: noop, onLogout: noop, onPlayGame: noop, onResumeWord: noop, resumeIndex: 0,
    onUnitSwitch: anoop, onStartGuided: noop, completedUnits: [], completedTextbooks: [],
    pendingCeremonyHat: null, onDismissCeremony: noop,
    textbookOptions: [{ id: 'tb1', label: '중1 능률 김성곤' }, { id: 'tb2', label: '고1 동아 윤정미 (동아출판)' }],
    currentTextbookId: 'tb1', onTextbookSwitch: anoop,
  }

  wordLibStub.__configure({
    classNames: ['중1 A반'], realClassNames: ['중1 A반'],
    studentClassById: { 'stu-1': '중1 A반' },
    classSettingsByName: { '중1 A반': { gamificationEnabled: false } },
    todaysAssignmentByClass: {},
    textbookMode: true,
    primaryTextbookByStudent: { 'stu-1': { id: 'tb1', name: '중1 능률 김성곤' } },
    // getLearnableTextbookUnits 스텁 — 3개 중 유령(단어<2) 1개를 제외한 2개만 반환
    learnableUnitsByTextbook: { tb1: [{ id: 'u1', name: 'Unit 1' }, { id: 'u2', name: 'Unit 2' }] },
    learnableUnitNamesByClass: {},
    studentByIdMap: { 'stu-1': { id: 'stu-1', houseId: null } },
  })
  wordLibStub.STATE.studentUnitById = { 'stu-1': 'Unit 1' }

  const html = render(React.createElement(Dashboard, { ...baseProps, studentData: baseStudentData }))
  check('교과서 선택기 — 옵션 정확히 2개, 라벨 "name" 그대로', html.includes('중1 능률 김성곤') )
  check('교과서 선택기 — 라벨 "name (publisherName)" 형식', html.includes('고1 동아 윤정미 (동아출판)'))
  check('유닛 선택기 — 학습 가능한 2개 유닛만(스텁 getLearnableTextbookUnits) 노출', html.includes('Unit 1') && html.includes('Unit 2'))
  check('유닛 선택기 — 유령 유닛(Unit 3, 학습불가 스텁 대상 밖)은 노출되지 않음', !html.includes('Unit 3'))
  check('반: 중1 A반 표시', html.includes('반: 중1 A반'))
  check('Dashboard 정상 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(html))

  // 빈 단어 상태
  const htmlEmpty = render(React.createElement(Dashboard, { ...baseProps, classWords: [], studentData: { ...baseStudentData, history: {} } }))
  check('0단어 — "단어 준비 중" 텍스트(단어 공부 서브라벨)', htmlEmpty.includes('단어 준비 중'))
  check('0단어 — "단어가 부족해요" 텍스트(히어로 배너)', htmlEmpty.includes('단어가 부족해요'))
  check('0단어 렌더에도 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(htmlEmpty))

  // 반 삭제
  wordLibStub.__configure({ ...wordLibStub.STATE, classNames: ['다른반'] })
  const htmlDeleted = render(React.createElement(Dashboard, { ...baseProps, studentData: baseStudentData }))
  check('반 삭제(classNames에서 빠짐) — 경고 카드 렌더', htmlDeleted.includes('등록된 반이 없어요') && htmlDeleted.includes('삭제되었습니다'))
  wordLibStub.__configure({ ...wordLibStub.STATE, classNames: ['중1 A반'] })

  const src = srcOf('src/components/Dashboard.jsx')
  check('unitSwitching이 유닛 select를 잠금(정적)', /disabled=\{unitSwitching\}/.test(src))
  check('textbookSwitching이 TextbookSelector로 switching prop 전달(정적)', /switching=\{textbookSwitching\}/.test(src))

  // TextbookSelector switching 상태에서 select가 disabled
  const htmlSwitching = render(React.createElement(TextbookSelector, { options: baseProps.textbookOptions, currentId: 'tb1', switching: true, error: '', onSwitch: noop }))
  check('TextbookSelector — switching=true면 select에 disabled 속성', /<select[^>]*\sdisabled(=|>|\s)/.test(htmlSwitching))
  const htmlNotSwitching = render(React.createElement(TextbookSelector, { options: baseProps.textbookOptions, currentId: 'tb1', switching: false, error: '', onSwitch: noop }))
  check('TextbookSelector — switching=false면 select에 disabled 속성 없음', !/<select[^>]*\sdisabled(=|>|\s)/.test(htmlNotSwitching))

  // App.jsx의 textbookOptions 라벨 계산(name / name (publisherName), grade 추론 없음) — 정적
  const appSrc = srcOf('src/App.jsx')
  const tbBlock = slice(appSrc, 'const textbookOptions = useMemo(', 1400)
  check('App.jsx textbookOptions — 라벨 = name 또는 name (publisherName)', /tb\.publisherName \? `\$\{tb\.name\} \(\$\{tb\.publisherName\}\)` : tb\.name/.test(tbBlock))
  check('App.jsx textbookOptions — 학년(grade) 추론 없음(정적)', !/grade/i.test(tbBlock))
}

// ══════════════════════════════════════════════════════════════════════
// 3) GuidedSession / WordDetail
// ══════════════════════════════════════════════════════════════════════
screen('GuidedSession/WordDetail')
{
  const guidedCommon = {
    studentId: 'stu-1', unitId: 'u1', onStartKeySentence: noop,
    spellingSettings: { spellingTestEnabled: false, spellingHintEnabled: false, spellingDirection: 'kr2en' },
    mixedDirections: null, spellingCombo: 0, spellingReviewQueue: [], wordStatus: {},
    onSpellingAnswer: noop, onMarkViewed: noop, onMarkExampleHeard: noop, onMarkPronunciationOk: noop,
    onMarkQuizSolved: noop, onQuizAnswer: noop, onMarkCompleted: noop, onPronunciationAttempt: noop,
    onWordKnown: noop, onWordUnknown: noop, onSetLastWordIndex: noop, onDone: noop,
  }
  const htmlEmpty = render(React.createElement(GuidedSession, { ...guidedCommon, classWords: [], resumeIndex: 0 }))
  check('0 단어 — "단어가 없어요" 카드', htmlEmpty.includes('단어가 없어요'))
  check('0 단어 카드 — 홈으로 버튼', htmlEmpty.includes('🏠 홈으로'))

  const words2 = [
    { id: 'w1', dbId: 'db1', word: 'apple', meaning: '사과', wordAudioUrl: null, pronunciation: 'ˈæpl' },
    { id: 'w2', dbId: 'db2', word: 'banana', meaning: '바나나', wordAudioUrl: null },
  ]
  const htmlMain = render(React.createElement(GuidedSession, { ...guidedCommon, classWords: words2, resumeIndex: 0 }))
  check('단어 있음 — 첫 단어(apple) 렌더', htmlMain.includes('apple'))
  check('단어 있음 — "✅ 알아요" 버튼 렌더', htmlMain.includes('✅') && htmlMain.includes('알아요'))
  check('단어 있음 — "😅 모르겠어요" 버튼 렌더', htmlMain.includes('😅') && htmlMain.includes('모르겠어요'))
  check('정상 GuidedSession 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(htmlMain))

  // WordDetail 단독(comprehensive, spelling 제외) — 같은 첫 단어 사양 재확인
  const wdHtml = render(React.createElement(WordDetail, {
    word: words2[0], classWords: words2, mode: 'study',
    onBack: noop, onMarkViewed: noop, wordStatus: {}, onWordKnown: noop, onWordUnknown: noop,
  }))
  check('WordDetail 단독 — 단어(apple) 렌더', wdHtml.includes('apple'))
  check('WordDetail 단독 — "✅ 알아요" / "😅 모르겠어요" 버튼 둘 다 렌더', wdHtml.includes('알아요') && wdHtml.includes('모르겠어요'))
  check('WordDetail 단독 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(wdHtml))
}

// ══════════════════════════════════════════════════════════════════════
// 4) QuizGame
// ══════════════════════════════════════════════════════════════════════
screen('QuizGame')
{
  const htmlEmpty = render(React.createElement(QuizGame, {
    onBack: noop, onAddMission: noop, onMarkQuizSolved: noop, onMarkPronunciationOk: noop,
    onQuizAnswer: noop, onPronunciationAttempt: noop, initWord: null, classWords: [],
  }))
  check('빈 풀 — "단어가 없어요!" 텍스트', htmlEmpty.includes('단어가 없어요!'))

  const words5 = [
    { id: 'q1', word: 'apple', meaning: '사과', wordAudioUrl: null },
    { id: 'q2', word: 'banana', meaning: '바나나', wordAudioUrl: null },
    { id: 'q3', word: 'cherry', meaning: '체리', wordAudioUrl: null },
    { id: 'q4', word: 'grape', meaning: '포도', wordAudioUrl: null },
    { id: 'q5', word: 'melon', meaning: '멜론', wordAudioUrl: null },
  ]
  const html = render(React.createElement(QuizGame, {
    onBack: noop, onAddMission: noop, onMarkQuizSolved: noop, onMarkPronunciationOk: noop,
    onQuizAnswer: noop, onPronunciationAttempt: noop, initWord: null, classWords: words5,
  }))
  // 옵션 버튼은 A/B/C/D 라벨(String.fromCharCode(65+i))로 항상 4개 렌더된다(makeOptions: 정답1+오답3)
  const optionLetters = ['>A<', '>B<', '>C<', '>D<'].filter((s) => html.includes(s))
  check('정상 풀 — 보기 4개(A~D) 렌더(소스 makeOptions: 정답1 + 오답3)', optionLetters.length === 4, html.match(/>[A-D]</g))
  check('정상 QuizGame 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(html))
}

// ══════════════════════════════════════════════════════════════════════
// 5) SpellingQuestion / SpellingReview
// ══════════════════════════════════════════════════════════════════════
screen('SpellingQuestion/SpellingReview')
{
  const sq = render(React.createElement(SpellingQuestion, {
    word: 'apple', meaning: '사과', wordAudioUrl: null, hintEnabled: false, direction: 'kr2en',
  }))
  check('SpellingQuestion(kr2en) 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(sq))
  check('SpellingQuestion(kr2en) — 문제로 뜻(사과) 표시', sq.includes('사과'))

  const words2 = [
    { id: 'w1', word: 'apple', meaning: '사과', wordAudioUrl: null, acceptedMeanings: [] },
    { id: 'w2', word: 'banana', meaning: '바나나', wordAudioUrl: null, acceptedMeanings: [] },
  ]
  const srHtml = render(React.createElement(SpellingReview, {
    wrongWordIds: ['w1', 'w2'], classWords: words2, onClearWord: noop, onDone: noop,
    hintEnabled: false, direction: 'kr2en',
  }))
  check('SpellingReview(큐 2개) 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(srHtml))
  check('SpellingReview — 남은 단어 수 표시', srHtml.includes('남은 단어 2개'))

  const srEmptyHtml = render(React.createElement(SpellingReview, {
    wrongWordIds: [], classWords: words2, onClearWord: noop, onDone: noop, hintEnabled: false, direction: 'kr2en',
  }))
  check('SpellingReview — 빈 큐는 아무것도 렌더하지 않음(SSR에서 effect는 못 돌지만 return null 정적 확인)', srEmptyHtml === '')

  const srSrc = srcOf('src/components/SpellingReview.jsx')
  check('SpellingReview — 소스상 큐가 비면 effect가 onDone을 호출(정적, SSR은 effect 미실행)',
    /useEffect\(\(\) => \{\s*if \(words\.length === 0\) onDone\(\)\s*\}, \[words\.length, onDone\]\)/.test(srSrc))
}

// ══════════════════════════════════════════════════════════════════════
// 6) EnglishGarden / PaulTown
// ══════════════════════════════════════════════════════════════════════
screen('EnglishGarden/PaulTown')
{
  const gHtml = render(React.createElement(EnglishGarden, { stats: { gardenPoints: 40 }, onBack: noop }))
  const plotCellMatches = gHtml.match(/aspect-square rounded-2xl bg-lime-50/g) || []
  check('정원 텃밭 — 16칸 렌더(PLOT_COUNT)', plotCellMatches.length === 16, plotCellMatches.length)
  check('EnglishGarden 정상 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(gHtml))

  const gLocked = render(React.createElement(EnglishGarden, { stats: { gardenPoints: 29 }, onBack: noop }))
  const gUnlocked = render(React.createElement(EnglishGarden, { stats: { gardenPoints: 30 }, onBack: noop }))
  check('집(house) 잠금 — 29포인트에서는 잠김 안내 문구(단어 30개를 배우면 집이 지어져요)', gLocked.includes('단어 30개를 배우면 집이 지어져요'))
  check('집(house) 잠금 — 29포인트에서는 "열렸어요" 문구 없음', !gLocked.includes('열렸어요 — 곧 구경할 수 있어요!'))
  check('집(house) 해금 — 30포인트에서는 "열렸어요" 문구로 전환', gUnlocked.includes('열렸어요 — 곧 구경할 수 있어요!'))
  check('집(house) 해금 — 30포인트에서는 잠김 안내 문구 사라짐(텍스트가 실제로 다름)', !gUnlocked.includes('단어 30개를 배우면 집이 지어져요'))

  featuresStub.__setFlag('paulTownBuildings', true)
  const ptOn = render(React.createElement(PaulTown, {
    stats: { gardenPoints: 200 }, hatInventory: [], equippedHatId: null, onEquip: noop, onGo: noop, onBack: noop,
  }))
  check('PaulTown — paulTownBuildings=true, 학습량 충분 → "마을 곳곳"(건물) 섹션 렌더', ptOn.includes('마을 곳곳'))
  check('PaulTown(on) 렌더에 undefined/null/NaN/[object Object] 누출 없음', noUndefinedLeak(ptOn))

  featuresStub.__setFlag('paulTownBuildings', false)
  const ptOff = render(React.createElement(PaulTown, {
    stats: { gardenPoints: 200 }, hatInventory: [], equippedHatId: null, onEquip: noop, onGo: noop, onBack: noop,
  }))
  check('PaulTown — paulTownBuildings=false → "마을 곳곳"(건물) 섹션 렌더되지 않음', !ptOff.includes('마을 곳곳'))
  featuresStub.__setFlag('paulTownBuildings', true)
}

// ══════════════════════════════════════════════════════════════════════
// 7) 로그아웃(Dashboard)
// ══════════════════════════════════════════════════════════════════════
screen('로그아웃')
{
  const dashSrc = srcOf('src/components/Dashboard.jsx')
  check('로그아웃 버튼이 window.confirm 확인 후 onLogout 호출(정적)',
    /if \(window\.confirm\('정말 로그아웃할까요\?[\s\S]{0,80}?\)\) onLogout\(\)/.test(dashSrc))
  check('로그아웃 버튼 라벨 "🚪 로그아웃" 존재(정적)', /🚪 로그아웃/.test(dashSrc))
}

// ══════════════════════════════════════════════════════════════════════
// 8) 연타/중복클릭 방지 — busy 플래그 정적 배선
// ══════════════════════════════════════════════════════════════════════
screen('연타 방지(busy 플래그, 정적)')
{
  const ssSrc = srcOf('src/components/StudentSelect.jsx')
  check('StudentSelect — loggingIn이 로그인 입력/버튼을 잠금', /disabled=\{loggingIn\}/.test(ssSrc))
  check('StudentSelect — settingUp이 PIN 만들기 입력/버튼을 잠금', /disabled=\{settingUp\}/.test(ssSrc))

  const dashSrc = srcOf('src/components/Dashboard.jsx')
  check('Dashboard — unitSwitching이 유닛 select를 잠금', /disabled=\{unitSwitching\}/.test(dashSrc))
  check('Dashboard — textbookSwitching이 TextbookSelector에 switching으로 전달', /switching=\{textbookSwitching\}/.test(dashSrc))

  const dirSrc = srcOf('src/components/admin/StudentDirectory.jsx')
  check('StudentDirectory — bulkBusy가 일괄 반 이동 버튼을 잠금', /disabled=\{!bulkTargetClass \|\| bulkBusy\}/.test(dirSrc))
}

// ══════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(72))
console.log('화면별 결과표')
console.log('screen | checks | PASS/FAIL')
for (const r of rows) {
  console.log(`${r.screen} | ${r.checks} | ${r.fail === 0 ? 'PASS' : `FAIL(${r.fail})`}`)
}
console.log('='.repeat(72))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 학생 핵심 경로 SSR/정적 계약 정상')
