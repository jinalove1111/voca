// 2026-10-05 QA 전용 "오늘 기억할 한 문장" — KeySentenceFlow/PencilCaseScene 소스 핀(순수 정적 검사, 브라우저 불필요)
import fs from 'node:fs'

let fail = 0
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++ }
const read = (f) => fs.readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8')
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
const flow = strip(read('KeySentenceFlow.jsx'))
const scene = strip(read('PencilCaseScene.jsx'))
const menu = strip(read('SpeakingPractice.jsx'))

// PencilCaseScene
const texts = [...scene.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1])
check('Scene: <text> 존재(한글 이름표)하고 영어 글자 없음', texts.length > 0 && texts.every((t) => !/[A-Za-z]/.test(t.replace(/\{[^}]*\}/g, ''))))
const labelBlock = scene.slice(scene.indexOf('const LABEL = {'), scene.indexOf('\n}\n', scene.indexOf('const LABEL = {')))
const labelTexts = [...labelBlock.matchAll(/:\s*'([^']*)'/g)].map((m) => m[1])
check('Scene: aria-label 문구(1·2·3화 변형 전부)에 영어 글자 없음', labelTexts.length >= 15 && labelTexts.every((t) => !/[A-Za-z]/.test(t)))
check('Scene: reduced motion 처리(matchMedia + CSS 미디어쿼리)', /matchMedia\??\.?\(['"]\(prefers-reduced-motion: reduce\)['"]\)/.test(scene) && /@media \(prefers-reduced-motion: reduce\)/.test(scene))
check('Scene: 타이머 정리(clearTimeout)·반복 애니메이션 없음', /clearTimeout/.test(scene) && !/infinite/.test(scene))
check('Scene: Paul은 운영자 제공 기준 그림(assets/speaking/paul_speaking.png) 한 장 — 이전 저화질 마스코트 import 없음, 묻는 순간 ? 말풍선', scene.includes("../assets/speaking/paul_speaking.png") && !/from '\.\.\/assets\/paul'/.test(scene) && /const ASKING = \['ask', 'forgot', 'offer'\]/.test(scene) && scene.includes('key-scene-asking'))
check('Scene: 연필은 책상 위(FlatPencil)·빈 자리 점선 윤곽(data-my-spot)으로 표현, 손 그림 추가 없음', /function FlatPencil/.test(scene) && scene.includes('key-scene-empty-spot') && scene.includes('data-my-spot') && !/function (Hand|PaulHand)/.test(scene))
check('Flow: 보기 단계에 한국어 상황(ks.watch) 표시', /SituationGuide scene=\{\{ id: 'key-watch', situationKo: ks\.watch\.situationKo \}\}/.test(flow))
check('Scene: 상대는 미아 한 명 — 운영자 제공 분리본 4포즈(생각/놀람/연필 건네기/인사), 임시 SVG 인물·제이미 없음', ['mia_think.png', 'mia_surprise.png', 'mia_give_pencil.png', 'mia_greet.png'].every((f) => scene.includes(`../assets/speaking/${f}`)) && /spoon: 'surprise'/.test(scene) && /offer: 'give', handed: 'greet'/.test(scene) && !/function Partner|제이미|Jamie|lunchbox/.test(scene))
check('Scene: data-testid/data-variant/data-phase 노출', ['key-scene', 'data-variant', 'data-phase'].every((w) => scene.includes(w)))

// KeySentenceFlow
const speakCalls = [...flow.matchAll(/speak\(/g)].length
const speakInClick = [...flow.matchAll(/onClick=\{\(\) => speak\(/g)].length
check('Flow: speak 호출이 모두 onClick 안(자동 재생 없음)', speakCalls === speakInClick && speakCalls >= 2)
check('Flow: useEffect 안에 speak 없음', ![...flow.matchAll(/useEffect\(([\s\S]*?)\n\s*\)?\n/g)].some((m) => /speak/.test(m[1])) && !/useEffect\([^)]*speak/.test(flow))
check('Flow: 영어 문장(ks.en)은 Answer(revealed &&) 또는 watch 단계에서만 렌더', (flow.match(/\{ks\.en\}/g) || []).length === 2 && /\{revealed && <Answer/.test(flow))
check('Flow: 공개 전 구간(recall/transfer)에 ks.en/듣기 직접 렌더 없음', !/step !== 'watch'[\s\S]{0,1200}key-listen/.test(flow))
check('Flow: 금지 문구 없음', !/✅|정답|합격|완료|숙달|마스터|점수|⭐|기억했어요/.test(flow + scene))
check('Flow: 저장/네트워크 사용 없음', ![flow, scene].some((t) => /localStorage|sessionStorage|supabase|fetch\(|saveSession|indexedDB/.test(t)))
check('Flow: 단계 data-step·진행 표시·끝 화면 testid', ['data-step={step}', 'key-progress', 'key-end', 'key-reveal', 'key-sentence'].every((w) => flow.includes(w)))
check('Flow: 연습≠기억 문구', flow.includes('연습을 마쳤어요') && flow.includes('다음 수업에서 영어 없이 상황만'))

// 메뉴 진입
check('Menu: key 카드는 keySentenceFor 있을 때만, 한글 목표만 표시, 영어 문장 직접 없음', /\{key && \(/.test(menu) && menu.includes('key.goalKo') && !/Can I borrow/.test(menu) && !/\{key\.en\}/.test(menu))
const item = strip(read('SpeakingPracticeItem.jsx'))
check('PracticeItem: 정지 장면은 연습에서만(!exam && scene.pencil), lazy 로드', /\{!exam && scene\.pencil && <Suspense/.test(item) && /const PencilCaseScene = lazy\(\(\) => import\('\.\/PencilCaseScene'\)\)/.test(item))
check('화자 이름표: SPEAKER_KO 한 곳(PracticeItem)에서 Mia=미아, KeySentenceFlow는 가져다 씀', /export const SPEAKER_KO = \{[^}]*Mia: '미아'/.test(item) && /SPEAKER_KO \} from '\.\/SpeakingPracticeItem'/.test(flow) && !/const SPEAKER_KO/.test(flow))
check('Flow: 장면 변형은 하드코딩 없이 keySentence.scenes에서(보기 포함)', flow.includes('<PencilCaseScene variant={ks.scenes.watch} />') && !/variant="(spoon|whisper|idea)"/.test(flow))
check('Menu: KeySentenceFlow lazy 로드', /const KeySentenceFlow = lazy\(\(\) => import\('\.\/KeySentenceFlow'\)\)/.test(menu))

if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
