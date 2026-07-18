#!/usr/bin/env node
/**
 * scripts/hooks/suggestVerifyDomain.mjs
 *
 * PostToolUse 훅 스크립트 (저장소 로컬). Write/Edit/MultiEdit이 src/api/
 * scripts 안의 파일을 건드리면, 관련 있을 가능성이 높은
 * `npm run verify:<domain>` 명령을 stdout에 제안만 한다.
 *
 * **정직한 한계 표시(운영자 명시 요구사항, CLAUDE.md 규칙 18 참고)**:
 * 이 훅은 "완료 선언 시 자동으로 관련 테스트를 실행시키는" 강제 장치가
 * 아니다. PostToolUse 훅의 stdout이 이 환경에서 항상 에이전트의 대화
 * 컨텍스트에 안정적으로 다시 주입된다는 보장이 없어(도구 호출 자체를
 * 막는 PreToolUse의 exit 2와 달리, PostToolUse는 이미 끝난 행동에 대한
 * 사후 참고 정보일 뿐), 실제로 `npm run verify:xxx`를 실행하는 것은
 * 여전히 에이전트/사람의 몫이다 — 이 훅은 그 명령이 무엇인지 매번
 * 사람이 표 대조하는 수고를 줄여주는 편의 힌트일 뿐, 강제 게이트가
 * 아니다. 강제 게이트가 필요하면 `DEVELOPER_GUIDE.md`의 "AI 세션 표준
 * 워크플로우" 3단계(관련 verify 하네스 실행)를 프로세스로 지킬 것.
 *
 * 항상 exit 0(비차단) — 이 훅이 실패해도 어떤 작업도 막지 않는다.
 */

import process from 'node:process';

const killTimer = setTimeout(() => process.exit(0), 4500);
killTimer.unref?.();

// 파일 경로(부분 문자열) → 추천 verify 도메인. TESTING.md의 도메인↔스크립트
// 매핑표 + ARCHITECTURE.md의 주요 플로우를 근거로 작성 — 완전한 매핑이
// 아니라 "가장 흔한 경우"만 다루는 휴리스틱.
const HINTS = [
  { match: /verify-student-pin|verify-admin-pin|_pinAuth|StudentSelect|self-set-student-pin|set-student-pin|bulk-generate-temp-pins|clear-student-pin|unlock-student-pin/i, domain: 'login' },
  { match: /useStudent\.js|mergeProgress|syncStudentProgress/i, domain: 'persistence' },
  { match: /AdminScreen|Dashboard\.jsx|weeklyReport/i, domain: 'admin' },
  { match: /daily_assignments|FutureAssignmentPlanner|getStudentWords/i, domain: 'homework' },
  { match: /QuizGame|WordDetail\.jsx/i, domain: 'quiz' },
  { match: /SpellingQuestion|spelling\.js|spellingReviewApi/i, domain: 'writing' },
  { match: /entranceTest|EntranceTest/i, domain: 'admin' },
  { match: /current_unit_id|resolveStudentUnitObj|lastWordIndexByUnit|StudentSelect.*[Uu]nit/i, domain: 'unit' },
  { match: /speech\.js/i, domain: 'audio-tts' },
  { match: /wordLibrary\.js/i, domain: 'student' },
];

async function main() {
  let raw = '';
  try {
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    process.exit(0);
  }
  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolInput = payload.tool_input || payload.toolInput || {};
  const filePath = String(toolInput.file_path || toolInput.filePath || '');

  if (!/^(src|api|scripts)[\\/]/.test(filePath.replace(/^.*[\\/](src|api|scripts)[\\/]/, '$1/'))) {
    // src/, api/, scripts/ 바깥 파일(문서/설정 등)은 힌트 대상 아님.
    if (!/[\\/](src|api|scripts)[\\/]/.test(filePath)) process.exit(0);
  }

  const hit = HINTS.find((h) => h.match.test(filePath));
  if (!hit) process.exit(0);

  process.stdout.write(
    `[suggestVerifyDomain] ${filePath} 변경 감지 — 관련 회귀 확인 권장: npm run verify:${hit.domain}\n` +
      `(참고용 힌트일 뿐 자동 실행/강제 아님 — DEVELOPER_GUIDE.md AI 세션 표준 워크플로우 3단계 참고)\n`,
  );
  process.exit(0);
}

main();
