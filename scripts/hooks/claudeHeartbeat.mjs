// Claude Code heartbeat hook (dev-infra only, rule 12 — 학생 앱 무관).
// 5분 무진행(stall) 감지의 "기록" 절반 — 상주 프로세스 없이, Claude Code 훅
// 이벤트가 발생할 때마다 heartbeat 파일에 {state, ts, pid}만 기록한다.
// 판정/알림 절반은 scripts/watchClaudeStall.ps1 (운영자 수동 실행).
//
// state 의미 (watcher의 오탐 방지 근거):
//   tool-running — PreToolUse 직후. npm build/verify 등 장시간 명령이 정상
//                  실행 중인 구간이므로 절대 stall로 판정하지 않는다.
//   active       — PostToolUse/UserPromptSubmit 직후. Claude가 생각/생성 중.
//                  이 상태로만 5분 이상 미갱신 시 stall 후보가 된다.
//   waiting-user — Stop(턴 종료)/Notification(권한·입력 대기). 사용자 입력을
//                  정상적으로 기다리는 상태 — stall 아님.
//   session-ended — SessionEnd. 세션이 정상 종료됨 — stall 아님.
//
// 실패해도 세션을 절대 방해하지 않는다(전체 try/catch, 항상 exit 0).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const EVENT_STATE = {
  pre: 'tool-running',
  post: 'active',
  prompt: 'active',
  stop: 'waiting-user',
  notification: 'waiting-user',
  'session-end': 'session-ended',
}

try {
  const event = (process.argv[2] || '').toLowerCase()
  const state = EVENT_STATE[event]
  if (state) {
    // CLAUDE_STALL_DIR 오버라이드는 테스트 전용(scripts/testStallWatcher 참조)
    const dir = process.env.CLAUDE_STALL_DIR
      || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'claude-stall')
    fs.mkdirSync(dir, { recursive: true })
    const payload = JSON.stringify({
      state,
      event,
      ts: Date.now(),
      iso: new Date().toISOString(),
      // 훅은 Claude Code 프로세스(또는 그 쉘)의 자식으로 뜬다 — watcher가
      // 이 pid 생존을 먼저 확인하고, 죽어 있으면 claude CLI 프로세스 스캔으로
      // 폴백한다(watchClaudeStall.ps1 Test-ClaudeAlive).
      pid: process.ppid,
    })
    // 부분 읽기 방지 — tmp에 쓰고 rename(원자적 교체)
    const tmp = path.join(dir, `heartbeat.${process.pid}.tmp`)
    fs.writeFileSync(tmp, payload)
    fs.renameSync(tmp, path.join(dir, 'heartbeat.json'))
  }
} catch {
  // 알림 인프라 실패가 본 작업을 깨면 안 된다
}
process.exit(0)
