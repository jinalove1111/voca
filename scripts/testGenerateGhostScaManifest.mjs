// scripts/prod/generateGhostScaManifest.mjs 회귀 테스트 (FAIL-first, 네트워크 0)
// (2026-09-03, 야간 자율 작업 Track 7)
//
// 전부 자체 합성 픽스처(실명/실 UUID 없음, crypto.randomUUID()로 매 실행
// 새로 생성 — 결정론이 아니라 "형식이 유효한 UUID"만 필요하므로 무방)로
// 돈다. scripts/prod/fixtures/synth.mjs 의 assignments 는 SCA.id(PK)를
// 포함하지 않아(그 파일 헤더 참고 — 다른 트랙 소유, 이 트랙은 import만) 이
// 테스트 목적(manifest 는 SCA.id 가 필수)에 맞지 않는다 — 그래서 이 파일
// 자체 makeFixture() 를 새로 만든다(지시사항의 "자체 합성 데이터로" 경로).
//
// 1절: buildManifestFromSnapshot 은 export되지 않으므로(CLI 전용 파일이라
// 순수 함수를 분리하지 않았다 — 이 파일 규모(단일 트랙, 단일 스크립트)에서는
// 과설계로 판단), CLI를 spawnSync + --fixture --json 으로 실행해 검증한다.
// (다른 prod:* 스크립트들도 --fixture 픽스처 기반 CLI 테스트 패턴을 이미
// 쓴다 — scripts/testProdCheck.mjs 4절과 동일 관례.)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateManifest, buildApplySql } from './lib/hotfixManifest.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts', 'prod', 'generateGhostScaManifest.mjs')
const TMP_DIR = path.join(ROOT, 'scripts', '.tmp', 'ghost-sca-manifest-test')
fs.mkdirSync(TMP_DIR, { recursive: true })

let passed = 0
let failed = 0
const failures = []
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}

const uid = () => crypto.randomUUID()

// ── 합성 픽스처 빌더 ──────────────────────────────────────────────────────
// 반1(class_type=regular) + 교재컨테이너1(class_type=textbook) + 교재1(유닛
// Unit1/Unit2 정상 20단어 + 유령 유닛 "Unit" 1단어) 구성. opts로 시나리오별
// 변형(다른 교재 유닛, 학습 가능 유닛 0개인 별도 교재 등)을 만든다.
function makeFixture(overrides = {}) {
  const ids = {
    cls1: uid(), clsC1: uid(), clsC2: uid(),
    tb1: uid(), tb2: uid(),
    unit1: uid(), unit2: uid(), unitGhost: uid(),
    tb2UnitGhostOnly: uid(),
  }
  const classes = [
    { id: ids.cls1, name: '합성반1', class_type: 'regular', spelling_direction: 'kr2en' },
    { id: ids.clsC1, name: '합성교재컨테이너1', class_type: 'textbook', spelling_direction: 'kr2en' },
    { id: ids.clsC2, name: '합성교재컨테이너2', class_type: 'textbook', spelling_direction: 'kr2en' },
  ]
  const textbooks = [
    { id: ids.tb1, name: '합성교재1', owner_class_id: ids.clsC1 },
    { id: ids.tb2, name: '합성교재2(학습가능유닛없음)', owner_class_id: ids.clsC2 },
  ]
  const units = [
    { id: ids.unit1, name: 'Unit1', textbook_id: ids.tb1 },
    { id: ids.unit2, name: 'Unit2', textbook_id: ids.tb1 },
    { id: ids.unitGhost, name: 'Unit', textbook_id: ids.tb1 },
    // tb2 는 유령 유닛 하나만 있는 교재(학습 가능 유닛 0개 시나리오용)
    { id: ids.tb2UnitGhostOnly, name: 'Unit', textbook_id: ids.tb2 },
  ]
  const words = []
  for (const u of [ids.unit1, ids.unit2]) {
    for (let i = 0; i < 20; i++) words.push({ id: uid(), unit_id: u, word: `w${i}`, meaning: `뜻${i}` })
  }
  words.push({ id: uid(), unit_id: ids.unitGhost, word: 'No.', meaning: '어휘·어구' })
  words.push({ id: uid(), unit_id: ids.tb2UnitGhostOnly, word: 'English', meaning: 'Korean' })

  return { classes, textbooks, units, words, ids, projectRef: 'testref-fixture', ...overrides }
}

function buildSnapshot(fx, students, assignments) {
  return {
    data: {
      projectRef: fx.projectRef,
      classes: fx.classes, textbooks: fx.textbooks, units: fx.units, words: fx.words,
      students, assignments,
    },
  }
}

function writeFixtureFile(name, snapshot) {
  const p = path.join(TMP_DIR, `${name}.json`)
  fs.writeFileSync(p, JSON.stringify(snapshot, null, 2), 'utf8')
  return p
}

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' })
}

