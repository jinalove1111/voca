# scripts/prod-apply.ps1 — Production Safety Harness 2단계 승인 PowerShell 래퍼
# (fix/harness-apply-two-phase-approval, 2026-09-05)
#
# 배경: scripts/prodHotfix.mjs 가 예전에 쓰던 Node `readline/promises`
# 대화형 프롬프트가 Windows 에서 `AbortError: Aborted with Ctrl+C`
# (code: ABORT_ERR) 로 예고 없이 죽는 문제가 있었다(원인: readline 의
# raw-mode 키스트로크 감지가 "그 순간 stdin 에 리터럴 0x03 바이트가
# 도착했는가"만 보고, `rl.on('SIGINT')` 리스너가 없으면 즉시 그 질문을
# reject 한다 — 콘솔 입력 버퍼에 남아있던 이전 Ctrl+C 라도 상관없이 발동).
# 그래서 node 쪽 승인 절차 자체를 readline 없는 "1단계(티켓 발급) + 2단계
# (--approve <runId>)" 2회 CLI 실행으로 재설계했다(scripts/prodHotfix.mjs
# 파일 최상단 주석 참고).
#
# 이 스크립트는 그 2회 실행을 대신 조립해 주는 **순수 편의 래퍼**일 뿐이다.
# 실제 승인 게이트(티켓 존재/미사용/미만료/manifest sha 일치/baseline
# fingerprint 일치, CI/토큰/TTY 확인)는 전부 node(scripts/prodHotfix.mjs)
# 안에 있고, 이 스크립트는 그 게이트를 절대 우회하지 않는다 — 단지
# (a) 1단계를 실행하고, (b) 방금 생성된 티켓 파일에서 runId 를 읽고,
# (c) `Read-Host` 로 "APPLY <runId>" 정확 입력을 받아(PowerShell 자체 콘솔
# 입력 — node readline 이 전혀 관여하지 않으므로 위 AbortError 경로 자체가
# 없다) 일치할 때만 (d) 2단계(`--approve <runId>`)를 실행한다.
#
# 사용법:
#   pwsh -File scripts/prod-apply.ps1 -ManifestPath <manifest.json> [-Env production|staging] [-ReportDir <dir>]
#
# 래퍼를 쓰지 않아도 아래 두 명령을 손으로 그대로 실행하면 완전히 동일하게
# 동작한다(1단계 출력 마지막 줄이 2단계 명령을 그대로 인쇄해 준다):
#   npm run prod:apply -- <manifest.json> --env production
#   npm run prod:apply -- <manifest.json> --env production --approve <runId>

param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath,

  [ValidateSet('production', 'staging')]
  [string]$Env = 'production',

  [string]$ReportDir
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ManifestPath)) {
  Write-Error "manifest 파일을 찾을 수 없습니다: $ManifestPath"
  exit 1
}
$manifestFull = (Resolve-Path $ManifestPath).Path

$repoRoot = Split-Path -Parent $PSScriptRoot
$effectiveReportDir = if ($ReportDir) { $ReportDir } else { Join-Path $repoRoot 'scripts\.tmp\prod-reports' }

$npmArgs = @('run', 'prod:apply', '--', $manifestFull, '--env', $Env)
if ($ReportDir) { $npmArgs += @('--report-dir', $ReportDir) }

Write-Host "=== 1단계: 계획 검증 + 승인 티켓 발급 ==="
Write-Host "명령: npm $($npmArgs -join ' ')"
& npm @npmArgs
$phase1Exit = $LASTEXITCODE
if ($phase1Exit -ne 0) {
  Write-Host ""
  Write-Host "1단계가 STOP 되었습니다(exit $phase1Exit, 위 로그 확인). 2단계를 진행하지 않습니다."
  exit $phase1Exit
}

# 1단계 성공(exit 0)이라도 dry-run/CI/토큰없음이면 티켓이 아예 없을 수
# 있다(status=ready-to-apply, ticket-issued 아님) — 그 경우 승인 대상
# 자체가 없으므로 여기서 멈춘다.
if (-not (Test-Path $effectiveReportDir)) {
  Write-Host "보고서 디렉토리를 찾을 수 없습니다: $effectiveReportDir"
  exit 1
}
$latestTicket = Get-ChildItem -Path $effectiveReportDir -Filter '*.ticket.json' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latestTicket) {
  Write-Host ""
  Write-Host "승인 티켓 파일을 찾지 못했습니다 — 1단계가 ticket-issued 로 끝나지 않았을 수 있습니다"
  Write-Host "(--dry-run/CI 환경/SUPABASE_ACCESS_TOKEN 미설정이면 정상적으로 티켓이 발급되지 않습니다. 위 STATUS 줄을 확인하세요)."
  exit 1
}

$runId = $latestTicket.BaseName -replace '\.ticket$', ''
$expected = "APPLY $runId"

Write-Host ""
Write-Host "티켓 발견: $($latestTicket.FullName)"
Write-Host "runId: $runId"
Write-Host ""

# PowerShell 자체 Read-Host — node readline 을 전혀 거치지 않는다. Ctrl+C 로
# 취소하면 PowerShell 이 그대로 스크립트를 중단시킨다(2단계 명령 자체가
# 아직 실행되지 않았으므로 안전 — node 쪽에는 애초에 도달하지 않는다).
$answer = Read-Host "승인하려면 정확히 입력하세요: $expected"
if ($answer -ne $expected) {
  Write-Host ""
  Write-Host "STOP — 승인 문구가 정확히 일치하지 않습니다. 2단계를 실행하지 않습니다."
  exit 1
}

$approveArgs = @('run', 'prod:apply', '--', $manifestFull, '--env', $Env, '--approve', $runId)
if ($ReportDir) { $approveArgs += @('--report-dir', $ReportDir) }

Write-Host ""
Write-Host "=== 2단계: 승인 적용 ==="
Write-Host "명령: npm $($approveArgs -join ' ')"
& npm @approveArgs
exit $LASTEXITCODE
