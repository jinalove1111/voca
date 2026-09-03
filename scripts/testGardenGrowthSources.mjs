// scripts/testGardenGrowthSources.mjs
//
// 정원 성장 소스 회귀 스위트(2026-09-04) — 철자 시험(recordSpellingAnswer)
// 정답이 정원 성장(clearedWords)에 전혀 기록되지 않던 버그의 FAIL-first
// 회귀 안전망.
//
// 배경(운영자 조사, READ-ONLY 프로덕션 스캔 193 progress 행)
//   정원 포인트 = |cleared ∪ completedWords ∪ clearedWords|
//   (src/utils/attachment/attachmentCore.js deriveAttachmentStats, ~L142).
//   쓰기 지점은 useStudent.js의 markWordCompleted(L1133)/markWordCleared(L1146)
//   뿐이고, recordQuizAnswer(L1566)는 정답일 때 markWordCleared를 부르는데
//   (L1578, WordDetail.QuizStep/GuidedSession 재시도/QuizGame 3경로 공유
//   choke point) recordSpellingAnswer(L1610)는 정답이어도 한 번도 부르지
//   않았다. 실측: a31037a3… 철자 정답 347회인데 정원 0칸, 16fa6e1c…는
//   퀴즈 77 + 철자 134 정답인데 정원 2칸 — 학습일당 성장 중앙값 0.13칸으로
//   2026-08-28 목표(≈1칸/학습일)에 크게 못 미쳤다.
//
// 키 도메인 검증(코드 정독, 재확인)
//   WordDetail.jsx L527: onQuizAnswer?.(word.id, correct)
//   WordDetail.jsx L895: onResult={(correct, dir, submitted) => onSpellingAnswer?.(word.id, correct, dir, submitted)}
//   두 호출 모두 같은 `word` prop(classWords 원소, wordLibrary.js mapWordRow의
//   id: wordSlug(cw.word) — 텍스트 슬러그, 교재/유닛 무관 안정 키)에서 나온
//   word.id다. 정규화/변환이 전혀 필요 없다 — 같은 단어를 퀴즈로 먼저
//   맞히든 철자로 먼저 맞히든 markWordCleared의 기존 멱등 가드(clearedWords.
//   includes)가 정확히 한 번만 센다.
//
// 수정(운영자 지정 범위)
//   recordSpellingAnswer의 correct 분기 안에 markWordCleared(wordId)를 정확히
//   한 줄만 배선(+useCallback deps에 markWordCleared 추가). 그게 전부다.
//   clearSpellingReviewWord(복습 화면에서 오답노트를 "해소"하는 함수 —
//   spellingReviewQueue/spellingWrongToday에서 제거 + wrong-word-recovered
//   원장 지급만 담당)는 "정답 이벤트"가 아니라 큐 정리 이벤트이므로 운영자
//   지정 범위에서 명시적으로 제외해 손대지 않았다 — 이 화면에서 실제 정답
//   판정은 그 앞단(SpellingReview.jsx가 내부적으로 채점한 뒤 이 함수를
//   호출하는 시점)에서 이미 끝나 있고, recordSpellingAnswer를 거치지
//   않으므로 이번 수정 후에도 이 경로 단독으로는 정원이 자라지 않는다
//   (아래 시나리오 A에서 이 사실을 고정 — clearSpellingReviewWord만 불렀을
//   때 정원 포인트가 여전히 0임을 확인).
//   별/XP/콤보/spellingReviewQueue/wrong-word-recovered/history 카운터는
//   전혀 건드리지 않았다.
//
// 구동 방식 — scripts/testGardenGrowthFlow.mjs / scripts/testRewardFlow.mjs와
// 완전히 동일: fakeReact.mjs 최소 hooks 런타임 + fake clock으로 실제
// 번들된 src/hooks/useStudent.js(scripts/buildRaceBundle.mjs 산출물)를
// 그대로 구동한다. 네트워크 0, DB 접근 0(wordLibraryRaceStub이 전부 스텁).
//
// CLAUDE.md 규칙 15(FAIL-first) — 이 파일은 수정 전(recordSpellingAnswer가
// markWordCleared를 부르지 않는 상태)에 먼저 실행해 시나리오 A의 철자
// 관련 단언들이 실제로 FAIL하는지 확인한 뒤(구현 handoff 참고), 수정 후
// 전체 PASS로 전환했다.
//
// 실행:
//   node scripts/buildRaceBundle.mjs && node scripts/testGardenGrowthSources.mjs
//   (또는 npm run verify:garden-growth-sources)
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { createFakeClock, renderHook } from './fakeReact.mjs'
import { deriveAttachmentStats } from '../src/utils/attachment/attachmentCore.js'
import { gardenPlots, POINTS_PER_STAGE } from '../src/utils/attachment/worldProgress.js'

class FakeStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
}
class FakeDocument {
  constructor() { this.visibilityState = 'visible'; this.listeners = {} }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn) }
  dispatch(type) { (this.listeners[type] || []).forEach(fn => fn()) }
}

let failures = 0
let asserted = 0
const failed = []
let scenario = ''
function check(label, cond) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++; failed.push(`[${scenario}] ${label}`) }
}

const raceStub = await import(pathToFileURL('scripts/wordLibraryRaceStub.mjs').href)
const bundle = await import(pathToFileURL('scripts/.tmp/useStudent.race.bundle.mjs').href)
const { useStudent, mergeProgressRecords } = bundle

function freshEnv() {
  raceStub.resetFetchFullProgressDeferred()
  raceStub.syncCalls.length = 0
  raceStub.setStrictBackup(null)
  raceStub.setStrictBackupError(null)
  globalThis.localStorage = new FakeStorage()
  globalThis.document = new FakeDocument()
}

function mount(id, { storage } = {}) {
  if (storage) { globalThis.localStorage = storage; globalThis.document = new FakeDocument() }
  else freshEnv()
  const clock = createFakeClock()
  const host = renderHook(() => useStudent(id), clock)
  raceStub.fetchFullProgressDeferred.resolve(null)
  return host
}

// fakeReact의 run()은 커밋 전 반환값을 캡처하므로, useEffect 안에서 일어난
// patch()의 결과를 읽으려면 명시 재렌더가 필요하다(testGardenGrowthFlow.mjs/
// testRewardFlow.mjs의 settle()과 동일한 관례).
const settle = (host) => { host.rerender(); return host }

function garden(host) {
  const r = host.result
  const stats = deriveAttachmentStats({
    cleared: r.cleared, completedWords: r.completedWords, clearedWords: r.clearedWords,
    wordStatus: r.wordStatus, missions: r.missions, history: r.history,
    streak: r.streak, spellingReviewQueue: r.spellingReviewQueue,
  })
  const plots = gardenPlots(stats)
  return {
    stats,
    points: stats.gardenPoints,
    filled: plots.filter((p) => p.stage !== 'empty').length,
  }
}

console.log('\n=== [garden-growth-sources] 정원 성장 소스 회귀 — 퀴즈/철자/열람/새 계정/교재 변경/persistence/보상 독립 ===')

