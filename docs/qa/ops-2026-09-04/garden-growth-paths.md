# 정원 성장 경로 분류 (Track H, origin/main 2c52a78, READ-ONLY 코드 추적)
정원 포인트 = |cleared ∪ completedWords ∪ clearedWords| (attachmentCore.js:122-157). 2점/칸, 16칸, 128점 만개, 일일 하드캡 없음(worldProgress.js:87-88; testGardenGrowthFlow:376, testGardenGrowthSources:192, testPaulTownProgression:162/171 일치).

| 경로 | 훅 | 정원 기록 | 분류 | 근거 |
|---|---|---|---|---|
| 퀴즈 정답(WordDetail/GuidedSession 재시도/QuizGame) | recordQuizAnswer→markWordCleared | 예 | COUNTS | useStudent.js:1566-1579 |
| 철자 정답(SpellingQuestion) | recordSpellingAnswer→markWordCleared | 예(PR #12) | COUNTS | useStudent.js:1629-1639 |
| 가이드 코스 완료 | markWordCompleted | 예 | COUNTS | GuidedSession.jsx:399 |
| 레벨업 미션 3연속 | answerMission→cleared | 예 | COUNTS | useStudent.js:1172-1199 |
| 단어 열람 / 예문 듣기 / 발음 성공 | markWordViewed/markExampleHeard/markPronunciationOk | 아니오 | INTENTIONALLY_DOES_NOT_COUNT | attachmentCore 소스 3종 열거 주석 |
| 일일 미션 4/4 완료 이벤트 | grantReward 등 | 아니오(정답들의 부산물로만) | INTENTIONALLY_DOES_NOT_COUNT | useStudent.js:1371-1467 |
| 쓰기 코치(플래그 OFF) / known-unknown 표시 / 스티커·티켓 | — | 아니오 | INTENTIONALLY_DOES_NOT_COUNT | wordStatus는 정원 미참조 |
| 복습 큐 해소(SpellingReview) | clearSpellingReviewWord | 아니오 | UNDECIDED_PRODUCT_POLICY | SpellingReview.jsx:19 별/XP 제외만 언급, 정원 언급 없음 |
| 입실시험 문항 정답 | 없음(시험 완료만 recordExamCompleted) | 아니오 | UNDECIDED_PRODUCT_POLICY | EntranceTest.jsx:307-309 |
| 미니게임 정답(Balloon/Fishing/Pizza/Train) | onGrantReward만 | 아니오 | UNDECIDED_PRODUCT_POLICY | MatchGameShell.jsx:119, REWARD_ECONOMY_V1 정원 언급 없음 |
BUG 0. UNDECIDED 3건은 운영자 제품 결정 필요(임의 변경 없음).
