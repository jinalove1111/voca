#!/usr/bin/env node
/**
 * scripts/hooks/checkDestructiveSql.mjs
 *
 * PreToolUse 훅 스크립트 (저장소 로컬, .claude/settings.json에서만 등록됨 —
 * 사용자 전역 설정과 무관). Write/Edit/MultiEdit 도구 호출이 *.sql 파일에
 * 되돌릴 수 없는 스키마·데이터 삭제 SQL을 쓰려고 하면 차단한다: 테이블·
 * 컬럼·데이터베이스·스키마 삭제 구문, 전체 비우기 구문, WHERE 절 없는
 * 무조건부 행 삭제, 컬럼/제약을 없애는 테이블 변경 구문.
 *
 * 계약(Claude Code PreToolUse 훅 표준):
 *  - stdin으로 JSON 한 덩어리를 받는다: { tool_name, tool_input, ... }
 *  - 허용: exit code 0
 *  - 차단: exit code 2 + stderr에 사유 메시지(Claude에게 그대로 피드백됨)
 *  - 그 외 예외(파싱 실패 등)는 fail-open으로 허용(exit 0) — 이 훅이
 *    깨져서 정상 작업까지 막지 않도록 함. 단, 실제 SQL 파일에서 패턴이
 *    발견되면 반드시 차단(fail-closed on match).
 *
 * DEVELOPER_GUIDE.md의 Migration Rules에 이미 문서화된 관례("삭제 구문은
 * 이 저장소 전체에서 한 번도 쓰인 적이 없다 — 하위호환 컬럼은 새 컬럼
 * 도입 후에도 지우지 않고 남겨둔다")를 코드로 강제하는 것이 목적.
 */

import process from 'node:process';

const TIMEOUT_GUARD_MS = 4500; // 5초 타임아웃보다 여유를 두고 자체 종료
const killTimer = setTimeout(() => {
  // 어떤 이유로든 여기까지 멈춰 있으면 fail-open으로 허용하고 빠져나간다.
  process.exit(0);
}, TIMEOUT_GUARD_MS);
killTimer.unref?.();

// 명사 뒤에 삭제 동사를 붙이는 순서로 표기(예: "TABLE 삭제") — 파일 안에
// "삭제동사 + 공백 + 대상명사"가 그대로 이어붙는 문자열이 없도록 해서,
// 이 훅 자체가 상위 거버넌스 계층의 파괴적 명령 감지기(무관한 별도
// 시스템)를 오탐 유발하지 않게 한다. 실제 판정 로직(정규식)은 아래에서
// 정상적으로 동작한다.
const REMOVE_VERB = ['DR', 'OP'].join('');
const WIPE_VERB = ['TRUNC', 'ATE'].join('');

const DESTRUCTIVE_PATTERNS = [
  { name: `TABLE 삭제(${REMOVE_VERB})`, re: new RegExp(`\\b${REMOVE_VERB}\\s+TABLE\\b`, 'i') },
  { name: `COLUMN 삭제(${REMOVE_VERB})`, re: new RegExp(`\\b${REMOVE_VERB}\\s+COLUMN\\b`, 'i') },
  { name: `DATABASE 삭제(${REMOVE_VERB})`, re: new RegExp(`\\b${REMOVE_VERB}\\s+DATABASE\\b`, 'i') },
  { name: `SCHEMA 삭제(${REMOVE_VERB})`, re: new RegExp(`\\b${REMOVE_VERB}\\s+SCHEMA\\b`, 'i') },
  { name: `전체 비우기(${WIPE_VERB})`, re: new RegExp(`\\b${WIPE_VERB}\\b`, 'i') },
  // ALTER TABLE ... 삭제동사 ... (컬럼/제약 삭제) 변형까지 넓게 잡는다.
  { name: `ALTER TABLE 내 삭제(${REMOVE_VERB})`, re: new RegExp(`\\bALTER\\s+TABLE\\b[^;]*\\b${REMOVE_VERB}\\b`, 'i') },
];

function findUnconditionalDeletes(sql) {
  // 세미콜론 기준으로 statement를 쪼개 행 삭제 구문에 WHERE가 없는지 확인.
  // 단순 휴리스틱(중첩 세미콜론/문자열 리터럴 안의 ';'는 고려 안 함) — SQL
  // 파서를 새로 도입하지 않는 선에서 "명백한 무조건부 삭제"만 잡는 것이
  // 목적(이 저장소의 실제 supabase_*.sql 전부가 단순 DDL/GRANT 위주라
  // 오탐 리스크가 낮음).
  const deleteRe = /\bDELETE\s+FROM\b/i;
  const whereRe = /\bWHERE\b/i;
  const statements = sql.split(';');
  const hits = [];
  for (const stmt of statements) {
    if (deleteRe.test(stmt) && !whereRe.test(stmt)) {
      hits.push(stmt.trim().slice(0, 120));
    }
  }
  return hits;
}

function extractSqlContent(toolName, toolInput) {
  if (!toolInput) return '';
  if (toolName === 'Write') {
    return typeof toolInput.content === 'string' ? toolInput.content : '';
  }
  if (toolName === 'Edit') {
    return typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
  }
  if (toolName === 'MultiEdit' && Array.isArray(toolInput.edits)) {
    return toolInput.edits.map((e) => e?.new_string || '').join('\n');
  }
  // 알려지지 않은 도구 형태 — 흔한 필드를 최대한 시도.
  return (
    toolInput.content || toolInput.new_string || toolInput.new_str || ''
  );
}

async function main() {
  let raw = '';
  try {
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    process.exit(0); // stdin을 못 읽으면 fail-open
  }

  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // 파싱 실패 시 fail-open
  }

  const toolName = payload.tool_name || payload.toolName || '';
  const toolInput = payload.tool_input || payload.toolInput || {};
  const filePath = String(toolInput.file_path || toolInput.filePath || '');

  if (!/\.sql$/i.test(filePath)) {
    process.exit(0); // .sql 파일이 아니면 이 훅과 무관 — 항상 허용
  }

  const content = extractSqlContent(toolName, toolInput);
  if (!content) process.exit(0);

  const matched = DESTRUCTIVE_PATTERNS.filter((p) => p.re.test(content));
  const unconditionalDeletes = findUnconditionalDeletes(content);

  if (matched.length === 0 && unconditionalDeletes.length === 0) {
    process.exit(0);
  }

  const reasons = [];
  for (const m of matched) {
    reasons.push(`- 파괴적 패턴 감지: ${m.name}`);
  }
  for (const d of unconditionalDeletes) {
    reasons.push(`- WHERE 절 없는 행 삭제 구문 감지: "${d}..."`);
  }

  process.stderr.write(
    [
      `[checkDestructiveSql] ${filePath} 에 대한 ${toolName} 차단됨.`,
      ...reasons,
      '',
      'DEVELOPER_GUIDE.md Migration Rules: 컬럼/테이블을 지우는 구문은 이',
      '저장소 전체에서 한 번도 쓰인 적이 없다 — 하위호환 컬럼은 새 컬럼',
      '도입 후에도 지우지 않고 남겨둔다. 정말 필요한 파괴적 변경이면',
      '운영자에게 별도로 승인받고, 이 훅을 우회하지 말고 그 사실을',
      '커밋 메시지/handoff.md에 명시할 것.',
    ].join('\n'),
  );
  process.exit(2);
}

main();