// ── A) 성장 소스 ──────────────────────────────────────────────────────────
scenario = 'A) 성장 소스'
console.log(`\n-- ${scenario}`)
{
  // 퀴즈 정답 → clearedWords +1 (기존 축, 동결 — 회귀 방지 앵커)
  const hq = mount('QA_GGS_A_quiz')
  const g0 = garden(hq)
  check('학습 전: 0포인트', g0.points === 0)
  hq.result.recordQuizAnswer('apple', true); settle(hq)
  check('퀴즈 정답 → clearedWords에 기록됨', hq.result.clearedWords.includes('apple'))
  check('퀴즈 정답 → 정원 포인트 0→1', garden(hq).points === 1)

  // 철자 정답 → clearedWords +1 — 수정 전에는 FAIL(정원이 자라지 않음)
  const hs = mount('QA_GGS_A_spelling')
  hs.result.recordSpellingAnswer('banana', true); settle(hs)
  check('[핵심] 철자 정답 → clearedWords에 기록됨(수정 전 FAIL)', hs.result.clearedWords.includes('banana'))
  check('[핵심] 철자 정답 → 정원 포인트 0→1(수정 전 FAIL)', garden(hs).points === 1)

  // 같은 단어를 퀴즈로 먼저, 철자로 나중에 맞혀도 1개로만 센다(키 도메인 동일 확인)
  const hqs = mount('QA_GGS_A_same_word')
  hqs.result.recordQuizAnswer('cat', true); settle(hqs)
  hqs.result.recordSpellingAnswer('cat', true); settle(hqs)
  check('같은 단어 퀴즈→철자 모두 정답이어도 1포인트(중복 아님)', garden(hqs).points === 1)
  check('  clearedWords에 cat이 정확히 1번만 들어있음', hqs.result.clearedWords.filter((w) => w === 'cat').length === 1)

  // 반대 순서(철자 먼저, 퀴즈 나중)도 동일
  const hsq = mount('QA_GGS_A_same_word_rev')
  hsq.result.recordSpellingAnswer('dog', true); settle(hsq)
  hsq.result.recordQuizAnswer('dog', true); settle(hsq)
  check('같은 단어 철자→퀴즈 순서를 바꿔도 1포인트', garden(hsq).points === 1)

  // 철자 오답 → 성장 없음
  const hw = mount('QA_GGS_A_wrong')
  hw.result.recordSpellingAnswer('egg', false); settle(hw)
  check('철자 오답은 clearedWords에 기록되지 않음', !hw.result.clearedWords.includes('egg'))
  check('철자 오답은 정원 포인트를 주지 않음', garden(hw).points === 0)

  // 복습 화면 정답 해소(clearSpellingReviewWord) — 운영자 지정 범위에서
  // 명시적으로 제외(큐 정리 이벤트, recordSpellingAnswer를 거치지 않음).
  // 단독으로는 정원을 키우지 않는 것이 의도된 동작(수정 전/후 동일).
  const hr = mount('QA_GGS_A_review')
  hr.result.clearSpellingReviewWord('fish'); settle(hr)
  check('[범위 제외 확인] clearSpellingReviewWord 단독 호출은 정원을 키우지 않는다(recordSpellingAnswer 미경유)', !hr.result.clearedWords.includes('fish') && garden(hr).points === 0)

  // 단어 열람/듣기/발음 성공 — 정원 "농사" 금지(설계: no farming)
  const hv = mount('QA_GGS_A_view')
  hv.result.markWordViewed('grape'); settle(hv)
  check('단어 열람만으로는 성장하지 않음', garden(hv).points === 0 && !hv.result.clearedWords.includes('grape') && !hv.result.completedWords.includes('grape'))

  const hl = mount('QA_GGS_A_listen')
  hl.result.markExampleHeard(); settle(hl)
  check('예문 듣기만으로는 성장하지 않음', garden(hl).points === 0)

  const hp = mount('QA_GGS_A_pronounce')
  hp.result.markPronunciationOk('honey', 3); settle(hp)
  check('발음 성공만으로는 성장하지 않음', garden(hp).points === 0 && !hp.result.clearedWords.includes('honey'))

  // deriveAttachmentStats(record).gardenPoints === Set 크기(계약 재확인)
  const hset = mount('QA_GGS_A_setsize')
  hset.result.markWordCompleted('ice'); hset.result.recordQuizAnswer('juice', true)
  hset.result.recordSpellingAnswer('kite', true); settle(hset)
  const gset = garden(hset)
  const manualSet = new Set([...hset.result.cleared, ...hset.result.completedWords, ...hset.result.clearedWords])
  check('gardenPoints === |cleared ∪ completedWords ∪ clearedWords| (Set 크기와 바이트 단위 일치)', gset.points === manualSet.size && gset.points === 3)

  // gardenPlots 칸 합 — 2포인트당 1칸(POINTS_PER_STAGE)
  const hplot = mount('QA_GGS_A_plots')
  hplot.result.recordSpellingAnswer('lemon', true); settle(hplot)
  check('1포인트: 아직 칸 없음(임계 2)', garden(hplot).filled === 0)
  hplot.result.recordSpellingAnswer('mango', true); settle(hplot)
  check(`2포인트(=POINTS_PER_STAGE=${POINTS_PER_STAGE}) → 1칸 자람`, garden(hplot).filled === 1 && POINTS_PER_STAGE === 2)
}

