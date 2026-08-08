// src/utils/gamification/dailyMissionModel.js — 오늘의 미션 판정(순수 모델)
//
// curriculumModel.js 관례: import 0개, React/Supabase/네트워크 무의존 —
// 값을 받아 값을 돌려주는 함수만. IO(당일 진행/단어 상태 조회)는 호출부
// (학생 홈 카드) 책임. 규칙 수치의 단일 원본은 docs/GAME_REWARD_RULES.md §2.
//
// 제품 원칙(2026-08-09 운영자 지시):
//   - 미션은 "실제 학습 행동 완료"만 인정 — 출석/접속은 미션이 아니다.
//   - 판정은 전부 기존 기록(student_daily_progress/word_status/오늘 배정)의
//     파생 계산 — 이 모듈은 어떤 보상도 "지급"하지 않는다(지급은 서버 원장,
//     P1 범위 — 클라이언트 판정만으로 자원이 늘지 않으므로 파밍 불가).

// buildDailyMissions(input) → { missions: [{ id, label, done, progressText }],
//                               doneCount, total, allDone }
// input(전부 기존 데이터에서 호출부가 계산해 전달):
//   {
//     assignedWordCount,   // 오늘 배정 단어 수(배정 없으면 null)
//     learnedWordCount,    // 오늘 학습(노출)한 단어 수
//     quizDone,            // 뜻 퀴즈 카테고리 완료 여부
//     writingDone,         // 철자 쓰기 카테고리 완료 여부
//     unknownTotal,        // 현재 unknown(모르는 단어) 개수
//     unknownRetried,      // 오늘 unknown 재학습(정답 전환 포함) 단어 수
//   }
export const DEFAULT_TARGET_WORDS = 20

export function buildDailyMissions(input) {
  const i = input || {}
  const target = Number.isFinite(i.assignedWordCount) && i.assignedWordCount > 0
    ? i.assignedWordCount
    : DEFAULT_TARGET_WORDS
  const learned = Math.max(0, Number(i.learnedWordCount) || 0)
  const unknownTotal = Math.max(0, Number(i.unknownTotal) || 0)
  const unknownRetried = Math.max(0, Number(i.unknownRetried) || 0)

  const missions = [
    {
      id: 'learn_words',
      label: `단어 ${target}개 학습`,
      done: learned >= target,
      progressText: `${Math.min(learned, target)}/${target}`,
    },
    {
      id: 'quiz',
      label: '뜻 퀴즈 완료',
      done: i.quizDone === true,
      progressText: i.quizDone === true ? '완료' : '미완료',
    },
    {
      id: 'writing',
      label: '철자 쓰기 완료',
      done: i.writingDone === true,
      progressText: i.writingDone === true ? '완료' : '미완료',
    },
    // 모르는 단어가 애초에 없으면 "오늘은 없음!"으로 자동 달성 — 복습할 게
    // 없는 학생에게 불가능 미션을 주지 않는다(GAME_REWARD_RULES §2).
    unknownTotal === 0
      ? { id: 'retry_unknown', label: '틀린 단어 다시 공부', done: true, progressText: '오늘은 없음!' }
      : {
          id: 'retry_unknown',
          label: '틀린 단어 다시 공부',
          done: unknownRetried >= 1,
          progressText: unknownRetried >= 1 ? '완료' : `모르는 단어 ${unknownTotal}개 대기`,
        },
  ]
  const doneCount = missions.filter((m) => m.done).length
  return { missions, doneCount, total: missions.length, allDone: doneCount === missions.length }
}