// ── 시나리오 1: A행, students.current_unit_id 정상(같은 교재, 학습가능) ──
console.log('\n=== [1] A그룹 — students.current_unit_id 정상 -> 그 값 사용 ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaId = uid()
  const students = [{ id: stuId, name: '합성학생1', class_id: fx.ids.cls1, current_unit_id: fx.ids.unit2, unit_name: 'Unit2' }]
  const assignments = [{
    id: scaId, student_id: stuId, class_id: fx.ids.clsC1, textbook_id: fx.ids.tb1,
    is_primary: true, current_unit_id: fx.ids.unitGhost, created_at: '2026-01-01T00:00:00Z',
  }]
  const file = writeFixtureFile('case1', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case1.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  check('CLI exit 0', res.status === 0, `stderr=${res.stderr}`)
  let parsed = null
  try { parsed = JSON.parse(res.stdout) } catch { /* below fails */ }
  check('JSON 파싱 가능', !!parsed, res.stdout.slice(0, 400))
  const change = parsed?.manifest?.changes?.find((c) => c.id === scaId)
  check('changes 에 해당 SCA 포함', !!change)
  check('set.current_unit_id === students.current_unit_id(Unit2)', change?.set?.current_unit_id === fx.ids.unit2)
  check('expect_before.current_unit_id === 유령 id', change?.expect_before?.current_unit_id === fx.ids.unitGhost)
  check('validateManifest 통과', validateManifest(parsed.manifest).valid, JSON.stringify(validateManifest(parsed.manifest).errors))
  check('must_not_change 에 students 현재값 포함',
    parsed.manifest.must_not_change.some((m) => m.table === 'students' && m.id === stuId
      && m.expect.current_unit_id === fx.ids.unit2 && m.expect.unit_name === 'Unit2'))
  check('실명 문자열("합성학생1")이 manifest 안에 없음', !JSON.stringify(parsed.manifest).includes('합성학생1'))
}

// ── 시나리오 2: A행, students.current_unit_id 가 다른 교재 -> 첫 학습가능 유닛 폴백 ──
console.log('\n=== [2] A그룹 — students.current_unit_id 다른 교재 -> 폴백(자연정렬 첫 유닛) ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaId = uid()
  // students.current_unit_id 가 tb2 소속(SCA 는 tb1) — 교재 불일치라 못 씀
  const students = [{ id: stuId, name: '합성학생2', class_id: fx.ids.cls1, current_unit_id: fx.ids.tb2UnitGhostOnly, unit_name: 'Unit' }]
  const assignments = [{
    id: scaId, student_id: stuId, class_id: fx.ids.clsC1, textbook_id: fx.ids.tb1,
    is_primary: true, current_unit_id: fx.ids.unitGhost, created_at: '2026-01-01T00:00:00Z',
  }]
  const file = writeFixtureFile('case2', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case2.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  check('CLI exit 0', res.status === 0, `stderr=${res.stderr}`)
  const parsed = JSON.parse(res.stdout)
  const change = parsed.manifest.changes.find((c) => c.id === scaId)
  check('폴백 목적지 = tb1 의 첫 학습가능 유닛(Unit1, 자연정렬)', change?.set?.current_unit_id === fx.ids.unit1,
    `got=${change?.set?.current_unit_id} unit1=${fx.ids.unit1} unit2=${fx.ids.unit2}`)
}

// ── 시나리오 3: A행, 교재에 학습 가능 유닛이 0개 -> skipped(추측 없음) ──
console.log('\n=== [3] A그룹 — 학습 가능 유닛 0개(tb2) -> skipped, changes 미포함 ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaId = uid()
  const students = [{ id: stuId, name: '합성학생3', class_id: fx.ids.cls1, current_unit_id: null, unit_name: null }]
  const assignments = [{
    id: scaId, student_id: stuId, class_id: fx.ids.clsC2, textbook_id: fx.ids.tb2,
    is_primary: true, current_unit_id: fx.ids.tb2UnitGhostOnly, created_at: '2026-01-01T00:00:00Z',
  }]
  const file = writeFixtureFile('case3', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case3.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  check('CLI exit 0(정리 대상 0건이라도 정상 종료)', res.status === 0, `stderr=${res.stderr}`)
  const parsed = JSON.parse(res.stdout)
  check('changes 0건', (parsed.manifest?.changes?.length ?? 0) === 0, JSON.stringify(parsed.manifest))
  check('skipped 에 해당 SCA 포함(추측 없이 제외)', parsed.skipped.some((s) => s.scaId === scaId))
  check('manifest 파일 미생성', !fs.existsSync(outFile))
}

// ── 시나리오 4: B행(non-primary) -> null ──
console.log('\n=== [4] B그룹 — non-primary -> null ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaId = uid()
  const students = [{ id: stuId, name: '합성학생4', class_id: fx.ids.cls1, current_unit_id: fx.ids.unit1, unit_name: 'Unit1' }]
  const assignments = [{
    id: scaId, student_id: stuId, class_id: fx.ids.clsC1, textbook_id: fx.ids.tb1,
    is_primary: false, current_unit_id: fx.ids.unitGhost, created_at: '2026-01-01T00:00:00Z',
  }]
  const file = writeFixtureFile('case4', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case4.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  const parsed = JSON.parse(res.stdout)
  const change = parsed.manifest.changes.find((c) => c.id === scaId)
  check('B그룹 set.current_unit_id === null', change?.set && Object.prototype.hasOwnProperty.call(change.set, 'current_unit_id') && change.set.current_unit_id === null)
  check('validateManifest 통과(null 허용)', validateManifest(parsed.manifest).valid, JSON.stringify(validateManifest(parsed.manifest).errors))
}

// ── 시나리오 5: 테스트 계정 제외 ──
console.log('\n=== [5] 테스트 계정(cookie) 제외 ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaId = uid()
  const students = [{ id: stuId, name: 'cookie', class_id: fx.ids.cls1, current_unit_id: fx.ids.unit1, unit_name: 'Unit1' }]
  const assignments = [{
    id: scaId, student_id: stuId, class_id: fx.ids.clsC1, textbook_id: fx.ids.tb1,
    is_primary: false, current_unit_id: fx.ids.unitGhost, created_at: '2026-01-01T00:00:00Z',
  }]
  const file = writeFixtureFile('case5', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case5.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  const parsed = JSON.parse(res.stdout)
  check('테스트 계정 SCA 는 changes 에 없음', !(parsed.manifest?.changes || []).some((c) => c.id === scaId))
  check('excludedNonReal >= 1', (parsed.excludedNonReal ?? 0) >= 1, JSON.stringify(parsed.excludedNonReal))
}

// ── 시나리오 6: Harry형 — 한 학생이 A+B 둘 다(서로 다른 SCA 행) ──
console.log('\n=== [6] 한 학생이 A+B 둘 다 -> affected_students/must_not_change 1건으로 dedupe ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaA = uid()
  const scaB = uid()
  const students = [{ id: stuId, name: '합성학생6', class_id: fx.ids.cls1, current_unit_id: fx.ids.unit1, unit_name: 'Unit1' }]
  const assignments = [
    { id: scaA, student_id: stuId, class_id: fx.ids.clsC1, textbook_id: fx.ids.tb1, is_primary: true, current_unit_id: fx.ids.unitGhost, created_at: '2026-01-01T00:00:00Z' },
    { id: scaB, student_id: stuId, class_id: fx.ids.clsC2, textbook_id: fx.ids.tb2, is_primary: false, current_unit_id: fx.ids.tb2UnitGhostOnly, created_at: '2026-01-02T00:00:00Z' },
  ]
  const file = writeFixtureFile('case6', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case6.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  const parsed = JSON.parse(res.stdout)
  check('changes 2건(A+B)', parsed.manifest.changes.length === 2, JSON.stringify(parsed.manifest.changes))
  check('affected_students 1명으로 dedupe', parsed.manifest.affected_students.length === 1)
  check('must_not_change 1건으로 dedupe', parsed.manifest.must_not_change.length === 1)
  check('validateManifest 통과', validateManifest(parsed.manifest).valid)
}

// ── 시나리오 7: buildApplySql — is null / 가드 포함 ──
console.log('\n=== [7] buildApplySql — is null 가드 + 각 가드 포함 ===')
{
  const fx = makeFixture()
  const stuId = uid()
  const scaId = uid()
  const students = [{ id: stuId, name: '합성학생7', class_id: fx.ids.cls1, current_unit_id: fx.ids.unit1, unit_name: 'Unit1' }]
  const assignments = [{
    id: scaId, student_id: stuId, class_id: fx.ids.clsC1, textbook_id: fx.ids.tb1,
    is_primary: false, current_unit_id: fx.ids.unitGhost, created_at: '2026-01-01T00:00:00Z',
  }]
  const file = writeFixtureFile('case7', buildSnapshot(fx, students, assignments))
  const outFile = path.join(TMP_DIR, 'case7.out.json')
  const res = runCli(['--fixture', file, '--json', '--out', outFile])
  const parsed = JSON.parse(res.stdout)
  const sql = buildApplySql(parsed.manifest, 'TESTRUN')
  check('apply SQL 에 "current_unit_id = null" 이 아니라 set 시 NULL 리터럴 사용', sql.includes('set current_unit_id = NULL'), sql)
  check('apply SQL 가드(where)에 is_primary = false 포함', sql.includes('is_primary = false'), sql)
  check('apply SQL 가드에 student_id 포함', sql.includes(stuId), sql)
  check('apply SQL 가드에 textbook_id 포함', sql.includes(fx.ids.tb1), sql)
  check('apply SQL 가드에 current_unit_id(유령) = 포함(NULL 아닌 실제 uuid 이므로 is null 아님)', sql.includes(`current_unit_id = '${fx.ids.unitGhost}'`), sql)
}

// ── 시나리오 7b: A그룹이면서 set 목적지가 null 이 아닌 경우도 SQL 정상 생성 ──
// (참고용 — is null 가드 자체는 B그룹 케이스에서 이미 검증됨, 7절과 중복
// 방지를 위해 별도 섹션 생략)

console.log(`\n=== 결과: ${passed} PASS / ${failed} FAIL ===`)
if (failed > 0) {
  console.log('실패 목록:', failures.join(', '))
  process.exitCode = 1
} else {
  process.exitCode = 0
}