// ── B) 새 계정 vs 기존 계정 ────────────────────────────────────────────────
scenario = 'B) 새 계정 · 기존 계정'
console.log(`\n-- ${scenario}`)
{
  // 신규 계정(freshRecord) — 빈 배열, 첫 철자 정답으로 0→1
  const hnew = mount('QA_GGS_B_new')
  check('신규 계정: cleared/completedWords/clearedWords 전부 빈 배열', hnew.result.cleared.length === 0 && hnew.result.completedWords.length === 0 && hnew.result.clearedWords.length === 0)
  check('신규 계정: 정원 0포인트', garden(hnew).points === 0)
  hnew.result.recordSpellingAnswer('nut', true); settle(hnew)
  check('신규 계정: 첫 철자 정답으로 0→1 성장', garden(hnew).points === 1)

  // 기존 계정 — 이미 clearedWords 292개를 가진 학생이 철자 정답 1개 추가
  // → 293 (리셋 없음, 손실 없음)
  freshEnv()
  const seedId = 'QA_GGS_B_existing'
  const existing292 = Array.from({ length: 292 }, (_, i) => `legacy_word_${i}`)
  globalThis.localStorage.setItem('paul_easy_progress', JSON.stringify({
    [seedId]: { clearedWords: existing292 },
  }))
  const hex = mount(seedId, { storage: globalThis.localStorage })
  check('기존 계정 시드: clearedWords 292개로 로드됨', hex.result.clearedWords.length === 292)
  check('기존 계정 시드: 정원 292포인트', garden(hex).points === 292)
  hex.result.recordSpellingAnswer('orange', true); settle(hex)
  check('기존 계정: 새 철자 정답 1개 추가 → 293 (리셋 없음)', hex.result.clearedWords.length === 293 && garden(hex).points === 293)
  check('  기존 292개가 그대로 보존됨(부분집합 유지)', existing292.every((w) => hex.result.clearedWords.includes(w)))
}

// ── C) 교재/유닛 변경 ──────────────────────────────────────────────────────
scenario = 'C) 교재 · 유닛 변경'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_GGS_C_unit')
  const U1 = '11111111-1111-1111-1111-111111111111'
  const U2 = '22222222-2222-2222-2222-222222222222'
  h.result.recordSpellingAnswer('pear', true); settle(h)
  const before = garden(h)
  check('사전 조건: 철자 정답 1개 → 1포인트', before.points === 1)

  h.result.setLastWordIndex(0, U1); settle(h)
  h.result.setLastWordIndex(0, U2); settle(h)  // 유닛 전환
  check('유닛을 바꿔도 정원 성장이 사라지지 않음', garden(h).points === before.points)

  h.result.recordSpellingAnswer('quince', true); settle(h)
  check('새 유닛에서 철자 정답을 추가해도 정상 누적(1→2)', garden(h).points === 2)

  // 같은 단어 텍스트가 다른 교재/유닛에 있어도 같은 슬러그 키라 1개로만
  // 센다(교재 무관 — wordLibrary.js wordSlug(cw.word)는 word.word 텍스트만
  // 보고 만들어지며 unitId/classId는 섞이지 않는다).
  const h2 = mount('QA_GGS_C_textbook_agnostic')
  h2.result.recordQuizAnswer('strawberry', true); settle(h2)     // 교재 A의 "strawberry"라고 가정
  h2.result.recordSpellingAnswer('strawberry', true); settle(h2) // 교재 B의 "strawberry"(같은 슬러그)라고 가정
  check('같은 단어 텍스트는 교재가 달라도 슬러그가 같아 1포인트만 (문서화: 텍스트 슬러그 키는 교재/유닛 필드를 포함하지 않음)', garden(h2).points === 1)

  // useStudent.js 소스에서 clearedWords가 markWordCleared/merge/freshRecord
  // 세 곳 밖에서 재할당되지 않는지 정적으로 확인 — 유닛/교재 전환 경로
  // (setStudentClass/setStudentUnit 등)는 wordLibrary.js의 캐시/로컬스토리지
  // 키만 건드리고 useStudent.js의 progress record를 전혀 쓰지 않는다.
  const useStudentSrc = readFileSync(new URL('../src/hooks/useStudent.js', import.meta.url), 'utf8')
  const assignSites = [...useStudentSrc.matchAll(/clearedWords:\s*/g)].length
  check('useStudent.js에서 `clearedWords:` 대입 지점이 정확히 3곳(freshRecord 초기값/mergeProgressRecords unionList/markWordCleared)뿐', assignSites === 3)
}

