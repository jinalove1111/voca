// 2026-10-10 그림 상황 미션(Paul Town 공원) — 순수 데이터 검증·문장 생성 도우미(React·PNG 없음).
// 단원의 unit.scene 한 덩어리로 단계 카드를 만든다. 문장·정답·버튼은 항상 실제 UI이고 그림에 구워 넣지 않는다.
export const SCENE_KINDS = ['discover', 'compare', 'choose', 'build', 'read', 'listen', 'speak', 'write', 'finish']
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five']
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length
const sing = (o) => String(o?.en || '').replace(/^an? /i, '')

// 목록 항목({obj, n?})을 obj별 개수로 센다(n 생략 시 1) — 배치된 물건({obj,x,y})도 그대로 센다
export const tally = (list) => (list || []).reduce((m, it) => { m[it.obj] = (m[it.obj] || 0) + (it.n ?? 1); return m }, {})
export function countsMatch(a, b) {
  const x = tally(a), y = tally(b)
  const ks = new Set([...Object.keys(x), ...Object.keys(y)])
  return [...ks].every((k) => (x[k] || 0) === (y[k] || 0))
}

// layout [{obj:'tree',n:2}] → 'There are two trees.' / [{dog,1}] → 'There is a dog.' (여러 물건이면 and로 잇고 동사는 첫 물건 기준)
export function layoutSentence(scene, layout) {
  const parts = (layout || []).map(({ obj, n }) => {
    const o = scene.objects[obj]
    return n === 1 ? `a ${sing(o)}` : `${NUMS[n] || n} ${o.enPlural}`
  })
  const first = layout?.[0]
  return `There ${first && first.n === 1 ? 'is' : 'are'} ${parts.join(' and ')}.`
}

// 만들기 단계의 빈 자리 위치(viewBox 360x220, x=가운데·y=바닥)
export const spotPositions = (n) => Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 210 : Math.round(96 + (i * 228) / (n - 1)), y: 186 }))

export function validateScene(scene) {
  const e = []
  if (!scene || typeof scene !== 'object') return ['scene 없음']
  const objs = scene.objects || {}
  if (!scene.id || !scene.titleKo || !scene.bgKo) e.push('id·titleKo·bgKo 필요')
  if (!Object.keys(objs).length || !Object.values(objs).every((o) => o.en && o.enPlural && o.ko)) e.push('objects: en·enPlural·ko 필요')
  const steps = scene.steps || []
  if (steps.map((s) => s.kind).join() !== SCENE_KINDS.join()) e.push(`steps 종류·순서: ${steps.map((s) => s.kind).join()}`)
  const lay = (l, w) => { if (!Array.isArray(l) || !l.length || !l.every((x) => objs[x.obj] && Number.isInteger(x.n) && x.n >= 1)) e.push(`${w}: layout 오류`) }
  const en = (s, w) => { if (!s || words(s) > 8) e.push(`${w}: 영어 8단어 이하(${s})`) }
  for (const s of steps) {
    if (!s.stepKo) e.push(`${s.kind}: stepKo 없음`)
    if (s.kind === 'discover') { lay(s.layout, 'discover'); en(s.tap?.en, 'discover.tap') }
    if (s.kind === 'compare') { lay(s.left?.layout, 'compare.left'); lay(s.right?.layout, 'compare.right'); en(s.left?.en, 'compare.left'); en(s.right?.en, 'compare.right') }
    if (s.kind === 'choose') {
      if (!s.items?.length) e.push('choose: items 없음')
      for (const it of s.items || []) { lay(it.layout, 'choose'); en(it.frame, 'choose.frame'); if (it.options?.length !== 2 || ![0, 1].includes(it.correct)) e.push(`choose: 보기 2개·correct 0/1 (${it.frame})`) }
    }
    if (s.kind === 'build') {
      if (!objs[s.place?.obj] || !(s.place?.n >= 1) || !(s.slots >= s.place.n)) e.push('build: place·slots 오류(place.n <= slots)')
      en(s.frameEn, 'build.frame'); en(s.answerEn, 'build.answer'); (s.acceptEn || []).forEach((x) => en(x, 'build.accept'))
      if (!(s.acceptEn || []).includes(s.answerEn)) e.push('build: acceptEn에 answerEn 포함 필요')
    }
    if (s.kind === 'read') { if (!s.pairs || s.pairs.length < 2) e.push('read: pairs 2개 이상'); (s.pairs || []).forEach((p) => { en(p.en, 'read'); lay(p.layout, 'read') }) }
    if (s.kind === 'listen') {
      if (!s.items?.length) e.push('listen: items 없음')
      for (const it of s.items || []) { en(it.en, 'listen'); const k = it.options?.length; if (!(k >= 2 && k <= 3) || !(it.correct >= 0 && it.correct < k)) e.push(`listen: 보기 2~3개·correct (${it.en})`); (it.options || []).forEach((o) => lay(o.layout, 'listen')) }
    }
    if (s.kind === 'speak') { if (!s.practice?.situationKo || !s.exam?.situationKo) e.push('speak: practice·exam situationKo'); en(s.practice?.modelEn, 'speak.practice'); en(s.exam?.modelEn, 'speak.exam'); [...(s.practice?.alternatives || []), ...(s.exam?.alternatives || [])].forEach((x) => en(x, 'speak.alt')) }
    if (s.kind === 'write') { if (!s.promptKo) e.push('write: promptKo'); en(s.exampleEn, 'write.example') }
    if (s.kind === 'finish') { if (!s.canDoKo?.length || !s.paulKo) e.push('finish: canDoKo·paulKo') }
  }
  return e
}

