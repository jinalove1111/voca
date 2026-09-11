# 보상 경로 전수 감사 (Reward Path Audit) - 2026-09-11

정정 2026-09-11: 표 A의 PAUL DOLLAR EFFECT 열 — 12종 전부 원장 도달
(`TOWN_ECONOMY_AUDIT_2026-09-11.md` §0 참고 — 이 문서의 표 A/2.2는
아래에서 이미 12종 전부의 서버 원장 도달을 정확히 기술하고 있어
내용 수정은 없음, 확인만 재기록).

READ-ONLY 코드 감사. 수정 없음 - 브랜치 qa/town-loop-hardening-2026-09-11
(HEAD 3870902 = main), 코드 변경 0, git status/git diff 변경 없음.
범위: src/hooks/useStudent.js의 모든 별/XP/원장 지급 호출부(grantReward/
grantLedgerReward/grantXp grep 전수) + 그걸 트리거하는 컴포넌트
(QuizGame/WordDetail·PronounceStep·SpeechBtn/SpellingQuestion/GuidedSession/
MatchGameShell/GiftReveal/LevelUpMission/EntranceTest/SentenceLearningFlow/
Dashboard) + 서버 api/grant-xp.js(reward 분기 L1~L3, 23505 흡수, L2.5,
REWARD_DAILY_CAP, KST 하루 경계) + src/utils/rewardEngine.js 상수.

## 0. 한 줄 요약

- 이벤트 17개(별 15종 + XP 전용 4종, 중복 있음 - 아래 표) 전부 추적, 지정된
  기존 회귀 스위트 9종 전부 PASS(합계 단언 800+ 개, 실패 0).
- 구조적으로 안전: 클라이언트 dedup(라운드/일자 키, 영구 배열) -> 서버
  idempotency_key UNIQUE -> 23505 흡수, 3중 방어가 15종 별 지급 전부에
  적용된다. 더블클릭/새로고침/재로그인 단일 이벤트 재발 시나리오는 기존
  회귀 스위트가 실측으로 커버(testComponentCallbackDoubleInvoke,
  testRewardRetryExactlyOneRow, testFortyFiveStudentIsolation).
- NEEDS DECISION(기존에 이미 알려진 미결정 사항, 이번 감사가 재확인):
  pronunciation-unidentified 브랜치(useStudent.js:1319-1320)는 서버 흡수
  대상이 아니고(idempotency 키가 항상 새로 생성됨) 이론상 무제한 반복 지급이
  가능하다 - production 실측 0건(rewardEngine.js 주석)이라 지금까지 드러난
  피해는 없지만 코드 경로 자체는 열려 있다. 아래 GAPS P1 참고.
- GAPS: testWritingCompleteRealReactTiming.mjs는 4->5(임계값 최초 도달)
  1회 지급만 검증하고, 5->6/6->7(임계값 통과 후 반복)의 "0회 지급" 및
  새로고침/재로그인 재발 시나리오는 어서션이 없다(P1, 아래 3.A 참고).
  testRewardStress45.mjs가 정보용으로 재확인한 L3 상한 TOCTOU(서로 다른
  sourceId 동시 도착 시 상한 초과 가능)도 기존에 알려진 GAP으로 재확인.

## 1. 방법론

- grep -n "grantReward(|grantLedgerReward(|grantXp(" on
  src/hooks/useStudent.js -> 17개 호출부 확인(줄 번호는 아래 표).
- 각 호출부의 트리거(어느 컴포넌트/이펙트가 언제 부르는가), dedupKey 조립
  방식, 클라이언트/서버 방어 계층을 소스 직접 대조.
- api/grant-xp.js의 ledger:'reward' 분기(L0 인증 -> L1 학생 실재 ->
  L2 exam 실재 -> L2.5 재시도 선판정 -> L3 일일 상한 -> insert -> 23505 흡수)와
  기존 XP 분기(isValidEventType/isValidSourceEventIdForEvent -> insert ->
  23505 흡수) 전문 대조.
- 지정된 회귀 스위트 9종을 직접 재실행(node, 네트워크 0) - 아래 4절에
  실행 결과 원문 인용.
- 수정/커밋/설치 없음. git status는 세션 시작 시점과 동일(untracked SQL
  파일들, 이 문서 파일 제외 변경 없음).

## 2. PHASE 2 - 이벤트별 전수 표

### 2.1 표 A - 지급액 / PD 효과 / Idempotency Key

