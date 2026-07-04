// In-app browsers (KakaoTalk, Instagram, Facebook, Line, Band, etc.) are
// WebViews embedded inside another app, not a full standalone browser.
// getUserMedia/mic-permission handling inside them is unreliable across
// devices — permission grants often don't persist, and some builds re-ask
// on every getUserMedia() call regardless of any caching we do on our side.
// This is a known platform limitation, not something fixable from web code:
// the fix is to detect it and steer the student to a real browser before
// they try to record.
const IN_APP_UA_PATTERNS = [
  /KAKAOTALK/i,
  /Instagram/i,
  /FBAN|FBAV/i, // Facebook
  /\bLine\//i,
  /NAVER\(inapp/i,
  /Band\//i,
  /wv\)/i, // generic Android WebView marker
]

export function isInAppBrowser() {
  const ua = navigator.userAgent || ''
  return IN_APP_UA_PATTERNS.some((p) => p.test(ua))
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent || '')
}

// Android in-app browsers can be escaped into Chrome via an intent:// URL —
// this is the standard trick Korean web services use to break out of
// KakaoTalk/Naver/etc. There's no equivalent on iOS; those browsers only
// expose "다른 브라우저로 열기" in their own share/menu UI, which we can't
// trigger programmatically, so we just show instructions there.
export function openInChrome() {
  const url = window.location.href.replace(/^https?:\/\//, '')
  if (isAndroid()) {
    window.location.href = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`
  }
}
