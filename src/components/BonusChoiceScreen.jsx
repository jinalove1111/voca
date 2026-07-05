// Shown every 5 completed words — lets the student choose a short balloon
// game or just keep studying. The balloon game itself checks word count,
// but we already know it here (classWords.length), so the button is
// disabled with an explanation up front instead of only failing after tap.
export default function BonusChoiceScreen({ completedCount, wordCount, onPlayGame, onContinue }) {
  const canPlay = wordCount >= 4

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-sky-400 to-indigo-500">
      <div className="bg-white rounded-3xl card-shadow p-8 max-w-sm w-full text-center animate-slide-up">
        <div className="text-6xl mb-3 animate-bounce">🎉</div>
        <h1 className="text-2xl font-black text-gray-800 mb-1">단어 {completedCount}개 완료!</h1>
        <p className="text-gray-500 text-sm mb-6">잠깐 쉬면서 보너스 게임 할까요?</p>

        <div className="space-y-3">
          <button onClick={onPlayGame} disabled={!canPlay}
            className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black py-4 rounded-2xl btn-press text-lg">
            🎈 풍선 게임 하기
          </button>
          {!canPlay && (
            <p className="text-xs text-gray-400">단어가 4개 이상일 때 게임을 할 수 있어요.</p>
          )}
          <button onClick={onContinue}
            className="w-full border-2 border-gray-200 text-gray-600 font-bold py-4 rounded-2xl btn-press">
            📖 다음 단어 계속 공부하기
          </button>
        </div>
      </div>
    </div>
  )
}
