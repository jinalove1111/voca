// 폴 선생님 리액션 데이터/랜덤 선택 로직 검증.
//
// paulReactions.js가 이제 실제 PNG를 정적 import하므로(CTO 설계 변경 —
// 개별 PNG Asset 방식) 순수 Node ESM으로는 .png를 못 읽는다 — 이 파일을
// `node scripts/testPaulReactions.mjs`로 바로 실행하면 실패함. 반드시
// esbuild로 먼저 번들해서 실행할 것(--loader:.png=dataurl이 이미지를
// data URI 문자열로 치환해줌 — testTtsSingleton.mjs가 speech.js를
// 번들하는 것과 같은 패턴):
//   npx esbuild scripts/testPaulReactions.mjs --bundle --format=esm \
//     --platform=node --loader:.png=dataurl \
//     --outfile=scripts/.tmp/testPaulReactions.bundle.mjs
//   node scripts/.tmp/testPaulReactions.bundle.mjs
import assert from 'node:assert/strict'
import { PAUL_REACTIONS, pickReaction, getReactionById, resolveReaction, pickMessage } from '../src/utils/paulReactions.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 모든 리액션이 필수 필드를 다 갖고 있고, image가 실제 로드된 값(빈 문자열 아님)임')
{
  const ok = PAUL_REACTIONS.every(r =>
    typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.category === 'string' &&
    typeof r.image === 'string' && r.image.length > 0 &&
    typeof r.message === 'string' &&
    ('sound' in r) &&
    typeof r.rarity === 'string' &&
    !('emoji' in r) // CTO 설계 변경: emoji 필드/대체 완전히 폐기됨
  )
  check(`${PAUL_REACTIONS.length}개 모두 {id,category,image,message,sound,rarity} 형태, emoji 필드 없음`, ok)
  check('id가 모두 유일함', new Set(PAUL_REACTIONS.map(r => r.id)).size === PAUL_REACTIONS.length)
  check('실제 개별 PNG가 있는 17개만 등록됨(나머지는 존재하지 않는 파일을 가리키지 않음)', PAUL_REACTIONS.length === 17)
}

console.log('\n2. getReactionById — id로 정확히 지정 가능(쓰기 4단계처럼 랜덤이면 안 되는 곳)')
{
  check('thinking을 정확히 찾음', getReactionById('thinking')?.id === 'thinking')
  check('없는 id는 null', getReactionById('nope') === null)
  check('아직 PNG 없는 id(예: retry)도 null(이모지 대체 없이 실패로 처리)', getReactionById('retry') === null)
}

console.log('\n3. pickReaction — 같은 카테고리 안에서는 항상 그 카테고리 것만 나옴')
{
  let ok = true
  for (let i = 0; i < 100; i++) {
    const r = pickReaction('success')
    if (!r || r.category !== 'success') { ok = false; break }
  }
  check('success 카테고리만 100번 연속 정상 반환', ok)
}

console.log('\n4. pickReaction — 같은 캐릭터가 연속으로 반복되지 않음')
{
  let sawRepeat = false
  let last = null
  for (let i = 0; i < 200; i++) {
    const r = pickReaction('success') // success 카테고리는 6개라 반복 방지가 의미 있음
    if (last && r.id === last) sawRepeat = true
    last = r.id
  }
  check('200번 연속 뽑아도 바로 직전과 같은 캐릭터가 절대 안 나옴', !sawRepeat)
}

console.log('\n5. pickReaction — 카테고리에 1개뿐이면(levelup) 그냥 그걸 반환(반복 방지 때문에 null이 되면 안 됨)')
{
  let ok = true
  for (let i = 0; i < 10; i++) {
    const r = pickReaction('levelup')
    if (!r || r.id !== 'levelup') { ok = false; break }
  }
  check('levelup처럼 후보가 1개뿐이어도 매번 정상 반환', ok)
}

console.log('\n6. pickReaction — 존재하지 않는 카테고리/캐릭터는 null(이모지로 대체하지 않고 조용히 실패)')
{
  check('없는 카테고리는 null', pickReaction('no-such-category') === null)
  check('아직 개별 PNG가 없는 캐릭터(brand)도 null', pickReaction('brand') === null)
}

console.log('\n7. 3개 카테고리(success/fail/study) 구조가 실제 src/assets/paul/ PNG 파일 17개와 정확히 일치')
{
  const byCategory = { success: 6, fail: 6, study: 5 }
  for (const [cat, count] of Object.entries(byCategory)) {
    check(`${cat} 카테고리 ${count}개`, PAUL_REACTIONS.filter(r => r.category === cat).length === count)
  }
}

console.log('\n8. 이전 호출부 하위호환 — pickReaction("encourage")/pickReaction("levelup")이 여전히 정상 동작')
{
  let ok = true
  for (let i = 0; i < 30; i++) {
    const r = pickReaction('encourage')
    if (!r || !['thinking', 'almost', 'one_more'].includes(r.id)) { ok = false; break }
  }
  check('pickReaction("encourage")가 격려 계열 이미지 중 하나를 계속 정상 반환', ok)
  check('pickReaction("levelup")은 항상 levelup 이미지', pickReaction('levelup')?.id === 'levelup')
}

console.log('\n9. resolveReaction — type prop 하나로 id/카테고리/메시지별칭을 전부 처리')
{
  check('type="thinking"(정확한 id)', resolveReaction('thinking')?.id === 'thinking')
  check('type="success"(카테고리)', resolveReaction('success')?.category === 'success')
  check('type="fail"(카테고리)', resolveReaction('fail')?.category === 'fail')
  check('type="levelup"(정확한 id)', resolveReaction('levelup')?.id === 'levelup')
  check('type="complete"(메시지별칭, 전용 이미지 없어 success 재사용) -> success 카테고리 이미지', resolveReaction('complete')?.category === 'success')
  check('type="brand"(아직 PNG 없음) -> null, 이모지로 대체 안 됨', resolveReaction('brand') === null)
}

console.log('\n10. 메시지 랜덤 — 이미지와 별개로 5개 카테고리에서 반복 없이 뽑힘')
{
  let sawRepeat = false, last = null
  for (let i = 0; i < 50; i++) {
    const m = pickMessage('encourage')
    if (last && m === last) sawRepeat = true
    last = m
  }
  check('encourage 메시지 50번 연속 뽑아도 직전과 동일한 문구 없음', !sawRepeat)
  check('없는 메시지 카테고리는 null', pickMessage('no-such') === null)
}

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