| # | EVENT | TRIGGER (file:line) | STAR | XP | PAUL DOLLAR 효과 | IDEMPOTENCY KEY (정확한 템플릿) |
|---|---|---|---|---|---|---|
| 1 | word-view-complete | useStudent.js:1439 (useEffect, round.completedToday.length >= GOAL 최초 도달, L1427) | 0(XP 전용) | +2 | 없음(XP 이벤트, reward_ledger 미적재) | word-view-complete:${today} (grantXp source_event_id) |
| 2 | listening-complete | useStudent.js:1447 (같은 useEffect, round.examplesHeard >= GOAL) | 0 | +2 | 없음 | listening-complete:${today} |
| 3 | quiz-complete | useStudent.js:1448 (같은 useEffect, round.quizSolved >= GOAL) | 0 | +2 | 없음 | quiz-complete:${today} |
| 4 | daily-mission-complete | useStudent.js:1507 (useEffect, countCategoriesCompleted(round) >= 4, L1457) | 0 | +10 | 없음 | daily-mission-complete:${todayStr()} |
| 5 | writing-complete(XP) | useStudent.js:1791 (recordSpellingAnswer, justCompletedWriting 클로저 판정 L1780) | 해당없음 | +2 | 해당없음 | writing-complete:${today} |
| 5b | writing-complete(Ledger) | useStudent.js:1796 | +2 (grantReward 경유) | 위와 별개 | reward_ledger insert -> 트리거 rate 1 -> +2 PD | studentId:writing-complete:daily-writing:${today} (rewardIdempotencyKey) |
| 6 | word-session-complete | useStudent.js:1445 (같은 4/GOAL 판정, daily-words) | +1 | 없음 | 트리거 rate 1 -> +1 PD | studentId:word-session-complete:daily-words:${today} |
| 7 | daily-goal-complete | useStudent.js:1515 (4/4 라운드 완료 useEffect) | +3 | 없음 | 트리거 rate 1 -> +3 PD | studentId:daily-goal-complete:daily-goal:${todayStr()} |
| 8 | streak-bonus | useStudent.js:1583 (useEffect, streakBonusStars(streak), 값 2/3/5) | 가변(2/3/5) | 0 | 트리거 rate 1 -> 가변 PD | studentId:streak-bonus:streak:${todayStr()}:${streak} |
| 9 | exam-complete | useStudent.js:1886 (recordExamCompleted, EntranceTest.jsx:276에서 서버 저장 확정 후 호출) | +2 | 0 | 트리거 rate 1 -> +2 PD | studentId:exam-complete:entrance-test:${testId} |
| 10 | wrong-word-recovered | useStudent.js:1830(정답 경로)/1869(clearSpellingReviewWord) | +1 | 0 | 트리거 rate 1 -> +1 PD | studentId:wrong-word-recovered:spelling-review:${todayStr()}:${wordId} |
| 11 | pronunciation(wordId 있음) | useStudent.js:1322 (markPronunciationOk) | +1(legacy, grantReward 직접) | 0 | 레거시 흡수(parseLegacyDedupKey) -> reward_ledger insert -> +1 PD | 로컬: pronunciation:${wordId}:${todayStr()} -> 서버: studentId:pronunciation:pronunciation:${wordId}:${DATE} |
| 12 | pronunciation-unidentified(wordId 없음) | useStudent.js:1320 | +1(legacy) | 0 | 없음 - 서버 흡수 대상 아님(0 PD), parseLegacyDedupKey가 이 prefix를 인식하지 않아 null 반환 | pronunciation-unidentified:${Date.now()}:${Math.random()...} - 매번 새 키(비-idempotent) |
| 13 | mission-clear | useStudent.js:1253 (answerMission, willClear) | +3(legacy) | 0(v2.3.1에서 XP 트리거 제거됨) | 레거시 흡수 -> +3 PD | 로컬: mission-clear:${wordId} -> 서버: studentId:mission-clear:mission:${wordId} |
| 14 | daily-mission-bonus | useStudent.js:1497 (4/4 라운드 완료, MISSION_BONUS_STARS=10) | +10(legacy, 라운드 반복마다 매번) | 0(#4가 XP 담당) | 레거시 흡수 -> +10 PD(라운드마다) | 로컬: daily-mission-bonus:${signature}(signature=${round.date}:${sorted wordsViewed}) -> 서버: studentId:daily-mission-bonus:daily-round:${signature} |
| 15 | sticker-duplicate | useStudent.js:1356 (grantSticker, 중복 스티커 뽑기) | +20(legacy, DUPLICATE_BONUS_STARS) | 0 | 레거시 흡수 -> +20 PD | 로컬: sticker-duplicate:${sticker.id}:${giftKey}(giftKey는 round:.. / milestone:N / badge:N 중 하나) -> 서버 동형 |
| 16 | spelling-combo | useStudent.js:1841 (recordSpellingAnswer, 콤보 3/5/10) | 가변(1/2/3)(legacy) | 0(#5가 XP 담당) | 레거시 흡수 -> 가변 PD | 로컬: spelling-combo:${wordId}:${combo}:${todayStr()} -> 서버 동형 |
| 17 | matchgame | MatchGameShell.jsx:119 (onGrantReward, 라운드 정답 first-try) | +4/라운드(legacy, STAR_PER_CORRECT, 세션당 최대 5라운드=20) | 0 | 레거시 흡수 -> +4 PD/라운드 | 로컬: matchgame:${sessionId}:${round}:${target.dbId or word} -> 서버 동형 |

### 2.2 표 B - 방어/한도/재시도/UX 재발 시나리오

| # | EVENT | CLIENT GUARD | SERVER GUARD | DAILY LIMIT | RETRY(재전송 시) | DOUBLE CLICK | REFRESH | RELOGIN |
|---|---|---|---|---|---|---|---|---|
| 1-4 | XP 4종(word-view/listening/quiz/daily-mission-complete) | dailyCategoryXpFiredRef(마운트 내 Set, in-tick 최적화, useStudent.js:1429-1436) | xp_ledger (student_id, source_event_id) UNIQUE + isValidSourceEventIdForEvent(기간키 형식/허용폭 검증, api/grant-xp.js:566) | 구조적 하루 1건(day 기간키, resolveXpAmount가 status:'active'만 허용) | postXpEvent는 재시도 큐 없음(단발 fire-and-forget, 실패 시 그 이벤트의 XP는 영구 유실 - wordLibrary.js:3288-3299) | 카운터가 GOAL 도달 이후에도 계속 오르지만 tryFire의 fired Set이 같은 tick 중복 호출만 막고, 진짜 dedup은 서버 UNIQUE(23505 흡수) | dailyCategoryXpFiredRef는 새 마운트에서 초기화되지만 서버 UNIQUE가 여전히 막음 - 재전송돼도 duplicate:true로 흡수 | 새 AppInner 마운트(아래 3.D)로 ref 초기화, 서버 UNIQUE가 최종 방어 |
| 5b | writing-complete(Ledger) | writingCompleteGrantedDayRef(day 값 비교, in-tick 최적화, 1775) + hasRewardEntry 사전체크 + appendRewardEntry가 patch updater 안에서 idempotency_key 재검사(rewardEngine.js:164-169) | reward_ledger.idempotency_key UNIQUE + L1(학생 실재) + L3(cap=1/day) | 1/day(REWARD_DAILY_CAP['writing-complete']=1) | postRewardEvent 재시도 큐(최대 8회 시도, REWARD_POST_QUEUE_MAX_ATTEMPTS)로 네트워크 순단 시에도 서버 정확히 1행(testRewardRetryExactlyOneRow 실측) | SpellingQuestion.jsx의 reportedRef가 문제당 첫 시도에만 onResult 호출(SpellingQuestion.jsx:110,236-237) - 더블클릭 자체가 안 남 | 새로고침 후 재제출해도 justCompletedWriting은 클로저 재계산되고, 이미 5회 이상이면 prevCorrectSnapshot < GOAL 조건이 거짓이라 재발 안 함(단, 아래 3.A GAP - 6/7번째 정답이 이 조건으로 실제로 막히는지는 회귀 스위트에 없음) | 새 마운트로 writingCompleteGrantedDayRef 초기화, hasRewardEntry(영구 rewardLedger 배열, localStorage/서버 백업에서 복원)가 최종 방어 |
| 6,7,9,10 | word-session-complete/daily-goal-complete/exam-complete/wrong-word-recovered | ledgerGrantedKeysRef(in-tick Set) + hasRewardEntry 사전체크 + appendRewardEntry updater 내부 재검사 | UNIQUE + L3 cap(각 1/1/10/60) - exam-complete는 추가로 L2(entrance_test_results 실재 검증) | 1/1/10(시험당 2건 규모 실측 대비 5배 여유)/60(유닛 최대 단어수 기준 여유) | 동일 재시도 큐(8회) | selected!==null 가드(LevelUpMission 등 유사 패턴) 또는 EntranceTest.jsx의 submitResultToServer가 testId 키로 idempotent | 클로저 재계산 + 영구 rewardLedger/서버 UNIQUE 최종 방어 | 동일 |
| 8 | streak-bonus | 위와 동일 | UNIQUE + L3 cap=1 | 1/day(streak 값이 그대로인 한 재지급 없음) | 동일 재시도 큐 | 해당 없음(자동 useEffect, 사용자 클릭 아님) | history 재계산 후 같은 streak면 키 동일 -> dedup | 동일 |
| 11 | pronunciation | grantReward의 round.starGrantLog(영구, useStudent.js:1010-1017, patch updater 안 재검사) | (레거시 흡수 경로) UNIQUE + L3 cap=120 | 120/day(운영자 임시값, OPEN DECISION) | 동일 재시도 큐 | SpeechBtn/PronStep 둘 다 settledRef로 recording 완료 처리 1회 보장(WordDetail.jsx:117-121, QuizGame.jsx:109,144-145) + 성공 후 버튼 disabled | starGrantLog가 영구 배열(자정에만 리셋)이라 새로고침 후 재시도해도 오늘 같은 단어면 grantReward가 false 반환 | 새 마운트에서도 record.round.starGrantLog는 localStorage/서버 백업에서 복원되는 영구 데이터라 dedup 유지 |
| 12 | pronunciation-unidentified | 없음(키가 매번 고유, starGrantLog 검사를 항상 통과) | 없음(서버 흡수 대상 아님 - parseLegacyDedupKey가 null 반환, reward_ledger에 적재 자체가 안 됨) | 없음(구조적 무제한) - production 실측 0건(빈도 자체가 극히 낮음, word.dbId 부재는 이례적 데이터 상태) | 해당 없음(서버로 안 감) | settledRef가 recording 완료당 1회는 보장하지만, "몇 번이고 계속 녹음"은 막지 않음 -> 이론상 반복 시도마다 +1 | 로컬 totalStars만 오르고 새로고침해도 리셋 안 됨(누적 유지) - 즉 "리셋되어 안전"이 아니라 "막을 방법이 없어서 계속 쌓임" | 동일(영향 없음, 세션 무관하게 매번 새 키) |
| 13 | mission-clear | 클로저 사전계산(willClear, 1242) + grantReward.starGrantLog + 영구 missions[].done(가장 강한 방어 - 미션당 평생 1회) | 레거시 흡수 UNIQUE + L3 cap=40 | 40/day(유닛 최대 단어수 기준 여유), 실질 방어는 missions[].done 영구 플래그 | 동일 재시도 큐 | LevelUpMission.jsx:57 selected!==null 가드로 정답 선택 자체가 1회 | missions[].done이 영구 데이터라 재발 불가 | 동일 |
| 14 | daily-mission-bonus | handledRoundRef(마운트 내, signature 값 비교, 1471) + grantReward.starGrantLog(영구, signature 키) | 레거시 흡수 UNIQUE + L3 cap=12(라운드 반복 최대 7회 기준 여유) | 의도적으로 라운드 완료마다 반복 지급(게임 경제 설계, 서버 cap=12/day가 상한) | 동일 재시도 큐 | 없음(useEffect 기반, 사용자 클릭 무관) | handledRoundRef는 새 마운트에서 초기화되지만 starGrantLog(영구)가 같은 signature면 차단 | starGrantLog 영구 데이터로 dedup 유지 |
| 15 | sticker-duplicate | grantReward.starGrantLog(영구, giftKey 키) | 레거시 흡수 UNIQUE + L3 cap=15 | 15/day(라운드+마일스톤+뱃지 합 실측 기준) | 동일 재시도 큐 | 없음(뽑기 결과에 따라 자동 결정) | starGrantLog 영구 데이터로 같은 giftKey(같은 선물 이벤트) 재발 차단 | 동일 |
| 16 | spelling-combo | 클로저 사전계산(combo, 1812) + grantReward.starGrantLog(영구) | 레거시 흡수 UNIQUE + L3 cap=60 | 60/day(콤보 3단계 x 여유) | 동일 재시도 큐 | reportedRef(SpellingQuestion, 문제당 첫 시도 1회)로 원천 차단 | starGrantLog 영구, 같은 wordId+combo+날짜면 차단 | 동일 |
| 17 | matchgame | locked state(MatchGameShell.jsx:106-133, 정답 처리 중 재입력 차단) + grantReward.starGrantLog(영구, sessionId+round+word 키) + sessionBlockedRef(세션 시작 시점에 자격 latch) | 레거시 흡수 UNIQUE + L3 cap=5(구조적 상한 - 세션당 5라운드) | 클라이언트: 1세션/day(GAME_REWARD_DAILY_LIMIT=1, matchGame.js:24) + 3/4 카테고리 완료 게이트. 서버: cap=5(세션 라운드 수와 동일, 이중 방어) | 동일 재시도 큐 | locked state로 한 라운드 내 중복 탭 차단 | sessionIdRef는 매 startGame()마다 새로 발급 - 새로고침 후 재시작하면 새 세션이지만 클라이언트 게이트(countRewardedGameSessions, 영구 starGrantLog 기반)가 이미 오늘 보상 세션 1회를 썼으면 차단 | starGrantLog 영구 데이터 기준으로 세션 카운트 유지, 재로그인해도 오늘 이미 받았으면 차단 |

## 3. 검증 결과

### 3.A writing-complete - testWritingCompleteRealReactTiming.mjs

실제 React 18(react-dom/client + act())로 4->5(오늘 첫 GOAL 도달) 케이스를
단독 호출(시나리오 1)과 같은 tick interleave(시나리오 2, markWordViewed
직후 곧바로 recordSpellingAnswer) 둘 다 재현해 "정확히 1건 지급"을 확인한다
(둘 다 PASS). 시나리오 3은 하네스 자체의 건전성 대조군(이펙트 기반
word-session-complete는 항상 정상 동작해야 함, PASS).

커버하지 않는 것(파일을 직접 읽어 확인, GAPS 참고):
- 5->6/6->7(임계값을 이미 넘은 뒤 추가 정답) 시 0회 지급을 확인하는
  어서션이 파일에 없다. 코드상 방어 지점은 useStudent.js:1780의
  justCompletedWriting = prevCorrectSnapshot < GOAL && nextCorrectSnapshot >= GOAL
  (한 번 GOAL을 넘으면 prevCorrectSnapshot이 계속 GOAL 이상이라 항상 거짓)
  이지만, 이 경계 자체를 넘어서(6번째/7번째) 호출해 여전히 0건인지 실측하는
  테스트는 없다.
- 새로고침(리마운트) 후 같은 날 6번째 정답을 제출하는 시나리오도 없다 -
  이 경우 실제 최종 방어는 writingCompleteGrantedDayRef(마운트 내 ref,
  리마운트로 초기화됨)가 아니라 위 justCompletedWriting의 클로저 판정
  자체(리마운트 후에도 history[today].spellingCorrect가 이미 GOAL 이상이면
  거짓)와, 그마저 우회되는 경우의 최종 방어인 hasRewardEntry/서버
  reward_ledger UNIQUE다 - 이 체인 전체를 실제로 리마운트해 확인하는
  테스트가 없다.
- 재로그인 시나리오도 없다(로그아웃->재로그인은 3.D 참고, 일반 매커니즘은
  검증됐지만 writing-complete 전용 리마운트 테스트는 아님).

### 3.B 발음(pronunciation) - 더블클릭/onEnd 중복 발화/재렌더/기기 TTS 폴백

- 더블클릭: WordDetail.jsx의 finish()(117-139)와 QuizGame.jsx의
  PronStep(74,109,144-145) 둘 다 settledRef로 recording 결과 처리를
  1회로 보장 - testComponentCallbackDoubleInvoke.mjs 시나리오 3이 "hang
  timer 콜백이 뒤늦게 또 실행돼도 onSuccess/onAttempt 1회만"을 실측
  PASS. 성공 후 버튼도 disabled(WordDetail) 또는 재탭 시 재녹음(QuizGame,
  하지만 pronunciation:${wordId}:${today} 키가 같아 grantReward가
  false 반환 -> 두 번째 별 없음, testRewardFeedbackContracts.mjs 시나리오
  2가 이 반환값 자체를 실측).
- onEnd 다중 발화(PR #33): src/utils/speech.js의 claimTtsCall(205)
  + guard()가 "superseded된 이전 호출의 onEnd는 억제"하는 구조(225,
  310-311,448-449)로 고쳐져 있다 - onSuccess(=markPronunciationOk)는
  TTS onEnd가 아니라 recording 완료(finish/settledRef) 경로에서만
  호출되므로, onEnd 중복 발화 자체가 애초에 onSuccess 중복 호출로
  이어지는 경로가 아니다(발음 프롬프트 재생과 별지급 판정이 분리돼 있음).
- 재렌더: grantReward의 dedupKey(pronunciation:${wordId}:${today})가
  round.starGrantLog(state, 렌더와 무관하게 값 자체로 dedup)를 기준으로
  하므로 재렌더 자체는 무관.
- 저장된 mp3 실패 -> 기기 TTS 폴백: speech.js:249-270의 폴백 체인
  (tryDeviceTts -> tryNetworkTts -> giveUp)은 발음 프롬프트 재생(단어를
  들려주는 단계) 전용이고, 별 지급은 녹음 성공(blob.size>0) 시점에만
  일어난다 - 프롬프트 음원이 어떤 경로로 재생됐는지는 별 지급 여부/횟수에
  전혀 영향을 주지 않는다(코드상 두 관심사가 완전히 분리).
- 결론: 위 네 경로 모두 두 번째 별을 만들 수 없다 - pronunciation
  자체는 안전.
- pronunciation-unidentified(별도 브랜치, NEEDS DECISION):
  wordId == null일 때만 도달(word.dbId가 없는 예외적 데이터 상태 -
  wordLibrary.js:3820의 dbId: cw.id || null 참고, cw.id가 falsy인
  경우). 키가 Date.now()+random이라 매 호출이 항상 새 이벤트로
  간주되고, parseLegacyDedupKey가 이 prefix를 인식하지 않아 서버 원장에도
  안 남는다(0 PD). 정량화: 1스타/호출, 일일 상한 없음(구조적). 다만
  이 브랜치에 도달하려면 애초에 word.dbId가 비어 있어야 하는데, 이는
  wordLibrary.js의 정상 매핑 경로(cw.id)가 항상 채워주는 값이라
  production에서 발생 빈도가 극히 낮다(rewardEngine.js 주석: 실측 0건).
  코드 경로는 열려 있으나 도달 조건 자체가 이례적 데이터 상태라는 점을
  분리해서 봐야 한다 - GAPS P1.

### 3.C 퀴즈/완료 - answeredKeysRef/markQuizSolved/이벤트 3종

- GuidedSession.jsx:216-218의 answeredKeysRef(${phase}:${wordId} 키,
  컴포넌트 내부 Set)가 같은 phase 안에서 같은 단어의 중복
  handleQuizAnswer 호출을 흡수 - 실제 보상 경로(onQuizAnswer ->
  recordQuizAnswer -> markWordCleared)는 정확히 1회만 전달됨을
  testComponentCallbackDoubleInvoke.mjs 섹션 4가 실측 PASS.
- markWordCleared(useStudent.js:1216) 자체도 영구 clearedWords 배열
  기준 멱등 - answeredKeysRef가 리마운트/새 세션으로 초기화돼도 최종
  방어는 이 영구 배열.
- markQuizSolved(1288)는 라운드 카운터 증가만 하고 dedup이 없다 -
  다만 이 카운터가 먹이는 곳은 quiz-complete(day 기간키, 하루 1회 XP)
  뿐이라 카운터 자체의 중복 증가가 별도 보상 파밍으로 이어지지 않는다
  (GOAL 도달 이후 카운터가 계속 올라도 tryFire의 fired Set + 서버
  UNIQUE가 이미 최종 방어).
- word-session-complete(라운드 4/4 판정 중 하나)도 위 3.A와 동일한
  L1/L2.5/L3 서버 방어 체인.
- 더블클릭/뒤로가기-앞으로가기/새로고침/재접속: answeredKeysRef(세션
  내부)+영구 clearedWords/rewardLedger/서버 UNIQUE 3중 방어로
  testComponentCallbackDoubleInvoke/testRewardRetryExactlyOneRow가
  실측 커버.

### 3.D 학생 격리 - studentId 스코핑

- 서버: 모든 reward/xp insert 키가 student_id(UUID, reward_ledger/
  xp_ledger FK)를 포함하고, reward 분기는 추가로 L0 인증
  (verifySessionToken(token, {studentId}), api/grant-xp.js:373-382)이
  "토큰이 주장하는 학생 == 요청의 studentId"를 강제한다 - 세션 토큰은
  App.jsx:1166(로그인)/1172(로그아웃, null로 클리어)에서만 설정되는
  모듈 전역 변수(wordLibrary.js:3270,3276)라, 로그인 전환 시 이전
  학생의 토큰이 새 studentId로 잘못 붙는 경로 자체가 없다.
- 클라이언트: round.starGrantLog/rewardLedger 등 모든 dedup 배열은
  record(studentId 키로 localStorage에 저장, useStudent.js:71-80) 안에
  있으므로 학생별로 완전히 분리된다.
- useRef 초기화 여부: writingCompleteGrantedDayRef/
  dailyCategoryXpFiredRef/handledRoundRef/postedLegacyKeysRef/
  ledgerGrantedKeysRef 전부 useStudent(studentId, ...) 훅 내부의
  useRef(컴포넌트 인스턴스 소유)다. App.jsx:1228,1234의 !student
  분기가 로그아웃 시 AppInner(및 그 안의 useStudent 호출)를 다른
  컴포넌트(StudentSelect)로 완전히 교체하므로 React가 AppInner를
  통째로 언마운트한다 - 재로그인은 새 AppInner 마운트라 이 refs 전부
  기본값으로 재초기화된다. key={studentId} 같은 명시적 장치는 없지만,
  로그아웃이 항상 이 조건 분기를 거치므로("빠른 재로그인"도 로그아웃 ->
  StudentSelect 렌더 -> 재선택 순서를 강제) 순수 prop 변경(리마운트 없이
  studentId만 바뀌는 경로)은 코드에 존재하지 않는다.
- 두 탭(known gap): postRewardEvent/grantReward 등의 in-tick
  최적화 ref(postedLegacyKeysRef 등)는 탭별로 독립이라 서로의 존재를
  모른다 - 다만 최종 dedup은 localStorage(같은 프로필의 모든 탭이 공유,
  paul_easy_progress)에 저장된 starGrantLog/rewardLedger와 서버
  UNIQUE라, 두 탭이 동시에 같은 이벤트를 지급 시도해도 로컬 상태
  덮어쓰기 레이스(storage 이벤트 리스너 없음, 기존에 알려진 GAP)는
  가능해도 "학생 A의 별이 학생 B 계정에 붙는" 격리 붕괴는 발생하지 않는다
  - testFortyFiveStudentIsolation.mjs(543 단언)가 45명/동명이인/재로그인
  stale 값 0건을 실측.
- stale local state: record는 studentId 키로 완전히 분리된
  localStorage 슬롯이라, 같은 브라우저에서 여러 학생이 로그인해도 서로의
  레코드를 절대 덮어쓰지 않는다(45명 fixture 테스트가 반/교재/유닛/단어/
  진도 전부 교차 오염 0건으로 실측).

### 3.E 원장/UI 일관성 - 5개 숫자의 관계

| 값 | 소스 | 포함 범위 |
|---|---|---|
| UI totalStars(대시보드 표시) | 클라이언트 record.totalStars(단일 지급 경로 grantReward가 유일하게 증감) | 가장 넓음 - 15종 별 이벤트 전부(레거시 6종 포함) + pronunciation-unidentified(서버 미기록분)까지 포함 |
| reward_totals.earned_stars(서버 뷰, reward_ledger 합) | 서버 reward_ledger 전체 합(supabase_v3_36) | 서버가 실제로 수신/insert에 성공한 이벤트만 - 12개 화이트리스트 reward_type(원 V1 6종 + 흡수된 레거시 6종) 한정, pronunciation-unidentified는 제외 |
| student_progress.total_stars | 클라이언트 totalStars를 그대로 fire-and-forget 업로드(wordLibrary.js:3163-3179) | UI totalStars와 논리적으로 동일해야 함(동기화 지연/실패 시 일시적으로만 다를 수 있음, 재시도 없음) |
| XP(xp_ledger 합) | 서버 xp_ledger(5개 status:'active' 이벤트: word-view/listening/quiz/writing-complete, daily-mission-complete) | 별과 완전히 별개 화폐/이벤트 집합 - 별 총합과 비교 자체가 무의미(다른 단위) |
| PD(dollar_ledger/dollar_balances) | reward_ledger insert 시 fn_reward_ledger_to_dollars 트리거가 12개 reward_type 전부 1:1(dollars_per_star=1, supabase_v3_49) 변환 | reward_totals.earned_stars와 항상 같아야 함(트리거가 매 insert마다 동기 실행, 실패해도 별 지급은 막지 않지만 그러면 PD만 어긋남 - exception when others로 조용히 무시, supabase_v3_49_paul_dollar.sql:226-230) |

정확히 같아야 하는 것: reward_totals.earned_stars == dollar_balances.earned
(같은 insert 트랜잭션의 AFTER 트리거이므로, 트리거 자체가 실패하지 않는 한
1:1). 다를 수 있고(정상): UI totalStars >= reward_totals.earned_stars
(차액 = pronunciation-unidentified로 지급된 몫 + 레거시 컷오버 이전
legacy-baseline 기간 동안 서버 흡수 없이 쌓인 몫 + 재시도 큐가 8회
시도 후 포기한 몫, 이론상 0에 가깝지만 구조적으로 0을 보장하지 않음).
동기화 지연으로 일시적으로 다를 수 있음: student_progress.total_stars
vs UI totalStars(디바운스 업로드, postXpEvent처럼 재시도 없음).
XP는 다른 두 값과 비교 대상이 아니다(별개 화폐).

## 4. 회귀 스위트 실행 결과 (직접 재실행, 이번 세션)

| 스위트 | 결과 | 비고 |
|---|---|---|
| testRewardFeedbackContracts.mjs | PASS 10/10 | 토스트 중복(시나리오1)/별 과장 표시(시나리오2,3) 무회귀 |
| testWritingCompleteRealReactTiming.mjs | PASS 8/8 | 4->5 단독+interleave 실측(REAL React) - 5->6/6->7/새로고침/재로그인은 미검증(3.A GAP) |
| testComponentCallbackDoubleInvoke.mjs | PASS 21/21 | WordDetail QuizStep/SpellingQuestion/SpeechBtn(settledRef)/GuidedSession 4개 컴포넌트, StrictMode 이중 effect 포함 |
| testRewardRetryExactlyOneRow.mjs | PASS 18/18 | 네트워크 순단/HTTP 500 후 재시도 큐 flush -> 서버 원장 정확히 1행, replay도 1행 유지 |
| testRewardDayBoundaryDeviceClock.mjs | PASS 49/49 | reward 날짜토큰(형식만) vs XP 기간키(+-2일 허용폭) 계약, KST 자정 경계, L3 상한 창이 서버 Date.now() 기준임을 정적 확인 |
| testRewardServerHardening.mjs(extra) | PASS 52/52 | L0 인증, L1 학생 실재, L2 exam 실재, L3 상한, 기존 방어 무회귀, 상한 화이트리스트 완전성 |
| testRewardStress45.mjs | PASS 26/26 | 12타입x9시나리오x동시성(더블클릭/새로고침/재시도/동시요청/자정경계/재로그인) - 전부 duplicates=0, mismatches=0. 정보성 재확인: L3 TOCTOU(서로 다른 sourceId가 count=cap-1에서 동시 도착 시 cap 초과 가능, 실측 44건 초과) - 기존에 알려진 GAP, 이번 실행도 동일 결론 재확인(설계상 "지금 이렇다"를 고정하는 단언이지 바람직함을 뜻하지 않음) |
| testFortyFiveStudentIsolation.mjs | PASS 543/543 | 45명/동명이인/재로그인 stale 0/localStorage 키가 UUID 전용임을 정적 확인 |
| testSpeakingPathNoPermanentDisable.mjs | PASS 90/90 | SpeechBtn/PronounceStep/PronStep 12개 시나리오 - 언마운트/로그아웃/연타 후에도 영구 고착 없음 |

총계: 9개 스위트, 개별 단언 합계 10+8+21+18+49+52+26+543+90 = 817개 실행,
전부 PASS, 실패 0.

## 5. GAPS (수정 없음 - 제안 테스트만)

| 우선순위 | 항목 | 근거 | 제안 테스트(한 줄) |
|---|---|---|---|
| P1 | writing-complete가 5->6/6->7(임계값 통과 후 반복 정답)에서 실제로 0건 지급인지, 그리고 새로고침(리마운트) 후 같은 날 재제출해도 0건인지 어서션이 없음 | testWritingCompleteRealReactTiming.mjs 전문 확인 - 시나리오 1/2/3 모두 4->5(최초 도달)만 다룸, justCompletedWriting의 "이미 넘은 뒤" 분기/리마운트 분기 미검증 | mountFresh 후 6~7번째 정답까지 같은 act() 안/별도 act()로 계속 제출해 writing-complete 행 수가 여전히 1인지, 그 뒤 mountSeeded로 history[today].spellingCorrect >= GOAL을 시딩한 새 인스턴스에서 8번째 정답을 제출해도 여전히 1인지 단언 추가 |
| P1 | pronunciation-unidentified 브랜치가 idempotency 없이 무제한 반복 지급 가능(1스타/호출, 상한 없음, 서버 흡수 대상 아님) - 기존에 이미 알려진 NEEDS DECISION이나 이번 감사로 재확인 | useStudent.js:1319-1320, rewardEngine.js:474-478(parseLegacyDedupKey가 이 prefix를 의도적으로 null 처리) | word.dbId가 비어있는(=wordId==null) 합성 시나리오로 markPronunciationOk(null)을 N회 연속 호출해 totalStars가 N만큼 무제한 증가함을 실측 고정(현재 동작을 "발견"으로 문서화하는 회귀 스위트, 수정은 별도 결정) |
| P2 | L3 일일 상한 TOCTOU - 서로 다른 sourceId(같은 student+type)가 count == cap-1 부근에서 동시 도착하면 상한을 초과할 수 있음(testRewardStress45.mjs 정보성 프로브가 45건 동시 요청으로 44건 초과 실측) | testRewardStress45.mjs 출력 "L3 일일 상한 TOCTOU" 섹션, testRewardCapRace.mjs(별도 파일)와 동일 결론 | (기존 GAP 재확인, 신규 테스트 불필요 - 수정 시 DB 레벨 (student_id, reward_type, day) unique/카운터 가드 도입 후 testRewardStress45.mjs의 해당 단언이 뒤집히는지로 검증) |
| P3 | postXpEvent(XP 4종+writing-complete XP 부분)는 재시도 큐가 없는 단발 fire-and-forget - 네트워크 순단 시 그 이벤트의 XP(2~10점)가 영구 유실(별/PD와 달리 재시도 매커니즘 비대칭) | wordLibrary.js:3288-3299 (postXpEvent 정의, catch에서 조용히 삼킴, 큐 없음) vs postRewardEvent(3503~, 재시도 큐 있음)의 코드 대조 | 네트워크 순단 mock 후 xp_ledger insert가 실제로 0행인 채 영구 종료되는지(재시도 큐 부재 확인), 재접속해도 같은 이벤트가 재전송되지 않음을 실측하는 스위트 |
| P3 | 두 탭 동시 사용 시 postedLegacyKeysRef/ledgerGrantedKeysRef(in-tick 최적화) 및 로컬 record(localStorage) 갱신에 storage 이벤트 리스너가 없어 마지막에 쓴 탭이 다른 탭의 진행도를 덮어쓸 수 있음(기존에 이미 알려진 GAP, 학생 격리 붕괴는 아님 - 3.D 참고) | wordLibrary.js:3426-3437 헤더 주석이 이미 이 gap을 명시적으로 문서화(cross-tab reward-post hold는 있지만 progress record 자체의 storage 리스너는 없음) | 두 개의 useStudent 인스턴스(같은 studentId, 다른 "탭" 시뮬레이션 - 별도 localStorage 스냅샷)를 동시에 조작해 마지막 쓰기가 이전 탭의 starGrantLog 항목을 사라지게 하는지 실측(현재 동작 고정, 수정은 별도 결정) |
