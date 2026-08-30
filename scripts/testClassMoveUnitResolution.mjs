// 반 이동 시 유닛 해석 — 표기 흔들림 흡수 + 조용한 첫 유닛 폴백 제거 (2026-08-29)
//
// 감사 실측 배경:
//   · 프로덕션 유닛 50개의 명명 형식이 4종 혼재한다 — 'UnitN' 29개 /
//     'Unit N' 13개 / 번호 없는 'Unit' 6개 / 숫자만 2개.
//   · setStudentClass(wordLibrary.js)는 새 반의 유닛을 **정규화 없는 완전
//     일치**로만 찾고, 못 찾으면 current_unit_id 를 NULL 로 덮어썼다.
//   · 그러면 다음 로드에서 resolveStudentUnitObj 가 이름 매칭에 다시 실패하고
//     `|| units[0]` 로 **조용히 반의 첫 유닛**에 착지했다.
//   · 그 착지 지점이 위험하다 — 실측상 유닛 50개 중 0단어 2개('Unit 1' 두 개)
//     와 1단어 유령 유닛 7개가 존재한다. 즉 반을 옮긴 학생이 아무 경고 없이
//     0~1단어 화면을 볼 수 있었다(전하은 사건과 동일 계열의 실패).
//
// 이미 고쳐져 있던 것 / 안 고쳐져 있던 것:
//   resolveClassUnit 은 2026-08 감사에서 이미 normalizeUnitKey 로 표기 흔들림을
//   흡수하고 "정규화 후 후보가 2개 이상이면 고르지 않는다"는 원칙까지 갖췄다.
//   그런데 resolveStudentUnitObj / setStudentClass / setStudentUnit 이 그 함수를
//   쓰지 않아 원칙이 적용되지 않았다. 이 수정은 새 규칙을 만들지 않고 **이미
//   있는 규칙을 나머지 경로에 연결**한다.
//
// 안전성 실측(수정 착수 전, 읽기 전용 라이브 조회):
//   전체 학생 1157명 중 current_unit_id 가 유효한 215명은 FK 경로라 폴백과
//   무관하고, 나머지 942명은 소속 반에 유닛이 0개라 이미 null 을 받고 있었다.
//   즉 `|| units[0]` 제거로 동작이 바뀌는 현재 학생은 **0명**이다 — 이 변경은
//   현재 피해를 되돌리는 게 아니라 앞으로의 반 이동을 막는 안전망이다.
//
// 커버리지 경계(정직 기록):
//   scripts/fakeSupabaseModule.mjs 는 읽기(select) 전용 스텁이라 insert/update 를
//   지원하지 않는다. 그래서 setStudentClass/setStudentUnit 의 **쓰기 왕복**은
//   이 하네스로 구동할 수 없다. 대신 둘로 나눠 검증한다:
//     · 해석 경로(resolveStudentUnitObj/getStudentUnit/getStudentUnitId/
//       getStudentWords) — 실제 함수를 구동하는 **행동 검증**. 위험의 절반인
//       "조용한 첫 유닛 착지"가 여기 있다.
//     · 쓰기 경로(setStudentClass/setStudentUnit) — 공유 리졸버를 실제로
//       거치는지, raw `=== s.unitName` / `|| units[0]` 패턴이 남아 있지 않은지
//       **소스 정적 검증**. 주석 오탐을 막기 위해 인라인 주석을 제거한
//       codeOnly 로 검사한다.
//
// 등록: npm run verify:class-move-unit
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BUNDLE = path.resolve(process.env.WORDLIB_OFFLINE_BUNDLE || 'scripts/.tmp/wordLibrary.offline.bundle.mjs')
const stub = await import(pathToFileURL(path.resolve('scripts/fakeSupabaseModule.mjs')).href)
const lib = await import(pathToFileURL(BUNDLE).href)

