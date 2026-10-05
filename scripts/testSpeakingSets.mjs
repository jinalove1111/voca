// 2026-10-04 Speaking 세트(기본 5개 + 이야기 회차) — 정규화 항목과 이야기 콘텐츠 정적 검사(순수, 번들·네트워크 불필요)
import { SITUATION_EXPRESSIONS as EX } from '../src/utils/situation/situationContent.js'
import { STORY_EPISODES as EPS, STORY_ITEMS as ITEMS } from '../src/utils/situation/storyEpisodes.js'
import { listSets, itemsForSet, keySentenceFor, BASIC_SET_ID, DEFAULT_SET_ID, lastSetKey, loadLastSet, saveLastSet } from '../src/utils/situation/speakingSets.js'

let fail = 0
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fail++ }
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
const stripEnd = (s) => s.replace(/[.!?。…\s]+$/g, '')

// 기본 세트
const basic = itemsForSet(BASIC_SET_ID)
check('기본 세트 5개, hello..play 순서', basic.map((i) => i.id).join() === 'hello,help,sorry,thanks,play')
check('기본 세트 장면 a/b, exprId=id, 역할/답글 없음', basic.every((i) => i.exprId === i.id && i.practiceScene?.id === `${i.id}-a` && i.examScene?.id === `${i.id}-b` && i.roleKo === null && i.reply === null))
check('알 수 없는 setId는 기본 세트', itemsForSet('zzz').map((i) => i.id).join() === basic.map((i) => i.id).join())
const sets = listSets()
check('listSets: 기본 + 존재하는 회차', sets[0].id === 'basic' && sets.length === 1 + EPS.length && EPS.every((e) => sets.some((s) => s.id === e.id && s.labelKo === `${e.n}화 ${e.titleKo}`)))

