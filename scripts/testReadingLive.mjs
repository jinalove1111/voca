// Reading Foundation v3.3 LIVE 검증(2026-07-23) — SQL 실행 후, 실제 배포
// 코드(src/utils/readingApi.js)를 esbuild로 번들해 프로덕션 DB에 CRUD
// 전체를 실측한다. QA 지문은 마지막에 삭제(자체 정리 — 학생 데이터 아님).
// 실행: node scripts/testReadingLive.mjs
import esbuild from 'esbuild'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
await esbuild.build({
  entryPoints: ['src/utils/readingApi.js'], bundle: true, format: 'esm', platform: 'node',
  outfile: 'scripts/.tmp/readingApi.bundle.mjs',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
  },
})
const api = await import(pathToFileURL('scripts/.tmp/readingApi.bundle.mjs').href)

let failures = 0
const check = (l, c, e) => { if (c) console.log(`  PASS  ${l}`); else { console.log(`  FAIL  ${l}`, e !== undefined ? JSON.stringify(e) : ''); failures++ } }
const H = { apikey: key, Authorization: `Bearer ${key}` }
const rest = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: H })).json()

// 0) 스키마 실존 + RLS(정책이 활성 상태가 아니면 anon select 자체가 거부됨)
const t1 = await fetch(`${url}/rest/v1/passages?select=id&limit=1`, { headers: H })
const t2 = await fetch(`${url}/rest/v1/passage_sentences?select=id&limit=1`, { headers: H })
check('passages 테이블 실존 + anon RLS 정책 활성(select 200)', t1.status === 200, t1.status)
check('passage_sentences 테이블 실존 + anon RLS 정책 활성(select 200)', t2.status === 200, t2.status)
check('checkReadingTablesExist() = true', await api.checkReadingTablesExist())

// 1) 실제 유닛 하나에 QA 지문 CRUD (실제 readingApi 코드 경유)
const units = await rest('units?select=id,name&limit=1')
const unitId = units[0].id
const TITLE = '_QA_Reading_Live_20260723'
const p = await api.createPassage(unitId, TITLE)
check('createPassage — 지문 생성', !!p?.id, p)
await api.updatePassageTitle(p.id, TITLE + '_수정')
let list = await api.fetchPassagesForUnit(unitId)
let mine = list.find((x) => x.id === p.id)
check('updatePassageTitle — 제목 수정 반영', mine?.title === TITLE + '_수정')

await api.saveSentences(p.id, [
  { english: 'Paul wears a black hat.', korean: '폴은 검은 모자를 써요.' },
  { english: 'The garden grows every day.', korean: '정원은 매일 자라요.' },
  { english: 'Words become flowers.', korean: '' },
])
list = await api.fetchPassagesForUnit(unitId)
mine = list.find((x) => x.id === p.id)
check('saveSentences — 문장 3개 저장 + 순서 보존', mine?.sentences?.length === 3 && mine.sentences[0].english === 'Paul wears a black hat.' && mine.sentences[2].position === 2, mine?.sentences)

// 편집(재저장 = 수정+재정렬+삭제 통합 경로) — 순서 뒤집고 1개 제거
await api.saveSentences(p.id, [
  { english: 'The garden grows every day.', korean: '정원은 매일 자라요.' },
  { english: 'Paul wears a black hat.', korean: '폴은 검은 모자를 써요. (수정)' },
])
list = await api.fetchPassagesForUnit(unitId)
mine = list.find((x) => x.id === p.id)
check('saveSentences 재저장 — 재정렬/수정/삭제 반영(2개, 순서 뒤집힘)', mine?.sentences?.length === 2 && mine.sentences[0].english.startsWith('The garden') && mine.sentences[1].korean.includes('(수정)'))

// 지문 순서 이동
const p2 = await api.createPassage(unitId, TITLE + '_2')
await api.movePassage(p.id, 5)
list = await api.fetchPassagesForUnit(unitId)
check('movePassage — position 반영(목록 정렬 변화)', list.findIndex((x) => x.id === p.id) > list.findIndex((x) => x.id === p2.id))

// 삭제(cascade — 문장도 함께)
await api.deletePassage(p.id)
await api.deletePassage(p2.id)
list = await api.fetchPassagesForUnit(unitId)
const orphans = await rest(`passage_sentences?passage_id=eq.${p.id}&select=id`)
check('deletePassage — 지문 삭제 + 문장 cascade 삭제(고아 0)', !list.some((x) => x.id === p.id || x.id === p2.id) && orphans.length === 0)

console.log(`\n=== ${failures === 0 ? '전부 PASS — QA 지문 자체 정리 완료' : `FAIL ${failures}건`} ===`)
process.exit(failures === 0 ? 0 : 1)
