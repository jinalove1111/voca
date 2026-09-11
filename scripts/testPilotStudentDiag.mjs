// scripts/testPilotStudentDiag.mjs — pilotStudentDiag.mjs --self-test 등록용
// 래퍼 (2026-09-11, TASK 10).
//
// pilotStudentDiag.mjs 자체가 --self-test(네트워크 0, 픽스처 기반 순수
// 포맷터 검증)를 이미 구현하고 있다 — 이 파일은 그 로직을 재구현하지
// 않고(CLAUDE.md 규칙 3) scripts/testGenerateGhostScaManifest.mjs /
// scripts/testStdoutFlushOnExit.mjs와 동일한 "CLI를 spawnSync로 직접
// 구동해 검증" 관례를 따라 등록 가능한 형태로만 감싼다.
//
// 검증하는 것:
//   1) `node scripts/pilotStudentDiag.mjs --self-test` 가 exit 0으로 끝난다.
//   2) stdout에 18개 개별 PASS 라인과 최종 "ALL SELF-TEST CHECKS PASSED"
//      마커가 그대로 나온다(가짜 PASS 방지 — exit 0만 보고 속지 않는다).
//   3) 자격증명(.env/VITE_SUPABASE_*) 없이도 성공한다 — self-test 경로가
//      정말로 네트워크에 의존하지 않는지의 실측 증거(자격증명을 지운
//      환경에서 실행해 그래도 통과하는지 확인).
//   4) 완주 시간이 짧다(대략적인 "네트워크 0" 방증 — 실제 Supabase 왕복이
//      있었다면 이 스크립트 규모상 최소 수백ms~초 단위가 걸린다).
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts', 'pilotStudentDiag.mjs')

let passed = 0
let failed = 0
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`) }
}

// 자격증명을 명시적으로 지운 환경 — self-test가 정말 네트워크 0인지
// 실측한다(자격증명이 있어야만 통과한다면 self-test라는 이름이 거짓이다).
const envWithoutCreds = { ...process.env }
delete envWithoutCreds.VITE_SUPABASE_URL
delete envWithoutCreds.VITE_SUPABASE_ANON_KEY

const started = Date.now()
const res = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: ROOT,
  env: envWithoutCreds,
  encoding: 'utf8',
  timeout: 15000,
})
const elapsedMs = Date.now() - started

check('자식 프로세스가 exit 0으로 끝난다', res.status === 0, `실제 status=${res.status} stderr=${(res.stderr || '').slice(0, 300)}`)

const out = res.stdout || ''
check('개별 PASS 라인이 18개 나온다(가짜 PASS 방지)', (out.match(/^\s*PASS\s/gm) || []).length === 18, `실제 PASS 라인 수=${(out.match(/^\s*PASS\s/gm) || []).length}`)
check('개별 FAIL 라인이 0개다', (out.match(/^\s*FAIL\s/gm) || []).length === 0)
check('최종 마커 "ALL SELF-TEST CHECKS PASSED"가 stdout에 있다', out.includes('ALL SELF-TEST CHECKS PASSED'))
check('VITE_SUPABASE_* 자격증명 없이도 통과한다(네트워크 0 방증)', res.status === 0)
check(`완주 시간이 3초 미만이다(네트워크 0 방증, 실측 ${elapsedMs}ms)`, elapsedMs < 3000)

console.log(`\n${failed === 0 ? '전체 PASS' : '전체 FAIL'} — ${passed} passed, ${failed} failed`)
process.exitCode = failed === 0 ? 0 : 1
