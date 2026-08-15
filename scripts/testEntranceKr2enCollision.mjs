// 입실시험 kr2en 동의어 충돌 회귀 테스트 (2026-08-15, 운영자 승인 1안)
//
// 실사고: 2026-08-14 고1 입실시험(direction='mixed')에서 같은 시험 단어
// 풀에 work out="운동하다"와 exercise="운동하다; 운동"이 공존했다. kr2en
// (한글 뜻 제시 -> 영어 입력) 문항으로 "운동하다; 운동"이 나왔을 때 정답이
// exercise 하나로 고정돼, 학생이 동의어 work out을 입력하면 오답 처리됐다
// (실제 학생 2명 피해). 채점 규칙(isSpellingCorrect/gradeEntranceAnswer)은
// 그대로 두고, 문항별 방향이 배정되는 mixed/random 모드에서 뜻이 겹치는
// 다른 단어가 시험 풀에 있는 단어에는 애초에 kr2en을 배정하지 않는다
// (en2kr로 고정 — en2kr은 다중 정답을 전부 인정하므로 겹침이 문제 되지
// 않는다). 고정 방향 시험(direction 전체 en2kr|kr2en)은 서버
// (api/submit-entrance-result.js)가 answers의 direction이 시험 direction과
// 일치하는지 검증하므로 절대 건드리지 않는다 — 그 시험류에서 겹치는 뜻의
// 단어가 나오는 잔여 위험은 알려진 한계로 남는다.
//
// 네트워크 0, 순수 fixture. src/utils/spelling.js + entranceTest.js만 검증.
import { answersOverlap } from '../src/utils/spelling.js'
import { assignDirections, buildEntranceQuestions } from '../src/utils/entranceTest.js'

