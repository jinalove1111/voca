# Windows balloon/toast notification for Claude Code Stop hook (operator request, 2026-08-15).
# No external modules (repo constitution rule 6) - built-in .NET NotifyIcon only.
# ASCII-only on purpose: powershell.exe 5.1 misreads BOM-less UTF-8 Korean as ANSI.
# Dev-infra only, unrelated to the student app (rule 12).
param(
  [string]$Title = "Claude Code",
  [string]$Message = "Task finished - check your session"
)
try {
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  Add-Type -AssemblyName System.Drawing | Out-Null
  $ni = New-Object System.Windows.Forms.NotifyIcon
  $ni.Icon = [System.Drawing.SystemIcons]::Information
  $ni.Visible = $true
  $ni.BalloonTipTitle = $Title
  $ni.BalloonTipText = $Message
  $ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  $ni.ShowBalloonTip(7000)
  # Keep the process alive long enough for the balloon to display, then clean up.
  Start-Sleep -Seconds 7
  $ni.Visible = $false
  $ni.Dispose()
  exit 0
} catch {
  # Never let a notification failure disturb the session.
  exit 0
}
