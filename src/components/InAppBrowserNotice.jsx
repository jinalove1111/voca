import { isAndroid, openInChrome } from '../utils/browserDetect'

// Shown wherever a mic-dependent feature would otherwise try to run inside
// an in-app browser (KakaoTalk, Instagram, etc.) — those WebViews handle
// microphone permission unreliably, so we steer the student to a real
// browser instead of letting them hit a flaky/repeating permission prompt.
export default function InAppBrowserNotice({ compact = false }) {
  return (
    <div className={`bg-orange-50 border-2 border-orange-200 rounded-2xl text-center ${compact ? 'p-3' : 'p-5'}`}>
      <div className="text-3xl mb-1">⚠️</div>
      <p className="font-black text-orange-700 text-sm">
        지금 카카오톡(또는 다른 앱) 브라우저로 열려있어요
      </p>
      <p className="text-orange-500 text-xs mt-1 leading-relaxed">
        이 화면에서는 마이크가 불안정해요.<br />
        <span className="font-bold">Chrome</span>에서 열어야 녹음이 안정적으로 돼요!
      </p>
      {isAndroid() ? (
        <button
          onClick={openInChrome}
          className="w-full mt-3 bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-xl btn-press"
        >
          🌐 Chrome에서 열기
        </button>
      ) : (
        <p className="text-orange-600 text-xs font-bold mt-2">
          오른쪽 아래(⋮) 메뉴에서 &ldquo;다른 브라우저로 열기&rdquo;를 눌러주세요
        </p>
      )}
    </div>
  )
}
