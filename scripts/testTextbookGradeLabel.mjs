// 교재 학년 라벨/생성 회귀 테스트 (2026-09-03, FAIL-first, 운영자 지시)
//
// 실사고: 운영자가 "중1 천재 이상기"를 새로 추가하려다, 관리자 교과서
// 배정 <select>가 이름만 보여줘("중1 천재 이상기"/"중2 천재 이상기" 둘 다
// 그냥 이름만) 학년이 다른 기존 "중2 천재 이상기"를 잘못 골랐다. 오늘
// 실제 DB에는 신규 textbooks INSERT가 없었다 — 문제는 데이터 계층이
// 아니라 순수 UI 구분성.
//
// 근본 원인(코드 사실, 읽기 전용 추적으로 확정, CLAUDE.md 규칙 15 —
// 회귀 의심 시 수정 전 FAIL 재현):
//   1. src/App.jsx:~349 학생 라벨 = tb.publisherName ? `${name} (${pub})`
//      : name — textbooks.name/publisher_name 그대로, 학년 유추 없음(정상).
//   2. src/utils/wordLibrary.js:~1218 createClass — 정확 이름 UNIQUE
//      매칭(23505 no-op)만, 학년/출판사 자동 채움·퍼지 매칭 없음(정상).
//   3. [결함] src/components/admin/TextbookAssignmentPanel.jsx:~178 —
//      "배정할 교과서" <select> 옵션이 tb.name만 렌더 → 이름이 같고
//      학년/출판사만 다른 두 교재를 구분 못 함. ClassTextbookLinks.jsx는
//      이미 이름+출판사 라벨(tbLabel)을 쓰고 있었다(구분 가능).
//   4. [결함] src/components/AdminScreen.jsx ExcelUpload 반 선택 <select>
//      가 class_type 표시 없이 반 이름만 나열 — 교재 컨테이너 반과 동명의
//      수업 반을 구분 못 함.
//
// 최소 수정(데이터 쓰기 경로 무변경): src/utils/textbookLabel.js 신설
// (textbookLabel/textbookOptionLabel, ClassTextbookLinks.jsx의 기존 인라인
// tbLabel을 글자 그대로 추출 — 출력 불변) → TextbookAssignmentPanel.jsx
// 옵션에 출판사+유닛 수 추가, AdminScreen.jsx ExcelUpload 옵션에 [교재]
// 태그 추가. createClass/assignTextbook/setClassWords는 전혀 건드리지
// 않는다.
//
// 하네스 구성(모두 네트워크 0):
//   a-c: src/utils/wordLibrary.js를 esbuild로 번들 + 이 파일 전용
//        인메모리 가짜 supabase(쓰기 기록, scripts/testAdminUnitEdit.mjs
//        패턴 차용 — insert/update/delete/single 지원 + textbooks.name/
//        classes.name/class_textbooks(class_id,textbook_id) UNIQUE 제약
//        시뮬레이션으로 23505 재현, supabase_v3_1_textbooks.sql:40,62 근거).
//   d:   textbookLabel.js 순수 함수 직접 호출 + App.jsx 라벨 코드 조각
//        정적 검사(정규식, grade 참조 없음).
//   e:   textbookOptionLabel 순수 함수 호출(A/B 구분 증명) + 두 컴포넌트
//        소스 정적 배선 검사(TextbookAssignmentPanel.jsx가 실제로
//        textbookOptionLabel을 그 <option> 줄에서 호출하는지) — 이
//        wiring 검사가 수정 전 FAIL, 수정 후 PASS(핵심 FAIL-first 지점).
//        ClassTextbookLinks는 useEffect 데이터 로딩 게이트가 없어(동기
//        렌더) react-dom/server로 실제 SSR, 라벨 문자열이 리팩터 전후
//        완전히 동일한지 단언(골든 값 = 리팩터 전 인라인 tbLabel 공식과
//        수학적으로 동일한 문자열).
//        TextbookAssignmentPanel은 assignments state가 useEffect(비동기
//        load)로만 채워져(assignments===null이면 즉시 loading 문구 반환)
//        react-dom/server SSR로는 옵션 렌더 분기에 도달할 수 없다(effect가
//        SSR에서 실행되지 않음) — jsdom/react-test-renderer 없이(규칙 6,
//        외부 의존성 최소화) 이 게이트를 우회하는 것은 신뢰성이 낮아
//        의도적으로 순수 함수 호출 + 정적 배선 검사로 대체했다(정직하게
//        기록, CLAUDE.md 규칙 18과 동일 정신) — testAdminUnitEdit.mjs의
//        D/E 절이 이미 이 저장소의 확립된 관례다.
//   f:   AdminScreen.jsx ExcelUpload 소스 정적 검사(과제 지시가 "static or
//        SSR" 명시 허용 — AdminScreen.jsx는 wordAssets/assignmentPlanner/
//        seasonApi 등 다수 모듈을 최상단에서 import해 SSR 번들링 비용·
//        위험이 이 국소 수정 대비 과함, 규칙 1 안정성 우선).
//
// 실행: node scripts/testTextbookGradeLabel.mjs
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const TMP = path.resolve('scripts/.tmp')
fs.mkdirSync(TMP, { recursive: true })