let failures = 0, asserted = 0
function check(label, cond, detail) {
  asserted++
  if (cond) console.log(`  PASS  ${label}`)
  else { console.log(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`); failures++ }
}

const CLS_A = 'c-aaaa', CLS_B = 'c-bbbb', CLS_C = 'c-cccc'
const SID = 's-1111'

// 반A는 'Unit6' 표기, 반B는 'Unit 6' 표기 — 프로덕션에 실제로 공존하는 두
// 형식(UnitN 29개 / Unit N 13개)을 그대로 재현한다. 반B의 첫 유닛은 실측
// 유령 유닛과 같은 "0단어 Unit 1"이라, 폴백이 발동하면 그리로 떨어진다.
// 반C는 같은 유닛의 두 표기가 공존하는 분열 상태(모호 케이스).
function dataset({ unitName = 'Unit6', classId = CLS_A, currentUnitId = null, units } = {}) {
  return {
    classes: [
      { id: CLS_A, name: '반A' },
      { id: CLS_B, name: '반B' },
      { id: CLS_C, name: '반C' },
    ],
    units: units || [
      { id: 'uA6', class_id: CLS_A, name: 'Unit6', position: 6 },
      { id: 'uB1', class_id: CLS_B, name: 'Unit 1', position: 1 },   // 0단어 — 폴백 착지 지점
      { id: 'uB6', class_id: CLS_B, name: 'Unit 6', position: 6 },
      { id: 'uC1a', class_id: CLS_C, name: 'Unit 1', position: 1 },
      { id: 'uC1b', class_id: CLS_C, name: 'Unit1', position: 2 },
    ],
    words: [
      { id: 'w1', unit_id: 'uA6', word: 'apple', meaning: '사과', position: 1 },
      { id: 'w2', unit_id: 'uB6', word: 'apple', meaning: '사과', position: 1 },
      // uB1 에는 단어를 두지 않는다(실측 0단어 유닛 재현)
    ],
    students: [
      { id: SID, name: '이동학생', class_id: classId, unit_name: unitName, current_unit_id: currentUnitId },
    ],
    student_class_assignments: [],
    textbooks: [],
  }
}

// initWordLibrary()는 _initPromise 를 캐시해 두 번째 호출부터 no-op 이다
// (소스 420행 주석 "Safe to call multiple times — subsequent calls reuse the
// same promise"). 시나리오마다 데이터셋을 갈아끼워야 하므로 개별 refresh 를
// 직접 호출한다 — initWordLibrary 가 내부에서 부르는 것과 같은 함수들이다.
async function boot(opts) {
  stub.__setDataset(dataset(opts))
  await lib.refreshWordLibrary()
  await lib.refreshStudents()
  await lib.refreshClassSettings()
  await lib.refreshTextbooks()
}

console.log('\n=== 반 이동 유닛 해석 — 표기 흔들림/폴백 계약 ===\n')

console.log('1. resolveClassUnit 기존 계약 (회귀 방지 — 이미 정상인 부분)')
{
  await boot({})
  check('완전 일치는 그대로 찾는다', lib.resolveClassUnit('반B', 'Unit 6')?.id === 'uB6')
  check('표기 흔들림을 흡수한다(Unit6 -> Unit 6)', lib.resolveClassUnit('반B', 'Unit6')?.id === 'uB6')
  check('공백/대소문자 흔들림도 흡수(unit  6)', lib.resolveClassUnit('반B', 'unit  6')?.id === 'uB6')
  check('없는 유닛은 null', lib.resolveClassUnit('반B', 'Unit 99') === null)
  check('모호(두 표기 공존) + 완전일치 있으면 그것', lib.resolveClassUnit('반C', 'Unit 1')?.id === 'uC1a')
  check('모호 + 완전일치 없으면 고르지 않는다', lib.resolveClassUnit('반C', 'unit 1') === null)
}

console.log('\n2. [핵심] 해석 불가 시 조용히 첫 유닛으로 떨어지지 않는다')
{
  await boot({ unitName: 'Unit99', classId: CLS_B, currentUnitId: null })
  const u = lib.getStudentUnitId(SID)
  check('임의의 첫 유닛(0단어 uB1)을 반환하지 않는다', u !== 'uB1', String(u))
  check('null 을 반환한다(못 찾으면 못 찾았다고 한다)', u === null, String(u))
  const words = await lib.getStudentWords(SID)
  check('0단어 유령 유닛의 단어를 조용히 보여주지 않는다', !Array.isArray(words) || words.length === 0, String(words?.length))
}

console.log('\n3. [핵심] 표기가 달라도 학생 유닛 해석이 이어진다')
{
  await boot({ unitName: 'Unit6', classId: CLS_B, currentUnitId: null })
  const u = lib.getStudentUnitId(SID)
  check('unit_name="Unit6" 가 반B의 "Unit 6"으로 해석된다', u === 'uB6', String(u))
  check('표시 이름도 실제 유닛 이름이다', lib.getStudentUnit(SID) === 'Unit 6', String(lib.getStudentUnit(SID)))
  const words = await lib.getStudentWords(SID)
  check('해당 유닛의 단어가 보인다', Array.isArray(words) && words.length === 1, String(words?.length))
}

console.log('\n4. FK(current_unit_id) 우선순위 — 이름보다 항상 앞선다 (회귀 방지)')
{
  await boot({ unitName: 'Unit 1', classId: CLS_B, currentUnitId: 'uB6' })
  check('unit_name 이 다른 유닛을 가리켜도 FK 가 이긴다', lib.getStudentUnitId(SID) === 'uB6', String(lib.getStudentUnitId(SID)))
  check('표시 이름도 FK 가 가리키는 유닛', lib.getStudentUnit(SID) === 'Unit 6', String(lib.getStudentUnit(SID)))
}

console.log('\n5. 모호한 반 — 임의 선택 금지')
{
  await boot({ unitName: 'Unit 1', classId: CLS_C, currentUnitId: null })
  check('완전 일치가 있으면 그것을 쓴다(uC1a)', lib.getStudentUnitId(SID) === 'uC1a', String(lib.getStudentUnitId(SID)))
  await boot({ unitName: 'unit 1', classId: CLS_C, currentUnitId: null })
  check('완전 일치 없고 후보 2개면 null(첫 유닛 아님)', lib.getStudentUnitId(SID) === null, String(lib.getStudentUnitId(SID)))
}

console.log('\n6. 완전 일치 무회귀 (평범한 경우)')
{
  await boot({ unitName: 'Unit 6', classId: CLS_B, currentUnitId: null })
  check('이름이 정확히 같으면 기존대로 해석', lib.getStudentUnitId(SID) === 'uB6', String(lib.getStudentUnitId(SID)))
  await boot({ unitName: 'Unit6', classId: CLS_A, currentUnitId: 'uA6' })
  check('FK + 이름이 모두 맞는 정상 상태 유지', lib.getStudentUnitId(SID) === 'uA6', String(lib.getStudentUnitId(SID)))
}

console.log('\n7. 유닛 0개인 반 — null (다른 반 유닛을 물고 가지 않음)')
{
  await boot({ unitName: 'Unit6', classId: CLS_B, currentUnitId: null, units: [{ id: 'uA6', class_id: CLS_A, name: 'Unit6', position: 6 }] })
  const u = lib.getStudentUnitId(SID)
  check('소속 반에 유닛이 없으면 null', u === null, String(u))
  check('다른 반(반A)의 uA6 를 반환하지 않는다', u !== 'uA6', String(u))
}

console.log('\n8. 쓰기 경로 정적 계약 (스텁이 update 를 지원하지 않아 소스로 고정)')
{
  const src = fs.readFileSync('src/utils/wordLibrary.js', 'utf8')
  // 주석 오탐 방지 — 라인 주석 제거본으로 검사.
  // 주의: 이 저장소 체크아웃은 CRLF다. JS 정규식에서 `.` 는 줄종결자(\r 포함)를
  // 매칭하지 않으므로 흔히 쓰는 /\/\/.*$/ 는 CRLF 파일에서 주석을 **못 지운다**
  // (실제로 이 테스트를 처음 작성했을 때 그래서 자기 주석에 걸려 오탐이 났다).
  // 문자클래스로 명시해 \r 앞까지 안전하게 잘라낸다.
  const codeOnly = src.split(/\r?\n/).map((l) => l.replace(/\/\/[^\r\n]*/, '')).join('\n')

  // 함수 선언부터 다음 최상위 `}` 까지를 본문으로 본다(중괄호 균형 계산 —
  // 추출 실패 시 조용히 통과하지 않도록 길이/시그니처를 먼저 단언한다).
  function bodyOf(decl) {
    const start = codeOnly.indexOf(decl)
    if (start < 0) return ''
    let depth = 0, seen = false
    for (let i = start; i < codeOnly.length; i++) {
      const ch = codeOnly[i]
      if (ch === '{') { depth++; seen = true }
      else if (ch === '}') { depth--; if (seen && depth === 0) return codeOnly.slice(start, i + 1) }
    }
    return ''
  }

  const setClassBody = bodyOf('export async function setStudentClass')
  check('setStudentClass 본문을 추출했다', setClassBody.length > 100 && setClassBody.includes('setStudentClass'), String(setClassBody.length))
  check('setStudentClass 가 공유 리졸버를 쓴다',
    /findUnitByName|resolveClassUnit/.test(setClassBody))
  check('setStudentClass 에 raw 이름 완전일치가 남아 있지 않다',
    !/\.find\(\s*\(u\)\s*=>\s*u\.name === s\.unitName\s*\)/.test(setClassBody))

  const setUnitBody = bodyOf('export async function setStudentUnit')
  check('setStudentUnit 본문을 추출했다', setUnitBody.length > 100 && setUnitBody.includes('setStudentUnit'), String(setUnitBody.length))
  check('setStudentUnit 이 공유 리졸버를 쓴다', /findUnitByName|resolveClassUnit/.test(setUnitBody))
  check('setStudentUnit 에 raw 이름 완전일치가 남아 있지 않다',
    !/\.find\(\s*\(u\)\s*=>\s*u\.name === unitName\s*\)/.test(setUnitBody))

  // 2026-08-30 야간 감사 — 단건 경로(setStudentClass)만 고치고 **일괄
  // 이동**(관리자 "일괄 이동")을 빠뜨렸던 것을 발견해 함께 고정한다.
  // 일괄 경로는 한 번의 실수가 여러 학생을 동시에 유닛 없는 상태로 만들어
  // 단건보다 위험하다.
  const bulkBody = bodyOf('export async function setStudentsClassBulk')
  check('setStudentsClassBulk 본문을 추출했다', bulkBody.length > 100 && bulkBody.includes('setStudentsClassBulk'), String(bulkBody.length))
  check('setStudentsClassBulk 가 공유 리졸버를 쓴다', /findUnitByName|resolveClassUnit/.test(bulkBody))
  check('setStudentsClassBulk 에 raw 이름 완전일치가 남아 있지 않다',
    !/\.find\(\s*\(u\)\s*=>\s*u\.name === unitName\s*\)/.test(bulkBody))
  check('setStudentsClassBulk 에 첫 유닛 폴백이 없다', !/\|\|\s*(tb)?[Uu]nits\[0\]/.test(bulkBody))

  const resolveBody = bodyOf('function resolveStudentUnitObj')
  check('resolveStudentUnitObj 본문을 추출했다', resolveBody.length > 100)
  check('resolveStudentUnitObj 가 공유 리졸버를 쓴다', /findUnitByName/.test(resolveBody))
  check('resolveStudentUnitObj 에 FK 우선 경로가 남아 있다(회귀 방지)',
    /u\.id === s\.unitId/.test(resolveBody))

  // "이름으로 못 찾으면 조용히 첫 유닛" 폴백이 **학생 유닛 해석 경로에서**
  // 사라졌는지. 저장소 전체를 금지하지 않는 이유(정직 기록): wordLibrary.js
  // 에는 목적이 다른 `|| units[0]` 이 3곳 더 있다 —
  //   · setPrimaryTextbook 계열 2곳: "단어가 있는 첫 유닛, 없으면 첫 유닛"
  //     으로 교재 배정 시 **초기** 유닛을 고르는 로직
  //   · 시험 범위 지정 1곳: targetUnitId 조회 실패 시 폴백
  // 이들은 이름 매칭 실패와 무관한 별개 흐름이라 이번 수정 범위 밖이며,
  // 건드리지 않았다. 같은 계열의 위험이 있는지는 별도 판단이 필요하다.
  check('resolveStudentUnitObj 에 `|| units[0]` 폴백이 없다', !/\|\|\s*units\[0\]/.test(resolveBody))
  check('resolveStudentUnitObj 에 `|| tbUnits[0]` 폴백이 없다', !/\|\|\s*tbUnits\[0\]/.test(resolveBody))
  check('setStudentClass 에 첫 유닛 폴백이 없다', !/\|\|\s*(tb)?[Uu]nits\[0\]/.test(setClassBody))
  check('setStudentUnit 에 첫 유닛 폴백이 없다', !/\|\|\s*(tb)?[Uu]nits\[0\]/.test(setUnitBody))
  check('normalizeUnitKey 정규화 헬퍼가 여전히 존재한다', /normalizeUnitKey/.test(codeOnly))
  check('findUnitByName 이 export 되어 공유된다', /export function findUnitByName/.test(codeOnly))
}

console.log('\n' + '='.repeat(60))
console.log(`총 단언 ${asserted}개 중 실패 ${failures}개`)
if (failures > 0) { console.log('FAILED'); process.exit(1) }
console.log('ALL PASS — 표기 흔들림 흡수 + 조용한 첫 유닛 폴백 없음')
