// 2026-10-08(223차) 자체 커리큘럼 — 의사소통 목표 매핑 완전성 + 교재 독립성 정적 검사(순수, 번들·네트워크 불필요)
import fs from 'node:fs'
import { COMM_GOALS, BASIC_GOAL, LEVELS, goalIdForFunc, goalForItem, itemsForGoal, listGoals, unmappedFuncs } from '../src/utils/curriculum/commGoals.js'
import { STORY_ITEMS, STORY_EPISODES } from '../src/utils/situation/storyEpisodes.js'
import { SITUATION_EXPRESSIONS } from '../src/utils/situation/situationContent.js'

let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? '  ' + detail : ''}`); if (!ok) fail++ }
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ── 매핑 완전성: func 69종 → 목표 정확히 한 번, 모든 문항·기본 표현이 목표를 가짐 ──
const allFuncs = [...new Set(STORY_ITEMS.map((i) => i.func))]
const assigned = COMM_GOALS.flatMap((g) => g.funcs)
check('func 전부 정확히 한 목표에 배정(누락 0, 중복 0)', unmappedFuncs().length === 0 && new Set(assigned).size === assigned.length && assigned.every((f) => allFuncs.includes(f)), `unmapped=${unmappedFuncs().join(',')} dup=${assigned.filter((f, i) => assigned.indexOf(f) !== i).join(',')} stale=${assigned.filter((f) => !allFuncs.includes(f)).join(',')}`)
check('모든 이야기 문항(new 100 + review 14)이 목표를 가짐', STORY_ITEMS.every((i) => goalForItem(i) !== null) && STORY_ITEMS.length === 114)
check('기본 표현 5개 전부 목표를 가짐(실존 목표 id)', SITUATION_EXPRESSIONS.every((e) => COMM_GOALS.some((g) => g.id === BASIC_GOAL[e.id])))
check('목표 id 유일·레벨 1~3·제목 ≤10자·설명 ≤30자·영어 없음', new Set(COMM_GOALS.map((g) => g.id)).size === COMM_GOALS.length && COMM_GOALS.every((g) => [1, 2, 3].includes(g.level) && g.titleKo.length <= 10 && g.descKo.length <= 30 && !/[A-Za-z]/.test(g.titleKo + g.descKo)))
check('레벨 3개, 이름·설명 한글', LEVELS.length === 3 && LEVELS.every((l) => !/[A-Za-z]/.test(l.titleKo + l.descKo)))
check('목표마다 문항 3개 이상(얇은 목표 없음)', listGoals().every((g) => g.count >= 3), listGoals().filter((g) => g.count < 3).map((g) => `${g.id}:${g.count}`).join(','))
check('itemsForGoal: 기본 표현 + 이야기 문항, 합계 = 114 + 5', COMM_GOALS.reduce((n, g) => n + itemsForGoal(g.id).length, 0) === STORY_ITEMS.length + SITUATION_EXPRESSIONS.length)
check('예시: borrowing → requesting, ordering → hosting, 미지 func → null', goalIdForFunc('borrowing') === 'requesting' && goalIdForFunc('ordering') === 'hosting' && goalIdForFunc('nope') === null)
check('목표를 고르면 교재명 없이 회차·문항으로 연결됨(모든 목표에 회차 ≥1)', COMM_GOALS.every((g) => new Set(itemsForGoal(g.id).filter((x) => x.kind === 'story').map((x) => x.episode)).size >= 1))

// ── 교재 독립성: Speaking·Writing·커리큘럼 콘텐츠 모듈에 특정 상업 교재명·권/단원 참조 없음 ──
const CONTENT = ['src/utils/situation/storyEpisodes.js', 'src/utils/situation/situationContent.js', 'src/utils/situation/speakingTopics.js', 'src/utils/situation/speakingSets.js', 'src/utils/writing/writingItems.js', 'src/utils/curriculum/commGoals.js', 'src/components/SpeakingTopics.jsx', 'src/components/WritingPractice.jsx', 'src/components/KeySentenceFlow.jsx']
// 특정 교재 브랜드명과 권·단원 번호 체계(콘텐츠 구조가 교재 배열을 따르지 않음을 지킨다). 설명 주석의 '교재'라는 낱말 자체는 금지하지 않는다
const BRAND_RE = /let'?s ?smile|lets_smile|smile ?\d|book ?\d|unit ?\d|lesson ?\d|\d\s*권|\d\s*단원/i
check('콘텐츠 모듈에 특정 교재명·권·단원 참조 없음', CONTENT.every((p) => !BRAND_RE.test(read(p))), CONTENT.filter((p) => BRAND_RE.test(read(p))).join(','))
check('회차는 우리 시간표(요일·날짜)로만 이어지고 교재 단원 번호를 쓰지 않음', STORY_EPISODES.every((e) => !/unit|lesson|단원/i.test(e.titleKo + e.summaryKo + e.nextHookKo)))

// ── 출처·제작 근거 기록 존재 ──
const doc = read('docs/design/CURRICULUM_INDEPENDENCE_2026-10-08.md')
check('설계 문서에 출처 기록·독립성 감사·목표 모델·교사 선택 설계 섹션 존재', ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.'].every((h) => doc.includes(h)) && /출처/.test(doc) && /의사소통 목표/.test(doc) && /학습 목표.*선택|선생님.*선택/.test(doc))

if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