// ── D) 새로고침/재로그인 지속성 ────────────────────────────────────────────
scenario = 'D) 새로고침 · 재로그인 지속성'
console.log(`\n-- ${scenario}`)
{
  const h = mount('QA_GGS_D_persist')
  h.result.recordSpellingAnswer('raspberry', true); settle(h)
  h.result.recordQuizAnswer('tomato', true); settle(h)
  const before = garden(h)
  check('사전 조건: 철자+퀴즈 각 1개 → 2포인트', before.points === 2)

  const storage = globalThis.localStorage
  const raw = JSON.parse(storage.getItem('paul_easy_progress'))
  check('철자 정답이 localStorage에 clearedWords로 영속됨', Array.isArray(raw.QA_GGS_D_persist.clearedWords) && raw.QA_GGS_D_persist.clearedWords.includes('raspberry'))

  const h2 = mount('QA_GGS_D_persist', { storage })
  check('재마운트(새로고침) 후에도 정원 포인트 동일', garden(h2).points === before.points)
  check('재마운트 후에도 철자로 얻은 단어가 그대로 남아있음', h2.result.clearedWords.includes('raspberry'))

  // syncStudentProgress가 progress_data(= fullRecord)에 clearedWords/
  // completedWords/cleared를 그대로 싣는지 — 소스 정적 계약(2026-09-04
  // 정독: wordLibrary.js syncStudentProgress, progressRow.progress_data =
  // fullRecord 대입, fullRecord는 useStudent.js가 mergeProgressRecords(record,
  // backup) 결과를 통째로 넘김).
  const wordLibSrc = readFileSync(new URL('../src/utils/wordLibrary.js', import.meta.url), 'utf8')
  check('syncStudentProgress가 progress_data에 fullRecord(전체 record, clearedWords 포함)를 그대로 싣는다', /progressRow\.progress_data\s*=\s*fullRecord/.test(wordLibSrc))
  const useStudentSrc2 = readFileSync(new URL('../src/hooks/useStudent.js', import.meta.url), 'utf8')
  check('useStudent.js가 syncStudentProgress에 fullRecord로 merged(mergeProgressRecords 결과)를 넘긴다', /fullRecord:\s*merged/.test(useStudentSrc2))

  // mergeProgressRecords 순수 테스트 — 로컬/클라우드 양방향, 유실 없음
  const localRec = { cleared: ['la'], completedWords: ['lb'], clearedWords: ['spell_local'] }
  const cloudRec = { cleared: ['ca'], completedWords: ['cb'], clearedWords: ['spell_cloud'] }
  const merged1 = mergeProgressRecords(localRec, cloudRec, 'QA_GGS_D_merge')
  const merged2 = mergeProgressRecords(cloudRec, localRec, 'QA_GGS_D_merge')
  check('mergeProgressRecords: clearedWords가 로컬+클라우드 합집합(양쪽 유실 없음)', merged1.clearedWords.includes('spell_local') && merged1.clearedWords.includes('spell_cloud'))
  check('mergeProgressRecords: completedWords/cleared도 합집합', merged1.completedWords.includes('la') === false && merged1.completedWords.includes('lb') && merged1.completedWords.includes('cb') && merged1.cleared.includes('la') && merged1.cleared.includes('ca'))
  check('mergeProgressRecords: 병합 방향을 바꿔도(local↔cloud) 정원 포인트 동일(교환법칙)', deriveAttachmentStats(merged1).gardenPoints === deriveAttachmentStats(merged2).gardenPoints)
}