let failures = 0, asserted = 0
const check = (label, cond, detail) => {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); failures++ }
}
const rejects = async (fn) => { try { await fn(); return null } catch (e) { return e } }

// ════════════════════════════════════════════════════════════════════════
// 하네스 A — wordLibrary.js 오프라인 번들 + 인메모리 가짜 supabase
// (테스트 인메모리 UNIQUE 시뮬레이션은 supabase_v3_1_textbooks.sql:40,62의
//  실제 DB 제약을 재현한 것 — 새 제약을 발명한 게 아니다)
// ════════════════════════════════════════════════════════════════════════
const fakePath = path.join(TMP, 'fakeSupabaseForTextbookGradeLabel.mjs')
fs.writeFileSync(fakePath, `
export const __db = { classes: [], units: [], words: [], textbooks: [], class_textbooks: [], daily_assignments: [] }
export const __log = []
export function __reset(ds) { for (const k of Object.keys(__db)) __db[k] = (ds[k] || []).map((r) => ({ ...r })); __log.length = 0 }
const UNIQUE = { classes: ['name'], textbooks: ['name'], class_textbooks: ['class_id', 'textbook_id'] }
function builder(table) {
  const st = { table, cols: '', filters: [], orders: [], range: null, mode: 'select', patch: null, single: null }
  const api = {
    select(c) { st.cols = c || ''; return api },
    order(c, o) { st.orders.push([c, o?.ascending !== false]); return api },
    eq(c, v) { st.filters.push((r) => r[c] === v); return api },
    in(c, v) { st.filters.push((r) => (v || []).includes(r[c])); return api },
    limit(n) { st.range = [0, n - 1]; return api },
    range(a, b) { st.range = [a, b]; return api },
    insert(rows) { st.mode = 'insert'; st.patch = rows; return api },
    delete() { st.mode = 'delete'; return api },
    maybeSingle() { st.single = 'maybe'; return api },
    single() { st.single = 'one'; return api },
    then(res, rej) { return Promise.resolve(run()).then(res, rej) },
  }
  function run() {
    const rows = __db[st.table] || []
    if (st.mode === 'insert') {
      const list = Array.isArray(st.patch) ? st.patch : [st.patch]
      const keys = UNIQUE[st.table]
      if (keys) {
        for (const r of list) {
          const clash = rows.some((x) => keys.every((k) => x[k] === r[k]))
          if (clash) {
            __log.push({ table: st.table, op: 'insert-conflict', keys: keys.map((k) => r[k]) })
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
        }
      }
      const created = list.map((r) => { const row = { id: st.table + '-gen-' + (rows.length + 1) + '-' + Math.random().toString(36).slice(2, 7), ...r }; rows.push(row); return row })
      __log.push({ table: st.table, op: 'insert', rows: created.length })
      const data = st.single ? (created[0] || null) : created
      return { data, error: null }
    }
    if (st.mode === 'delete') {
      const hit = rows.filter((r) => st.filters.every((f) => f(r)))
      for (const r of hit) rows.splice(rows.indexOf(r), 1)
      __log.push({ table: st.table, op: 'delete', hit: hit.length })
      return { data: null, error: null }
    }
    let out = rows.filter((r) => st.filters.every((f) => f(r)))
    for (const [c, asc] of [...st.orders].reverse()) out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1))
    if (st.range) out = out.slice(st.range[0], st.range[1] + 1)
    out = out.map((r) => ({ ...r }))
    if (st.single === 'maybe') return { data: out[0] ?? null, error: null }
    if (st.single === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    return { data: out, error: null }
  }
  return api
}
export const supabase = { from: (t) => builder(t) }
`, 'utf8')
const fakeUrl = pathToFileURL(fakePath).href
const outfile = path.join(TMP, 'wordLibrary.textbookGradeLabel.bundle.mjs')
await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'], bundle: true, format: 'esm', platform: 'node', outfile,
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'), 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'fake-supabase', setup(b) { b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: fakeUrl, external: true })) } }],
})
const lib = await import(pathToFileURL(outfile).href + '?t=' + Date.now())
const fake = await import(fakeUrl)

