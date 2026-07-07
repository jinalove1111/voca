// 폴 선생님 리액션 데이터/랜덤 선택 로직 검증 — 브라우저 의존성이 없는
// 순수 모듈이라 esbuild 번들 없이 바로 import 가능(testTtsSingleton.mjs와
// 달리 window를 건드리지 않음).
import assert from 'node:assert/strict'
import { PAUL_REACTIONS, pickReaction, getReactionById, resolveReaction, pickMessage } from '../src/utils/paulReactions.js'

let failures = 0
function check(label, cond) {
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}`); failures++ }
}

console.log('\n1. 모든 리액션이 필수 필드를 다 갖고 있음')
{
  const ok = PAUL_REACTIONS.every(r =>
    typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.category === 'string' &&
    typeof r.image === 'string' && r.image.startsWith('/assets/paul/') &&
    typeof r.emoji === 'string' &&
    typeof r.message === 'string' &&
    ('sound' in r) &&
    typeof r.rarity === 'string'
  )
  check(`${PAUL_REACTIONS.length}개 모두 {id,category,image,emoji,message,sound,rarity} 형태`, ok)
  check('id가 모두 유일함', new Set(PAUL_REACTIONS.map(r => r.id)).size === PAUL_REACTIONS.length)
}

console.log('\n2. getReactionById — id로 정확히 지정 가능(쓰기 4단계처럼 랜덤이면 안 되는 곳)')
{
  check('thinking을 정확히 찾음', getReactionById('thinking')?.id === 'thinking')
  check('없는 id는 null', getReactionById('nope') === null)
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

console.log('\n4. pickReaction — 같은 캐릭터가 연속으로 반복되지 않음(요청사항 11)')
{
  let sawRepeat = false
  let last = null
  for (let i = 0; i < 200; i++) {
    const r = pickReaction('success') // success 카테고리는 5개라 반복 방지가 의미 있음
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

console.log('\n6. pickReaction — 존재하지 않는 카테고리는 null(화면이 죽지 않고 조용히 무시)')
{
  check('없는 카테고리는 null', pickReaction('no-such-category') === null)
}

console.log('\n7. 3개 폴더(success/retry/etc) 구조와 28개 파일명이 기획안과 정확히 일치')
{
  const byFolder = { success: 8, retry: 10, etc: 10 }
  for (const [folder, count] of Object.entries(byFolder)) {
    check(`${folder} 폴더 ${count}개`, PAUL_REACTIONS.filter(r => r.category === folder).length === count)
  }
  check('총 28개', PAUL_REACTIONS.length === 28)
}

console.log('\n8. 이전 호출부 하위호환 — pickReaction("encourage")/pickReaction("levelup")이 여전히 정상 동작(폴더명이 success/retry/etc로 바뀌어도 기존 화면 안 깨짐)')
{
  let ok = true
  for (let i = 0; i < 30; i++) {
    const r = pickReaction('encourage')
    if (!r || !['thinking','almost','retry','cheerup','one_more','fight'].includes(r.id)) { ok = false; break }
  }
  check('pickReaction("encourage")가 격려 계열 이미지 중 하나를 계속 정상 반환', ok)
  check('pickReaction("levelup")은 항상 levelup 이미지', pickReaction('levelup')?.id === 'levelup')
}

console.log('\n9. resolveReaction — type prop 하나로 id/폴더/메시지별칭을 전부 처리(요청사항 5)')
{
  check('type="thinking"(정확한 id)', resolveReaction('thinking')?.id === 'thinking')
  check('type="success"(폴더)', resolveReaction('success')?.category === 'success')
  check('type="retry"(폴더)', resolveReaction('retry')?.category === 'retry')
  check('type="levelup"(정확한 id)', resolveReaction('levelup')?.id === 'levelup')
  check('type="fail"(메시지별칭) -> retry 폴더의 실패계열 이미지', ['its_ok','sad','cry','sorry'].includes(resolveReaction('fail')?.id))
}

console.log('\n10. 메시지 랜덤 — 이미지와 별개로 5개 카테고리에서 반복 없이 뽑힘(요청사항 7)')
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
