// 폴 선생님 리액션 데이터/랜덤 선택 로직 검증 — 브라우저 의존성이 없는
// 순수 모듈이라 esbuild 번들 없이 바로 import 가능(testTtsSingleton.mjs와
// 달리 window를 건드리지 않음).
import assert from 'node:assert/strict'
import { PAUL_REACTIONS, pickReaction, getReactionById } from '../src/utils/paulReactions.js'

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

console.log(failures === 0 ? '\n모든 테스트 통과 ✅' : `\n${failures}개 테스트 실패 ❌`)
process.exit(failures === 0 ? 0 : 1)
