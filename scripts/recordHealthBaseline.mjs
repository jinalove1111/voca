// Health baseline 기록기 — 로컬 파일만 쓴다 (2026-08-26, P2)
//
// 지금 헬스체크에서 FAIL 인 항목을 "이미 알고 있던 문제"로 등록한다.
// 등록된 항목은 verify:release 게이트를 막지 않고 계속 보이기만 하며,
// baseline 에 없는 새 FAIL(=이번 변경이 만든 회귀)만 배포를 차단한다.
//
// ★ DB 를 건드리지 않는다 ★ 헬스체크(GET 전용)를 한 번 돌리고 그 결과를
// scripts/health/baseline.json 에 쓰는 것이 전부다. 학생 데이터는 무접촉.
//
// 주의: baseline 은 "고칠 것을 미뤄두는 목록"이지 "덮어두는 목록"이 아니다.
// 등록 후에도 게이트가 매번 목록을 출력하므로 0으로 줄여 나가야 한다.
//
// 2026-09-03 보안수정 — scripts/health/baseline.json 은 PUBLIC 저장소에
// 커밋되는 파일이다. entries[].name 에 학생 실명을 그대로 적으면 git
// 이력에 실명이 영구히 남는다. scripts/lib/releaseGate.mjs 의 baselineKey
// 는 studentId(UUID, PII 아님) + code 접두로만 매칭하므로(diffAgainstBaseline
// 참고) name 필드는 판정에 전혀 쓰이지 않는다 — 순수 표시용이므로 항상
// maskName() 으로 마스킹해서 저장한다(studentHealthCheck.mjs/prodCheck.mjs
// 의 동일 규칙: 첫 글자 + ***, 파일 소유권 때문에 공용 모듈로 뽑지 않고
// 이 파일에서 독립적으로 정의한다 — CLAUDE.md 규칙 3/16 참고).
//
// 순수 함수(maskName/buildBaselineEntries)를 테스트에서 import 해도 실제
// 네트워크 호출/파일 쓰기가 일어나지 않도록, CLI 로 직접 실행됐을 때만
// (isMain) 아래 main()을 구동한다(scripts/prodHotfix.mjs 의 동일 패턴).
//
// 실행: npm run health:baseline
//       npm run health:baseline -- --dry-run   (파일을 쓰지 않고 미리보기)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'health')
const OUT = path.join(OUT_DIR, 'baseline.json')

/** prodCheck.mjs/studentHealthCheck.mjs 와 동일 규칙: 첫 글자 + ***. */
export function maskName(name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return '(이름없음)'
  return `${n[0]}***`
}

/**
 * 헬스체크 결과(payload.students[])에서 FAIL 항목만 baseline entries 로
 * 만든다. name 은 항상 마스킹된 값만 담는다(원본 실명은 절대 담지 않음).
 * 순수 함수 — 네트워크/파일 접근 없음.
 * @param {Array<{studentId?, name?, status?, codes?: string[]}>} students
 */
export function buildBaselineEntries(students) {
  const entries = []
  for (const s of (Array.isArray(students) ? students : [])) {
    if (!s || s.status !== 'FAIL') continue
    for (const c of (Array.isArray(s.codes) ? s.codes : [])) {
      entries.push({
        studentId: s.studentId,
        name: maskName(s.name),
        code: String(c).split(':')[0],
        note: String(c),
      })
    }
  }
  return entries
}

/** payload(studentHealthCheck.mjs --json 결과)로부터 baseline 문서를 만든다. */
export function buildBaselineDoc(payload) {
  return {
    // 이 파일은 "지금 알고 있는 문제"의 스냅샷이다. 손으로 편집해도 되지만,
    // studentId + code 조합이 키이므로 그 두 필드는 정확해야 한다.
    description: 'Student Health Check baseline — 이미 알고 있던 FAIL. 게이트는 여기 없는 새 FAIL 만 차단한다.',
    recordedAt: payload?.recordedAt || null,
    summary: payload?.summary || null,
    entries: buildBaselineEntries(payload?.students),
  }
}

function main() {
  const DRY = process.argv.slice(2).includes('--dry-run')

  const res = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'studentHealthCheck.mjs'), '--json', '--require-env'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

  let payload
  try {
    payload = JSON.parse(res.stdout)
  } catch {
    console.error('헬스체크 JSON 파싱 실패 — baseline 을 갱신하지 않았습니다.')
    console.error((res.stdout || res.stderr || '').slice(0, 1000))
    process.exit(1)
    return
  }
  if (payload.infraError) {
    console.error(`INFRA_ERROR — baseline 을 갱신하지 않았습니다: ${payload.infraError}`)
    process.exit(1)
    return
  }

  const doc = buildBaselineDoc(payload)

  if (DRY) {
    console.log('--dry-run — 파일을 쓰지 않았습니다. 기록될 내용:')
    console.log(JSON.stringify(doc, null, 2))
    return
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n')
  console.log(`baseline 기록 완료 — ${path.relative(ROOT, OUT)}`)
  console.log(`  알려진 문제 ${doc.entries.length}건${doc.entries.length ? ':' : ' (깨끗한 상태 — 앞으로 모든 FAIL 이 회귀로 잡힙니다)'}`)
  for (const e of doc.entries) console.log(`    · ${e.name}: ${e.note}`)
  console.log('DB WRITE: 0 (로컬 파일만 기록)')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) main()