const TITLE = { discover: '찾아보기', compare: '비교하기', choose: '고르기', build: '공원 만들기', read: '읽고 짝짓기', listen: '듣고 고르기', speak: '말하기', write: '쓰기', finish: '마무리 미션' }
// unit.scene → 순서 있는 카드. choose·listen은 문항마다, speak는 연습·시험 두 장, 나머지는 한 장.
export function sceneCards(unit) {
  const out = []
  const push = (step, extra = {}) => out.push({ id: `scene-${step.kind}-${out.length}`, kind: 'scene', sceneKind: step.kind, stepKo: step.stepKo, title: TITLE[step.kind], step, itemIndex: 0, ...extra })
  for (const s of unit?.scene?.steps || []) {
    if (s.kind === 'choose') s.items.forEach((it, i) => push(s, { itemIndex: i, label: it.promptKo || it.frame }))
    else if (s.kind === 'listen') s.items.forEach((_, i) => push(s, { itemIndex: i, label: '듣고 맞는 그림 고르기' }))
    else if (s.kind === 'speak') { push(s, { itemIndex: 0, mode: 'practice', title: '말하기 연습' }); push(s, { itemIndex: 1, mode: 'exam', title: '말하기 시험', stepKo: '말하기 시험' }) }
    else push(s, { label: s.promptKo || TITLE[s.kind] })
  }
  return out
}

// 연습(결과를 세는) 장면 카드: 고르기·듣기·만들기·읽기, 그리고 말하기 시험
export const isScenePractice = (c) => c.kind === 'scene' && (['choose', 'listen', 'build', 'read'].includes(c.sceneKind) || (c.sceneKind === 'speak' && c.mode === 'exam'))

// 만들기 문장틀: 실제로 놓은 수(n)에서 만든다. 0개면 데이터의 틀 그대로(보기 없음), 1개면 'There is ___ tree.'(정답 a), 2개 이상이면 'There are ___ trees.'(정답 = 숫자 단어)
export function buildFrame(scene, step, n) {
  const o = scene.objects[step.place.obj]
  if (n < 1) return { frame: step.frameEn, options: [], correct: -1 }
  if (n === 1) return { frame: `There is ___ ${sing(o)}.`, options: ['a', 'one', 'two', 'three'], correct: 0 }
  return { frame: `There are ___ ${o.enPlural}.`, options: NUMS.slice(1, Math.max(3, step.slots) + 1), correct: n - 1 }
}