// 이야기 콘텐츠
const ids = ITEMS.map((i) => i.id)
const basicIds = new Set(EX.map((e) => e.id))
check('item id 고유 + sEE-OO 형식', new Set(ids).size === ids.length && ids.every((id) => /^s\d{2}-\d{2}$/.test(id)))
check('id와 episode/order 일치', ITEMS.every((i) => i.id === `s${String(i.episode).padStart(2, '0')}-${String(i.order).padStart(2, '0')}`))
check('회차 id epNN 연속(1부터)', EPS.every((e, k) => e.n === k + 1 && e.id === `ep${String(e.n).padStart(2, '0')}`) && ITEMS.every((i) => EPS.some((e) => e.n === i.episode)))
let newCount = 0, reviewCount = 0
for (const e of EPS) {
  const mine = ITEMS.filter((i) => i.episode === e.n)
  const news = mine.filter((i) => i.kind === 'new')
  const revs = mine.filter((i) => i.kind === 'review')
  newCount += news.length; reviewCount += revs.length
  check(`${e.id}: new 10개 order 1..10`, news.length === 10 && news.map((i) => i.order).sort((a, b) => a - b).join() === '1,2,3,4,5,6,7,8,9,10')
  check(`${e.id}: review order>=11, reviewOf가 기존 id`, revs.every((i) => i.order >= 11 && i.reviewOf && (basicIds.has(i.reviewOf) || ids.includes(i.reviewOf))))
  check(`${e.id}: itemsForSet 순서 order 오름차순, new 뒤에 review`, itemsForSet(e.id).map((i) => i.id).join() === [...mine].sort((a, b) => a.order - b.order).map((i) => i.id).join())
}
const targets = ITEMS.filter((i) => i.kind === 'new').map((i) => norm(i.en))
const basicNorm = new Set(EX.map((e) => norm(e.en)))
check('new 목표 en 유일(대소문자/문장부호 무시)', new Set(targets).size === targets.length)
check('new 목표가 기본 5문장과 다름', targets.every((t) => !basicNorm.has(t)))
check('situationKo/roleKo ≤60자, 영어 글자 없음', ITEMS.every((i) => [i.situationKo, i.roleKo].every((t) => t && t.length <= 60 && !/[A-Za-z]/.test(t))))
check('situationKo/roleKo가 자기 뜻(ko)을 담지 않음', ITEMS.every((i) => !i.situationKo.includes(stripEnd(i.ko)) && !i.roleKo.includes(stripEnd(i.ko))))
const SPEAKERS = ['Jamie', 'Mia', 'Paul', 'Cookie', 'Shopkeeper', 'Guest']
check('reply.speaker 허용 목록, reply.en/ko 비어있지 않음', ITEMS.every((i) => i.reply && SPEAKERS.includes(i.reply.speaker) && i.reply.en?.trim() && i.reply.ko?.trim()))
check('alternatives 비어있지 않은 문자열 배열', ITEMS.every((i) => Array.isArray(i.alternatives) && i.alternatives.length > 0 && i.alternatives.every((a) => typeof a === 'string' && a.trim())))
check('level 1..3', ITEMS.every((i) => [1, 2, 3].includes(i.level)))
check('reuseIn id는 sEE-OO 형식(뒤 회차 id 허용)', ITEMS.every((i) => (i.reuseIn || []).every((r) => /^s\d{2}-\d{2}$/.test(r))))
// 208차 리드 보강(10화 완성 후): 연결이 실제로 존재하고 양방향인지
const ITEM_IDS = new Set(ITEMS.map((i) => i.id))
check('reuseIn id가 모두 실제 문항', ITEMS.every((i) => (i.reuseIn || []).every((r) => ITEM_IDS.has(r))), ITEMS.flatMap((i) => (i.reuseIn || []).filter((r) => !ITEM_IDS.has(r))).join(','))
const storyReviews = ITEMS.filter((i) => i.kind === 'review' && /^s\d{2}-\d{2}$/.test(i.reviewOf || ''))
check('이야기 문항을 복습하면 원래 문항 reuseIn에 역방향 기록', storyReviews.every((rv) => (ITEMS.find((s) => s.id === rv.reviewOf)?.reuseIn || []).includes(rv.id)), storyReviews.filter((rv) => !(ITEMS.find((s) => s.id === rv.reviewOf)?.reuseIn || []).includes(rv.id)).map((rv) => rv.id).join(','))
check('복습 대사는 원래 문항(또는 기본 표현)과 같은 영어', ITEMS.filter((i) => i.kind === 'review').every((rv) => { const src = ITEMS.find((s) => s.id === rv.reviewOf) || EX.find((b) => b.id === rv.reviewOf); return !!src && src.en === rv.en }))
check('10회차 모두 존재, 새 목표 정확히 100개', EPS.length === 10 && ITEMS.filter((i) => i.kind === 'new').length === 100)
// 2026-10-05 오늘 기억할 한 문장(ep02 QA 전용)
const ks = keySentenceFor('ep02')
check('keySentenceFor: basic/ep01 null, ep02 있음', keySentenceFor('basic') === null && keySentenceFor('ep01') === null && !!ks)
const ksItem = ITEMS.find((i) => i.id === ks?.itemId)
check('keySentence.itemId 문항의 en/ko가 keySentence와 같음', !!ksItem && ksItem.en === ks.en && ksItem.ko === ks.ko && ks.en === 'Can I borrow a pencil?')
check('흐름 상대는 미아 한 명(recall·transfer·reply·짧은 대화), transfer는 recall과 다른 상황', ks.recall.partner === 'Mia' && ks.transfer.partner === 'Mia' && ks.transfer.reply.speaker === 'Mia' && ks.transfer.situationKo !== ks.recall.situationKo && ks.introIds.length > 0 && ks.introIds.every((id) => ITEMS.find((i) => i.id === id)?.reply.speaker === 'Mia'))
check('흐름 한글 텍스트에 제이미 없음', ![ks.watch.situationKo, ks.recall.situationKo, ks.recall.roleKo, ks.transfer.situationKo, ks.transfer.roleKo].some((t) => t.includes('제이미')))
check('짧은 대화 문항의 영어가 키 문장 틀(Can I/borrow)을 담지 않음', ks.introIds.every((id) => !/can i|borrow/i.test(ITEMS.find((i) => i.id === id).en + ' ' + ITEMS.find((i) => i.id === id).reply.en)))
const KS_TEXTS = [ks.goalKo, ks.watch?.situationKo, ks.recall.situationKo, ks.recall.roleKo, ks.transfer.situationKo, ks.transfer.roleKo, ksItem.situationKo, ksItem.roleKo]
const STEMS = ['인사', '안녕', '반가', '미안', '사과', '고마', '감사', '도와', '도움', '부탁', '다시 말해']
check('keySentence 한글 텍스트 ≤60자·영어 글자 없음', KS_TEXTS.every((t) => t && t.length <= 60 && !/[A-Za-z]/.test(t)))
check('keySentence 상황·역할 텍스트에 빌려/빌리·답 어간·자기 뜻 없음(goalKo는 라벨이라 빌리는 말 허용)', KS_TEXTS.every((t) => (t === ks.goalKo || !/빌려|빌리/.test(t)) && !STEMS.some((w) => t.includes(w)) && !t.includes(stripEnd(ks.ko))))
check('다른 문항에 같은 영어 문장 없음(키 문장은 s02-03 하나)', ITEMS.filter((i) => norm(i.en) === norm(ks.en)).length === 1)
check('ep02 situationKo/roleKo에 빌려/빌리 없음(키 문장 문항)', !/빌려|빌리/.test(ksItem.situationKo + ksItem.roleKo))
// 2026-10-05 진입 세트: 첫 방문 2화, 고른 세트 기억(UUID 키만), 잘못된 값·저장 실패는 기본값
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m } }
const UID = 'e2e00000-0000-4000-8000-00000000a001'
const st = mem()
check('진입 세트: 첫 방문은 ep02이고 keySentence 있음', DEFAULT_SET_ID === 'ep02' && loadLastSet(st, UID) === 'ep02' && !!keySentenceFor(DEFAULT_SET_ID))
check('진입 세트: 고른 세트 기억(ep05, basic)', saveLastSet(st, UID, 'ep05') && loadLastSet(st, UID) === 'ep05' && saveLastSet(st, UID, BASIC_SET_ID) && loadLastSet(st, UID) === BASIC_SET_ID)
check('진입 세트: 키는 UUID만(이름·빈 값은 저장 안 함, 키 null)', lastSetKey('Paul') === null && lastSetKey('') === null && !saveLastSet(st, 'Paul', 'ep01') && lastSetKey(UID).endsWith(UID) && [...st.m.keys()].every((k) => k.endsWith(UID)))
st.setItem(lastSetKey(UID), 'ep99')
check('진입 세트: 없는 세트 값은 기본값, 없는 세트 저장 거부', loadLastSet(st, UID) === 'ep02' && !saveLastSet(st, UID, 'ep99'))
const boom = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
check('진입 세트: storage 예외는 기본값/false(화면 계속 동작)', loadLastSet(boom, UID) === 'ep02' && saveLastSet(boom, UID, 'ep01') === false)
// 2026-10-05(215차) 2화 일반 연습도 Paul·미아 이야기 — 제이미 없음, 정지 장면 5문항
const EP2I = ITEMS.filter((i) => i.episode === 2)
check('2화 문항에 제이미 없음(상황·역할·영어·상대)', EP2I.every((i) => !/제이미|Jamie/.test(i.situationKo + i.roleKo + i.en + i.reply.en) && i.reply.speaker !== 'Jamie') && !/제이미/.test(EPS[1].summaryKo))
const STILL = { 's02-01': 'spoon/spoon', 's02-02': 'spoon/ask', 's02-03': 'spoon/ask', 's02-09': 'ask/ask', 's02-10': 'forgot/forgot' }
check('2화 정지 장면 연결 5문항(itemsForSet scene.pencil)', itemsForSet('ep02').filter((x) => x.practiceScene.pencil).map((x) => `${x.id}=${x.practiceScene.pencil.variant}/${x.practiceScene.pencil.still}`).join(',') === Object.entries(STILL).map(([k, v]) => `${k}=${v}`).join(',') && itemsForSet('ep01').every((x) => !x.practiceScene.pencil))
console.log(`INFO new 목표 ${newCount}개, 복습 문항 ${reviewCount}개`)

if (fail) { console.log(`\nFAILED ${fail}`); process.exit(1) }
console.log('\nALL PASS')