async function boot(seed) {
  fake.__reset(seed)
  await lib.refreshWordLibrary()
  await lib.refreshTextbooks()
  fake.__log.length = 0
}

console.log('\n=== a. createClass("중1 천재 이상기", textbook) — 학년 재작성 없음 ===')
{
  await boot({
    classes: [{ id: 'cls-anchor', name: '고1 능률 김민수', class_type: 'textbook' }],
    textbooks: [{ id: 'tb-anchor', name: '고1 능률 김민수', owner_class_id: 'cls-anchor', publisher_name: null }],
    class_textbooks: [{ class_id: 'cls-anchor', textbook_id: 'tb-anchor', enabled: true, sort_order: 0 }],
  })
  check('사전조건: _textbookMode = true(앵커 존재)', lib.isTextbookMode() === true)
  const err = await rejects(() => lib.createClass('중1 천재 이상기', 'textbook'))
  check('createClass 성공(에러 없음)', err === null, err?.message)
  const created = lib.getAllTextbooks().find((t) => t.name === '중1 천재 이상기')
  check('textbooks 행 name 정확히 "중1 천재 이상기"(학년 재작성 없음)', !!created, lib.getAllTextbooks().map((t) => t.name))
  check('getTextbookById(id).name도 동일', created && lib.getTextbookById(created.id)?.name === '중1 천재 이상기')
  const anchor = lib.getAllTextbooks().find((t) => t.id === 'tb-anchor')
  check('기존 앵커 교재는 무변경("고1 능률 김민수")', anchor?.name === '고1 능률 김민수')
}

console.log('\n=== b. createClass("중2 천재 이상기", textbook) — "중2" 그대로 ===')
{
  await boot({
    classes: [{ id: 'cls-anchor', name: '고1 능률 김민수', class_type: 'textbook' }],
    textbooks: [{ id: 'tb-anchor', name: '고1 능률 김민수', owner_class_id: 'cls-anchor', publisher_name: null }],
    class_textbooks: [{ class_id: 'cls-anchor', textbook_id: 'tb-anchor', enabled: true, sort_order: 0 }],
  })
  const err = await rejects(() => lib.createClass('중2 천재 이상기', 'textbook'))
  check('createClass 성공(에러 없음)', err === null, err?.message)
  const created = lib.getAllTextbooks().find((t) => t.name === '중2 천재 이상기')
  check('textbooks 행 name 정확히 "중2 천재 이상기"("중1"로 바뀌지 않음)', !!created, lib.getAllTextbooks().map((t) => t.name))
  check('이름에 "중1" 섞이지 않음', !created || !created.name.includes('중1'))
}