// ── E) 보상 루프와의 독립성 ────────────────────────────────────────────────
scenario = 'E) 보상 루프 독립성'
console.log(`\n-- ${scenario}`)
{
  // deriveAttachmentStats는 totalStars/xp/rewardLedger를 전혀 입력받지
  // 않는다 — record 부분집합만 넘겨도 gardenPoints가 정상 계산됨이 그
  // 자체로 증명(구조적 독립).
  const statsNoLedger = deriveAttachmentStats({ cleared: [], completedWords: [], clearedWords: ['w1', 'w2'] })
  check('gardenPoints 계산은 rewardLedger/totalStars 필드를 요구하지 않는다', statsNoLedger.gardenPoints === 2)

  // 순수 계약(acceptance #10): rewardLedger 50건 + totalStars 500이 있어도
  // 학습 단어(cleared/completedWords/clearedWords)가 0개면 정원은 0.
  // 훅의 grantReward는 round.starGrantLog/totalStars만 늘리고 rewardLedger
  // 자체는 내부 전용 grantLedgerReward(공개 API 아님)만 채우므로, 훅을
  // 통해 50건을 실제로 쌓는 대신 deriveAttachmentStats가 받는 그 record
  // 모양을 직접 구성해 순수하게 검증한다(회귀 대상은 deriveAttachmentStats
  // 자체의 필드 무관성이지, grantReward↔rewardLedger 배선이 아니다).
  const ledger50 = Array.from({ length: 50 }, (_, i) => ({
    reward_type: 'daily-goal-complete', source_type: 'daily-goal', source_id: `garden-test-ledger-${i}`, stars: 1,
  }))
  const statsLedgerHeavy = deriveAttachmentStats({
    cleared: [], completedWords: [], clearedWords: [], totalStars: 500, rewardLedger: ledger50,
  })
  check('사전 조건: 구성한 record에 rewardLedger 50건 + totalStars 500', ledger50.length === 50 && ledger50.every((e) => e.stars === 1))
  check('원장 50건 + totalStars 500 + 학습 단어 0개 → 정원 0포인트', statsLedgerHeavy.gardenPoints === 0)

  // 반대 방향: 철자 정답으로 정원을 키워도 원장 항목 수/별 지급 방식은
  // 정원 로직이 아니라 기존 학습 앵커(recordSpellingAnswer 자체의 콤보/
  // writing-complete 배선)에서만 나온다 — 이번 수정이 새 원장 타입을
  // 만들지 않았는지 확인.
  const h2 = mount('QA_GGS_E_no_new_ledger_type')
  h2.result.recordSpellingAnswer('under', true); settle(h2)
  const ledger2 = h2.result.rewardLedger || []
  check('철자 정답 1회로 새로 생기는 원장 항목이 있다면 전부 기존 계약(writing-complete/wrong-word-recovered) 안에서만',
    ledger2.every((e) => ['writing-complete', 'wrong-word-recovered'].includes(e?.reward_type)))
  check('원장 항목에 정원 관련 타입이 없다(정원은 원장에 쓰지 않는다)',
    !ledger2.some((e) => /garden|plot|world|town/i.test(String(e?.reward_type) + String(e?.source_type) + String(e?.source_id))))

  // useStudent.js는 애초에 attachment/worldProgress를 import하지 않는다
  // (testGardenGrowthFlow.mjs와 동일한 구조적 증명 재확인).
  const useStudentSrc = readFileSync(new URL('../src/hooks/useStudent.js', import.meta.url), 'utf8')
  check('useStudent.js는 attachment/worldProgress(정원) 모듈을 import하지 않는다',
    !/from\s+'[^']*attachment[^']*'/.test(useStudentSrc) && !/worldProgress/.test(useStudentSrc))
}

// ── 요약 ─────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(64)}`)
if (failures === 0) {
  console.log(`PASS  garden-growth-sources — 정원 성장 소스 회귀 (${asserted}개 단언)`)
  process.exit(0)
} else {
  console.log(`FAIL  garden-growth-sources — ${asserted}개 중 ${failures}개 실패`)
  for (const f of failed) console.log(`  - ${f}`)
  process.exit(1)
}
