# Claude Code stall watcher (dev-infra only, rule 12 - student app unrelated).
# 5분 무진행(stall) 감지의 "판정/알림" 절반 - heartbeat 기록 절반은
# scripts/hooks/claudeHeartbeat.mjs (Claude Code 훅이 이벤트마다 기록).
#
# 실행(운영자 수동): npm run watch:claude-stall
#   (재부팅 자동 실행은 의도적으로 미구현 - 운영자 요청 2026-08-15)
#
# stall 판정 규칙 - state가 'active'(Claude가 생각/생성 중)로만
# StallSeconds(기본 300초) 이상 heartbeat가 미갱신이고, Claude 프로세스가
# 실제 살아 있을 때만 알림 1회. 오탐 방지:
#   tool-running  -> npm build/verify 등 명령이 정상 실행 중 - 알림 금지
#   waiting-user  -> 턴 종료/권한 대기 등 정상 입력 대기 - 알림 금지
#   session-ended -> 세션 정상 종료 - 알림 금지
#   Claude 프로세스 사망 -> 이미 끝난 세션 - 알림 금지
# 중복 방지: 같은 heartbeat ts(같은 stall)로는 재알림하지 않는다
# (lastAlertedTs를 StatePath에 기록). activity가 재개되면 heartbeat ts가
# 바뀌므로 자동 reset되고, 다음 stall(새 ts)은 새 알림을 허용한다.
# CPU: Start-Sleep 폴링(기본 30초)만 - busy loop 없음.
param(
  [int]$StallSeconds = 300,
  [int]$PollSeconds = 30,
  [switch]$Once,
  # auto: heartbeat pid 생존 확인 -> 실패 시 claude CLI 프로세스 스캔 폴백.
  # assume-alive / assume-dead 는 테스트 전용(프로세스 상태 시뮬레이션).
  [ValidateSet('auto', 'assume-alive', 'assume-dead')]
  [string]$ProcessCheckMode = 'auto',
  [string]$HeartbeatPath = (Join-Path $env:LOCALAPPDATA 'claude-stall\heartbeat.json'),
  [string]$StatePath = (Join-Path $env:LOCALAPPDATA 'claude-stall\watcher-state.json'),
  [string]$NotifyScript = (Join-Path $PSScriptRoot 'notify-windows.ps1'),
  [switch]$NoToast, # 테스트 전용 - 판정 로직만 검증, 실제 알림 생략
  [string]$AlertTitle = 'Claude Code',
  [string]$AlertMessage = 'Claude 작업 확인 필요'
)

function Test-ClaudeAlive($hb) {
  if ($ProcessCheckMode -eq 'assume-alive') { return $true }
  if ($ProcessCheckMode -eq 'assume-dead') { return $false }
  # 1차 - heartbeat가 기록한 부모 pid 생존 확인
  if ($hb.pid) {
    try {
      if (Get-Process -Id ([int]$hb.pid) -ErrorAction Stop) { return $true }
    } catch {}
  }
  # 2차 폴백 - claude CLI 프로세스 스캔(Name 필터를 먼저 걸어 watcher 자신
  # (powershell/pwsh)이 'claude' 경로 문자열로 오탐되는 것을 방지)
  try {
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='claude.exe' OR Name='bun.exe'" -ErrorAction Stop
    foreach ($p in $procs) {
      if ($p.CommandLine -and $p.CommandLine -match 'claude') { return $true }
    }
  } catch {}
  return $false
}

function Invoke-StallCheck {
  if (-not (Test-Path $HeartbeatPath)) { return 'no-heartbeat' }
  $hb = $null
  try { $hb = Get-Content -Raw -Path $HeartbeatPath | ConvertFrom-Json } catch {}
  if (-not $hb -or -not $hb.ts) { return 'bad-heartbeat' }
  # 'active'(Claude가 생각/생성 중)만 stall 후보 - 나머지 상태는 전부 정상
  if ($hb.state -ne 'active') { return "not-stall-state:$($hb.state)" }
  $ageMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$hb.ts
  if ($ageMs -lt ([long]$StallSeconds * 1000)) { return 'active-recent' }
  if (-not (Test-ClaudeAlive $hb)) { return 'claude-not-running' }
  # 같은 stall(같은 heartbeat ts) 중복 알림 금지
  $st = $null
  if (Test-Path $StatePath) {
    try { $st = Get-Content -Raw -Path $StatePath | ConvertFrom-Json } catch {}
  }
  if ($st -and ([string]$st.lastAlertedTs -eq [string]$hb.ts)) { return 'already-alerted' }
  # 알림 발사 전에 먼저 기록 - watcher가 알림 도중 죽어도 중복 알림은 없다
  $stDir = Split-Path -Parent $StatePath
  if ($stDir -and -not (Test-Path $stDir)) { New-Item -ItemType Directory -Force -Path $stDir | Out-Null }
  @{ lastAlertedTs = $hb.ts; alertedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -Path $StatePath
  if (-not $NoToast) {
    # 별도 프로세스로 실행 - notify-windows.ps1의 exit가 watcher를 죽이지 않게
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $NotifyScript -Title $AlertTitle -Message $AlertMessage | Out-Null
  }
  return 'alerted'
}

if ($Once) {
  Write-Output (Invoke-StallCheck)
  exit 0
}

Write-Output "[watchClaudeStall] stall>=$StallSeconds s / poll=$PollSeconds s / heartbeat=$HeartbeatPath (Ctrl+C to stop)"
while ($true) {
  $r = Invoke-StallCheck
  Write-Output ("[{0}] {1}" -f (Get-Date).ToString('HH:mm:ss'), $r)
  Start-Sleep -Seconds $PollSeconds
}