console.log('\n=== c. 기존 "중2 천재 이상기" 존재 상태에서 "중1" 생성/"중2" 재생성 ===')
{
  const C2 = 'cls-jung2', TB2 = 'tb-jung2'
  await boot({
    classes: [{ id: C2, name: '중2 천재 이상기', class_type: 'textbook' }],
    textbooks: [{ id: TB2, name: '중2 천재 이상기', owner_class_id: C2, publisher_name: '천재' }],
    class_textbooks: [{ class_id: C2, textbook_id: TB2, enabled: true, sort_order: 0 }],
  })
  check('사전조건: 중2 교재 1건 존재', lib.getAllTextbooks().length === 1)

  const err1 = await rejects(() => lib.createClass('중1 천재 이상기', 'textbook'))
  check('"중1" 생성 성공', err1 === null, err1?.message)
  const all1 = lib.getAllTextbooks()
  check('교재 총 2건(새 행 생성, 기존 대체 아님)', all1.length === 2, all1.map((t) => t.name))
  const jung1 = all1.find((t) => t.name === '중1 천재 이상기')
  const jung2After1 = all1.find((t) => t.id === TB2)
  check('"중1" id는 "중2"의 id(tb-jung2)와 다름(재사용 아님, 새 행)', !!jung1 && jung1.id !== TB2, jung1?.id)
  check('"중2" 원본 행은 id/name/출판사 무변경', jung2After1?.name === '중2 천재 이상기' && jung2After1?.publisherName === '천재')

  fake.__log.length = 0
  const err2 = await rejects(() => lib.createClass('중2 천재 이상기', 'textbook'))
  check('"중2" 재생성 호출 성공(no-op, throw 없음)', err2 === null, err2?.message)
  const all2 = lib.getAllTextbooks()
  check('교재 총 2건 그대로(중복 행 생성 안 됨)', all2.length === 2, all2.map((t) => ({ id: t.id, name: t.name })))
  const jung2After2 = all2.find((t) => t.name === '중2 천재 이상기')
  check('"중2" id는 최초 그대로(tb-jung2) — 정확 이름 idempotency', jung2After2?.id === TB2, jung2After2?.id)
  const rawTextbooksTable = fake.__db.textbooks
  check('가짜 DB textbooks 원본 테이블도 정확히 2행(고아/중복 행 없음)', rawTextbooksTable.length === 2, rawTextbooksTable.length)
  const conflictLogged = fake.__log.some((l) => l.table === 'textbooks' && l.op === 'insert-conflict')
  check('UNIQUE(name) 충돌 경로가 실제로 작동(23505 재현, 그냥 우연히 스킵된 게 아님)', conflictLogged, fake.__log)
}

// ════════════════════════════════════════════════════════════════════════
// 하네스 B — 순수 함수(textbookLabel.js) + 정적 소스 검사
// ════════════════════════════════════════════════════════════════════════
const { textbookLabel, textbookOptionLabel } = await import(pathToFileURL(path.resolve('src/utils/textbookLabel.js')).href)