let failures = 0
const check = (label, cond, extra) => {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`, extra !== undefined ? JSON.stringify(extra) : ''); failures++ }
}
const mkRng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

// ── 픽스처 ────────────────────────────────────────────────────────────
// 실사고 재현 단어 2개 + 서로 겹치지 않는 filler 6개(count=8 시험 균형용).
const COLLISION_WORDS = [
  { word: 'work out', meaning: '운동하다' },
  { word: 'exercise', meaning: '운동하다; 운동' },
]
const FILLER_WORDS = [
  { word: 'apple', meaning: '사과' },
  { word: 'book', meaning: '책' },
  { word: 'run', meaning: '달리다' },
  { word: 'happy', meaning: '행복한' },
  { word: 'window', meaning: '창문' },
  { word: 'travel', meaning: '여행하다' },
]
const POOL = [...COLLISION_WORDS, ...FILLER_WORDS]
const COLLISION_TEXTS = new Set(COLLISION_WORDS.map((w) => w.word))

console.log('\n1. answersOverlap 단위 계약')
{
  check("('운동하다','운동하다; 운동') = true", answersOverlap('운동하다', '운동하다; 운동') === true)
  check("('운동하다; 운동','운동하다') = true", answersOverlap('운동하다; 운동', '운동하다') === true)
  check("('과정; 처리하다','제공하다') = false", answersOverlap('과정; 처리하다', '제공하다') === false)
  check("('종류','종류; 유형') = true", answersOverlap('종류', '종류; 유형') === true)
  check("(null,'x') = false", answersOverlap(null, 'x') === false)
  check("('x',null) = false", answersOverlap('x', null) === false)
  check("('','') = false", answersOverlap('', '') === false)
  check("자기 자신과는 true(참고용, 로직에서는 word 텍스트로 별도 제외)", answersOverlap('운동하다', '운동하다') === true)
  check("무관한 뜻끼리는 false", answersOverlap('사과', '책') === false)
}

console.log('\n2. mixed 모드 — 충돌 단어(work out/exercise)는 절대 kr2en을 받지 않는다 (50 시드)')
{
  let allOk = true
  const offenders = []
  for (let seed = 1; seed <= 50; seed++) {
    const qs = buildEntranceQuestions(POOL, { count: 8, direction: 'mixed', rng: mkRng(seed * 97 + 3) })
    for (const q of qs) {
      if (COLLISION_TEXTS.has(q.word) && q.direction === 'kr2en') {
        allOk = false
        offenders.push({ seed, word: q.word })
      }
    }
  }
  check('50개 시드 전부에서 work out/exercise가 kr2en으로 출제되지 않음', allOk, offenders.slice(0, 5))
}

console.log('\n3. mixed 균형 — 충돌 스왑 후에도 kr2en 개수가 assignDirections 결과와 동일')
{
  let allOk = true
  for (let seed = 1; seed <= 20; seed++) {
    const rng1 = mkRng(seed * 13 + 5)
    const baseline = assignDirections(8, 'mixed', { rng: rng1, fallback: 'en2kr' })
    const baselineKr2en = baseline.filter((d) => d === 'kr2en').length

    const rng2 = mkRng(seed * 13 + 5) // 동일 시드로 buildEntranceQuestions 재현
    const qs = buildEntranceQuestions(POOL, { count: 8, direction: 'mixed', rng: rng2 })
    const builtKr2en = qs.filter((q) => q.direction === 'kr2en').length

    if (builtKr2en !== baselineKr2en) allOk = false
  }
  check('20개 시드 전부에서 kr2en 개수 불변(스왑은 맞바꾸기만 함)', allOk)
}

console.log('\n4. random 모드에서도 충돌 단어 kr2en 금지')
{
  let allOk = true
  for (let seed = 1; seed <= 50; seed++) {
    const qs = buildEntranceQuestions(POOL, { count: 8, direction: 'random', rng: mkRng(seed * 61 + 11) })
    for (const q of qs) {
      if (COLLISION_TEXTS.has(q.word) && q.direction === 'kr2en') allOk = false
    }
  }
  check('random 모드 50개 시드 전부 충돌 단어 kr2en 없음', allOk)
}

console.log('\n5. 고정 방향 시험 — 절대 불변(서버 direction 검증 계약 보호)')
{
  for (let seed = 1; seed <= 5; seed++) {
    const en2kr = buildEntranceQuestions(POOL, { count: 8, direction: 'en2kr', rng: mkRng(seed) })
    check(`고정 en2kr(시드${seed}): 전 문항 en2kr 그대로`, en2kr.every((q) => q.direction === 'en2kr'))

    const kr2en = buildEntranceQuestions(POOL, { count: 8, direction: 'kr2en', rng: mkRng(seed) })
    check(`고정 kr2en(시드${seed}): 전 문항 kr2en 그대로(변경 금지)`, kr2en.every((q) => q.direction === 'kr2en'))
  }
}

console.log('\n6. 비충돌 풀 — 동일 rng 시드로 수정 전/후 dirs 동일(스왑 미발동, 무회귀)')
{
  // buildEntranceQuestions는 내부에서 shuffle(pool, rng) 이후 이어서
  // assignDirections(picked.length, dir, { rng }) 를 호출한다(같은 rng
  // 객체를 이어 쓴다) — 그래서 dirs만 떼어 assignDirections를 새 rng로
  // "단독" 호출하면 shuffle이 이미 소비한 난수만큼 스트림이 어긋나 비교가
  // 무의미해진다. 여기서는 entranceTest.js의 shuffle 알고리즘(Fisher–Yates)
  // 을 그대로 복제해 "스왑 로직이 없던 이전 buildEntranceQuestions"와 동일한
  // 난수 소비 순서를 재현한 뒤 비교한다 — 충돌이 없는 풀에서는 새 스왑 로직이
  // 절대 개입하지 않으므로 두 결과가 완전히 같아야 한다.
  const legacyShuffle = (arr, rng) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const legacyBuildDirs = (words, { count, direction, rng }) => {
    const pool = (words || []).filter((w) => w && w.word && w.meaning)
    const picked = legacyShuffle(pool, rng).slice(0, Math.max(0, Math.min(count, pool.length)))
    return assignDirections(picked.length, direction, { rng, fallback: 'en2kr' })
  }

  let allOk = true
  for (let seed = 1; seed <= 20; seed++) {
    const legacy = legacyBuildDirs(FILLER_WORDS, { count: FILLER_WORDS.length, direction: 'mixed', rng: mkRng(seed * 29 + 7) })
    const qs = buildEntranceQuestions(FILLER_WORDS, { count: FILLER_WORDS.length, direction: 'mixed', rng: mkRng(seed * 29 + 7) })
    const built = qs.map((q) => q.direction)
    if (JSON.stringify(built) !== JSON.stringify(legacy)) allOk = false
  }
  check('충돌 없는 필러 전용 풀: buildEntranceQuestions의 방향 배열이 스왑-이전 로직(shuffle+assignDirections)과 완전 일치', allOk)
}

console.log('\n7. prompt/answer 파생 일관성 — 기존 계약 유지(direction 스왑 후에도)')
{
  let allOk = true
  for (let seed = 1; seed <= 10; seed++) {
    const qs = buildEntranceQuestions(POOL, { count: 8, direction: 'mixed', rng: mkRng(seed * 71 + 2) })
    for (const q of qs) {
      if (q.direction === 'en2kr') {
        if (q.prompt !== q.word || q.answer !== q.meaning) allOk = false
      } else if (q.direction === 'kr2en') {
        if (q.prompt !== q.meaning || q.answer !== q.word) allOk = false
      } else {
        allOk = false
      }
    }
  }
  check('en2kr: prompt=word/answer=meaning, kr2en: prompt=meaning/answer=word — 스왑 후에도 유지', allOk)
}

console.log(failures === 0
  ? '\n모든 단언 통과 — 입실시험 kr2en 동의어 충돌 회피 고정 ✅'
  : `\n${failures}개 단언 실패 ❌`)
process.exit(failures > 0 ? 1 : 0)
