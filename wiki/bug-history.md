# wiki/bug-history.md — 버그 이력

_`handoff.md`에 실제로 기록되고 실제 커밋 해시로 검증 가능한 주요
프로덕션 버그만 표로 정리. 추측/미확인 항목 없음 — 각 행의 커밋은
`git log`로 직접 대조 가능합니다._

| 증상 | 원인 | 커밋 | 날짜 |
|---|---|---|---|
| 학생이 로그인해도 자꾸 "첫 유닛"으로 되돌아감(unit_name 폴백 버그) | `students.unit_name`(문자열)이 유일한 유닛 저장소 — `getClassWords()`의 `units.find(u => u.name === unitName) \|\| units[0]` 폴백이 표기 차이("Unit 1" vs "Unit8")·유닛 삭제 시 조용히 첫 유닛으로 떨어짐 | `98da563`~`7c99924`(v2.1, `current_unit_id` FK 도입으로 수정) | 2026-07-17 밤 |
| PIN 초기화/재설정 후 재로그인 직후 즉시 크래시(`TypeError: Cannot read properties of undefined (reading 'forEach')`) | `src/App.jsx:154`의 `spellingWrongToday.forEach(...)` — 2026-07-07에 추가된 필드가 그 이전 스키마의 클라우드 백업 blob/이름→id 마이그레이션 레코드에는 없어 undefined. 크래시가 재동기화까지 막아 매번 재현되는 악순환 | `bc49775`, `6b5e0f9`(`normalizeRecord()` 단일 정규화 함수 도입) | 2026-07-17 |
| PIN 만들기 탭에서 학생을 빠르게 바꾸면 이전 선택의 PIN 상태가 덮어씀(stale 응답 레이스) | fetch→setState 경로에서 먼저 보낸(느린) 요청 응답이 나중 선택을 덮어씀 — 이후 유사 패턴 4곳(`EntranceTestAdmin` loadStatus 등)까지 전수 점검해 가드 추가 | `6dd6c7a`(발견 수정), `529ff9e`(4곳 전수 가드) | 2026-07-16 저녁 |
| 퀴즈 두 번째 문제부터 이전 문제의 선택 상태가 그대로 남아있음 | 퀴즈 스텝 컴포넌트가 단어가 바뀌어도 리마운트되지 않아 내부 state가 잔존 | `6fe21b1`(`word.id`를 key로 사용해 단어별 완전 remount) | (git log 순서상 v2.2 직후) |
| 다중 탭/중복 업로드 시 클라우드 진행도가 오래된 값으로 덮어써짐 | 디바운스 동기화가 짧은 간격으로 겹쳐 실행될 때, 먼저 시작한(오래된) 호출의 네트워크 응답이 늦게 도착하면 최신 업로드를 덮어쓸 수 있는 레이스(Critical, 2026-07-18 다중 탭 회귀 테스트 신규 작성 중 발견) | `69564d2`(`syncGenRef` 세대 카운터 도입 — "내가 여전히 최신 세대인지" 확인 후에만 업로드) | 2026-07-18 |
| 단어만 보고 카테고리를 하나도 못 채운 날, 학습 캘린더에 그 날짜 기록이 아예 안 생김 | `history[오늘]` 엔트리가 카테고리(단어/예문/퀴즈/발음) 하나를 완전히 채워야만 생성되던 게 원인 | `f29f53e`(`markWordViewed`가 단어를 처음 여는 시점에 바로 오늘 기록 생성하도록 수정) | 2026-07-10 |

## 참고: 이 표에 없는 알려진 갭(버그 아님, 미해결 기록)

아래는 "발생한 버그"가 아니라 감사에서 발견되고 아직 수정하지 않은
설계 갭입니다 — 버그 이력과 구분해 [`wiki/security-notes.md`](./security-notes.md)와
`PROJECT_BOARD.md`에 별도로 관리됩니다: 입실시험 결과 서버 재검증 없음
(Medium, P1), 다중 탭 로컬스토리지 last-writer-wins 잔여 유실 창
(Medium, P2), 핵심 4테이블 DDL 저장소 미백필(Medium, P1).

## 관련 파일

`C:\voca\handoff.md`(각 커밋의 원본 세션 기록), `git log --oneline`으로
커밋 해시 직접 대조 가능