console.log('\n=== d. textbookLabel 순수 함수 + App.jsx 학생 라벨 정적 계약 ===')
{
  check('출판사 없음 → 이름 그대로', textbookLabel({ name: '중1 천재 이상기', publisherName: null }) === '중1 천재 이상기')
  check('출판사 있음 → "이름 (출판사)"', textbookLabel({ name: '중2 천재 이상기', publisherName: '천재' }) === '중2 천재 이상기 (천재)')
  check('name 없음 → 빈 문자열(크래시 없음)', textbookLabel({}) === '')

  const appSrc = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
  const memoStart = appSrc.indexOf('const textbookOptions = useMemo')
  const memoEnd = appSrc.indexOf('}, [studentId, textbookAssignments, refreshTick])')
  check('App.jsx에서 textbookOptions useMemo 블록을 찾음(정적 검사 전제)', memoStart >= 0 && memoEnd > memoStart)
  const memoBlock = appSrc.slice(memoStart, memoEnd)
  check('학생 라벨 조립이 tb.publisherName ? name (pub) : name 그대로', /tb\.publisherName \? `\$\{tb\.name\} \(\$\{tb\.publisherName\}\)` : tb\.name/.test(memoBlock))
  // 코드 라인만(주석 제외) 검사 — 이 블록의 한글 주석은 "학년으로 제한하지
  // 않으며"처럼 정책 설명으로 "학년"을 정당하게 언급한다(오탐 방지).
  const labelLine = (memoBlock.match(/^\s*\.map\(.*label:.*$/m) || [])[0] || ''
  check('학생 라벨 조립 코드 줄을 찾음(정적 검사 전제)', labelLine.length > 0, memoBlock)
  check('라벨 조립 코드에 grade 참조 없음(학년 유추 없음, 근본 원인 아님 확인)', !/grade/i.test(labelLine), labelLine)
}

console.log('\n=== e. textbookOptionLabel 구분성 + TextbookAssignmentPanel 배선(FAIL-first 핵심) ===')
{
  const A = { id: 'tb-a', name: '중1 천재 이상기', publisherName: null }
  const B = { id: 'tb-b', name: '중2 천재 이상기', publisherName: '천재' }
  const labelA = textbookOptionLabel(A, 1)
  const labelB = textbookOptionLabel(B, 3)
  check('A 옵션 라벨 = "중1 천재 이상기 · 유닛 1개"', labelA === '중1 천재 이상기 · 유닛 1개', labelA)
  check('B 옵션 라벨 = "중2 천재 이상기 (천재) · 유닛 3개"', labelB === '중2 천재 이상기 (천재) · 유닛 3개', labelB)
  check('A/B 옵션 텍스트가 서로 다름(이름 이외의 단서로 구분 가능)', labelA !== labelB)
  check('unitCount 없으면 textbookLabel과 동일(안전한 폴백)', textbookOptionLabel(B, undefined) === textbookLabel(B))

  const tapSrc = fs.readFileSync(path.resolve('src/components/admin/TextbookAssignmentPanel.jsx'), 'utf8')
  check('[FAIL-first] "배정할 교과서" 옵션 줄이 textbookOptionLabel(...)을 호출',
    /addableTextbooks\.map\(\(tb\) => <option key=\{tb\.id\} value=\{tb\.id\}>\{textbookOptionLabel\(tb, /.test(tapSrc))
  check('[FAIL-first] textbookLabel.js에서 textbookOptionLabel을 import', /import \{ textbookOptionLabel \} from ['"]\.\.\/\.\.\/utils\/textbookLabel['"]/.test(tapSrc))
  check('getTextbookUnits를 wordLibrary에서 import(유닛 수 계산 출처)', /getTextbookUnits/.test(tapSrc))
}

console.log('\n=== e-2. ClassTextbookLinks — 실제 SSR, 라벨 문자열 리팩터 전후 불변 ===')
{
  const stub = (contents) => ({ contents, loader: 'js' })
  const CT2 = 'C2-own', CT1 = 'C1-other'
  const own = { id: 'TB2', name: '중2 천재 이상기', publisherName: '천재', ownerClassId: CT2 }
  const addable = { id: 'TB1', name: '중1 천재 이상기', publisherName: null, ownerClassId: CT1 }
  const wordLibStub = stub(`
    export const getClassIdByName = (n) => (n === '중2 천재 이상기' ? '${CT2}' : null)
    export const getClassNameById = (id) => (id === '${CT1}' ? '중1 천재 이상기' : (id === '${CT2}' ? '중2 천재 이상기' : null))
    export const getClassTextbooks = (classId) => (classId === '${CT2}' ? [${JSON.stringify(own)}] : [])
    export const getAllTextbooks = () => [${JSON.stringify(own)}, ${JSON.stringify(addable)}]
    export const isTextbookMode = () => true
    export const linkTextbookToClass = () => Promise.resolve()
    export const unlinkTextbookFromClass = () => Promise.resolve()
  `)
  const ctlOutfile = path.join(TMP, 'ClassTextbookLinks.ssr.mjs')
  await esbuild.build({
    entryPoints: ['src/components/admin/ClassTextbookLinks.jsx'], bundle: true, format: 'esm', platform: 'node',
    outfile: ctlOutfile, jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    plugins: [{
      name: 'stub-wordlib',
      setup(b) {
        b.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: 'v:wordlib', namespace: 'v' }))
        b.onLoad({ filter: /^v:wordlib$/, namespace: 'v' }, () => wordLibStub)
      },
    }],
  })
  const React = (await import('react')).default
  const { renderToStaticMarkup } = await import('react-dom/server')
  const ClassTextbookLinks = (await import(pathToFileURL(ctlOutfile).href + '?t=' + Date.now())).default
  const html = renderToStaticMarkup(React.createElement(ClassTextbookLinks, { targetClass: '중2 천재 이상기', onChanged: () => {} }))

  // 골든 값 = 리팩터 전 인라인 tbLabel([t.name, t.publisherName && `(${t.publisherName})`].filter(Boolean).join(' '))과
  // 수학적으로 동일 — textbookLabel.js로 옮긴 뒤에도 출력이 바뀌지 않았는지 확인.
  check('자체 교재(own) 라벨 = "중2 천재 이상기 (천재)"(출력 불변)', html.includes('중2 천재 이상기 (천재)'), html)
  check('자체 교재 라벨에 유닛 수 접미사 없음(textbookOptionLabel 아님, textbookLabel만)', !html.includes('유닛'))
  check('연결 가능(addable) 목록에 "중1 천재 이상기"(출판사 없음, 괄호 없음)', html.includes('중1 천재 이상기') && !html.includes('중1 천재 이상기 ('))
  check('자체 교재 배지("자체 교재") 렌더', html.includes('자체 교재'))
}

console.log('\n=== f. AdminScreen.jsx ExcelUpload 반 선택 <select> — [교재] 태그(정적 검사) ===')
{
  const src = fs.readFileSync(path.resolve('src/components/AdminScreen.jsx'), 'utf8')
  const fnStart = src.indexOf('function ExcelUpload(')
  const fnEnd = src.indexOf('function PdfUpload(')
  check('AdminScreen.jsx에서 ExcelUpload 함수 블록을 찾음(정적 검사 전제)', fnStart >= 0 && fnEnd > fnStart)
  const block = src.slice(fnStart, fnEnd)
  const optionLine = (block.match(/\{classList\.map\(c => <option[^\n]*<\/option>\)\}/) || [])[0] || ''
  check('① 반 선택 옵션 줄을 찾음', optionLine.length > 0, block.slice(0, 200))
  check('[FAIL-first] 옵션 텍스트가 getClassTypeByName(c) === \'textbook\' 조건으로 [교재] 태그를 붙임',
    /getClassTypeByName\(c\)\s*===\s*'textbook'/.test(optionLine) && optionLine.includes('[교재]'))
  check('옵션 value는 여전히 반 이름 그대로(value={c}, 쓰기 경로 무변경)', /value=\{c\}/.test(optionLine))
  check('AdminScreen.jsx가 getClassTypeByName을 wordLibrary에서 import', /getClassTypeByName/.test(src.slice(0, fnStart)))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 교재 학년 라벨: 생성 경로 무변경(a-d) + 선택지 구분성 확보(e-f)')
