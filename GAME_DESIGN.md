# GAME_DESIGN.md — Paul Easy Voca 게임화 아키텍처 설계 (v0, 미구현)

_작성: 2026-07-18. **이 문서는 순수 설계 문서입니다 — 이 세션에서 `src/`,
`api/`, `*.sql`, `package.json` 등 프로덕션 코드/스키마는 단 한 줄도
바뀌지 않았습니다** (`git diff --stat` 결과는 이 문서와
`PROJECT_BOARD.md`뿐임을 커밋에서 확인 가능). 여기 적힌 컬럼명/함수명/
테이블명은 전부 **제안**이며, 실제 구현 시 `CLAUDE.md` 18개 규칙(특히
규칙 5·8·9·10·12)을 그대로 따라야 합니다._

_전제 조사: `ARCHITECTURE.md`/`DATABASE.md`/`ROADMAP.md`/`handoff.md`/
`wiki/*`(특히 `wiki/security-notes.md`, `wiki/api-costs.md`) +
`src/hooks/useStudent.js`, `src/components/AdminScreen.jsx`,
`src/components/ParentScreen.jsx`, `src/utils/weeklyReport.js`,
`src/utils/entranceTest*.js`, `src/data/stickers.js`,
`src/config/features.js`를 전부 읽고 확인한 사실 위에서만 설계했습니다.
추측·발명한 기존 시스템은 없습니다._

## 왜 이 문서가 필요한가

운영자가 "Word King"을 포함한 게임화 기능을 언급했으나, `ARCHITECTURE.md`
"Word King 관련 확인 결과" 섹션이 이미 확정한 대로 **이 이름의 기능은
코드/스키마/과거 계획 문서 어디에도 존재한 적이 없습니다** — 미구현이
아니라 최초 설계 자체가 없었습니다. 이 문서가 Word King의 **최초 설계
기록**입니다. 그 옆에서 이미 실사용 중인 별/스티커/스트릭/뱃지/입실시험
VIP 시스템과 어떻게 연결되는지를 명시하지 않으면 중복 시스템(운영자가
경계한 CLAUDE.md 규칙 3의 정신)이 생기므로, 14개 섹션 전부 기존 코드의
실제 필드/함수/테이블을 인용하며 "재사용 vs 신규"를 판단합니다.

## 기존 시스템 요약 (설계의 출발점)

- **별(Stars) = XP**: `useStudent.js`의 `addStars()`가 퀴즈 정답/발음
  성공/레벨업 미션 클리어(+3)/미션 완료 보너스(`MISSION_BONUS_STARS=10`)/
  중복 스티커 환전(`DUPLICATE_BONUS_STARS=20`)/쓰기시험 콤보 보너스
  (`SPELLING_COMBO_BONUS={3:1,5:2,10:3}`, 이미 "P3 게임화" 주석이 붙은
  기존 코드)를 전부 하나의 카운터로 합칩니다. **중요한 기존 사실**:
  `student_progress.total_xp` 컬럼이 **이미 존재**하고
  (`supabase_v1_4_full_progress_backup.sql`), `wordLibrary.js:716`에서
  `progressRow.total_xp = totalStars`로 **정확히 별 총합의 사본**으로만
  쓰이고 있습니다(SQL 컬럼 주석: `'누적 별(XP)'`). 즉 이 저장소는 이미
  "별 = XP"라고 이름 붙여둔 상태입니다 — 아래 [XP 시스템](#sec-2)에서 이
  전제를 그대로 계승합니다.
- **별은 한 번도 소비된 적이 없습니다**(`totalStars`를 감소시키는 코드
  경로가 저장소 전체에 없음, grep 확인) — 순수 누적/뱃지 게이트 값입니다.
- **뱃지 2종**: `STAR_BADGES`(100/300/500/1000 별 달성 시 고정 스티커 1회
  지급) + `STREAK_MILESTONES`([3,7,14,30]일 연속 4/4 완료 시 legendary
  스티커 1회 지급) — 둘 다 "한 번 넘으면 영원히 기록"(`starBadgeThreshold`/
  `milestoneStreak`가 최고값만 저장) 패턴입니다.
- **스티커 가챠**: `data/stickers.js`의 `getRandomSticker()`가
  common 55% / rare 28% / epic 12% / legendary 5% 확률로 뽑고, 오늘의
  미션 4/4(`categoriesCompleted>=4`) 완료 시마다 발동(하루 여러 번 가능).
- **오늘의 미션 4개**: `dailyProgress`/`categoriesCompleted`(단어보기/
  예문듣기/퀴즈/발음, 0~4) — 이 값이 **스트릭 계산의 유일한 입력**
  (`calcStreak`)이자 가챠 트리거입니다. 학습 흐름의 핵심 인프라입니다.
- **입실시험 VIP/랭킹(v1.8)**: 교사가 시작한 하루짜리 반별 시험
  (`entrance_tests`/`entrance_test_results`)에서 그날의 반별 1등을
  "오늘의 VIP"로, 전원 순위를 실시간(5초 폴링) 계산 — **날짜가 바뀌면
  자동 리셋**되는 일회성 경쟁입니다. **알려진 보안 갭**: 클라이언트가
  계산한 점수를 서버 재검증 없이 그대로 저장(`wiki/security-notes.md`
  P1, `PROJECT_BOARD.md` NEXT 카드) — [Anti-cheat](#sec-11)에서 이 갭을
  그대로 인용합니다.
- **`classes` 테이블의 반별 on/off 관례**: `spelling_test_enabled`/
  `spelling_hint_enabled`/`wrong_answer_repeat_count`/
  `spelling_direction`(기본값 false/opt-in) + `AdminScreen.jsx`의
  `SpellingSettingsPanel` — [Teacher Controls](#sec-13)가 그대로
  재사용을 제안하는 실제 관례입니다.
- **`config/features.js`의 `ranking`/`pointSystem`/`leaderboard`/
  `rewardSystem` 플래그는 죽은 코드입니다** — 이 플래그를 읽는
  `useFeatureAccess.js`가 `src/` 전체에서 **어디서도 import되지 않음**을
  grep으로 확인했습니다(`ARCHITECTURE.md` 2번 섹션의 "2024-01-01 확장
  설계의 일부만 실제로 살아있음" 각주와 일치). 이름만 게임화와 겹치는
  2024년 스캐폴딩이며, [Teacher Controls](#sec-13)에서 왜 이걸 재사용하지
  않는지 명시합니다.
- **`mergeProgressRecords()`(v2.2, `useStudent.js:352`)의 핵심 제약**:
  필드별 병합이 전부 `maxNum()`(단조증가 가정) 또는 id 기준 합집합입니다
  — **감소하는 값을 하나라도 넣으면 다중 기기 병합이 옛 값을
  부활시킵니다.** [티켓 경제](#sec-4)를 설계할 때 이 제약이 가장 큰
  기술적 결정 포인트였습니다.

---

<a id="sec-1"></a>
## 1. Player Progression

**결정: 별도 "레벨 원장"을 새로 만들지 않고, 기존 총 별(=`total_xp`)의
읽기 전용 파생값으로 레벨을 계산합니다.** 즉 Player Progression은 새
저장 필드가 아니라 **공식**입니다.

```
level = 기존 STAR_BADGES 곡선을 확장한 XP 임계값 테이블에서
        totalStars가 도달한 가장 높은 단계
```

- 레벨 임계값은 [XP 시스템](#sec-2)에서 정의하는 XP 곡선을 그대로
  씁니다 — 별과 레벨이 서로 다른 두 개의 "성장 축"이 아니라 **하나의
  숫자(별)를 두 가지 방식으로 보여주는 것**(뱃지 임계값 vs 레벨
  임계값)입니다. 이렇게 하면 "별을 모았는데 레벨은 안 오른다"는 학생
  혼란이 구조적으로 불가능합니다.
- 기존 `STAR_BADGES`(100/300/500/1000)는 그대로 유지 — 레벨과 뱃지는
  같은 원천(별)에서 나오는 서로 다른 두 표현이므로 상호 대체가 아니라
  **병존**합니다(뱃지=고정 스티커 소장품, 레벨=진행률 숫자).
- 기존 스트릭(`STREAK_MILESTONES`)은 레벨과 **독립적인 축으로 유지**
  — 스트릭은 "꾸준함"을, 레벨은 "누적량"을 측정하며 이미 코드에서도
  서로 다른 카운터(`milestoneStreak` vs `starBadgeThreshold`)로 분리돼
  있습니다. 합치면 오히려 "하루 몰아서 하면 꾸준함도 채워지는" 잘못된
  유인이 생깁니다.
- 레벨의 용도(다른 섹션이 이 값을 입력으로 씀): [Hat Evolution](#sec-3)
  승급 조건, [Ticket Economy](#sec-4)의 주간 기본 지급량 등급,
  [Teacher Controls](#sec-13) 반별 진행 현황 뷰, [Parent
  Motivation](#sec-14) 리포트 문구.

<a id="sec-2"></a>
## 2. XP System

**결정: 새 XP 소스를 만들지 않습니다. 이미 `addStars()`를 거치는 모든
행동이 곧 XP 소스입니다.** 현재 `addStars()` 호출 지점(코드 확인 완료):
퀴즈 정답, 발음 연습 성공, 레벨업 보스미션 클리어(+3), 오늘의 미션 4/4
완료 보너스(+10), 중복 스티커 환전(+20), 쓰기시험 콤보(1~3, 콤보 끊기면
리셋). 이 전부가 XP이고, `total_xp` 컬럼이 이미 이 값을 그대로
미러링합니다(위 "기존 시스템 요약" 참고).

**인플레이션 방지 원칙**:
1. **게임화 레이어가 별도의 새 XP 발생원을 만들지 않는다.** [Hat
   Evolution](#sec-3)/[Word King](#sec-5)/[House](#sec-6)/[Weekly
   Events](#sec-8) 전부 기존 XP(별)를 **입력으로 읽기만** 하고, 별을
   추가로 찍어내는 새 트리거를 만들지 않습니다 — 새 보상이 필요하면
   [티켓 경제](#sec-4)(완전히 별개 통화)로 지급합니다. 같은 행동에
   별+티켓을 동시에 왕창 주면 두 통화가 동시에 인플레될 위험이 커지므로,
   섹션 4/7에서 "어떤 행동이 티켓을 주는가"를 별과 최대한 겹치지 않게
   의도적으로 좁혀 정의합니다.
2. **입실시험(Entrance Test)은 현재 XP를 전혀 주지 않습니다**
   (`entranceTestApi.js`에 `addStars` 호출 없음, 코드 확인 완료). [Word
   King](#sec-5)이 입실시험 점수를 입력으로 쓰려면 [Anti-cheat](#sec-11)의
   서버 재검증이 먼저 있어야 하므로, "입실시험 결과가 XP에 반영되는 것"은
   이번 설계에서 **의도적으로 제외**합니다(악용 유인만 커짐).
3. 기존 학습 이벤트(오늘의 미션 4/4, 하루 여러 번 반복 가능)가 이미 사실상
   무제한 반복 가능한 구조이므로, 게임화가 이 위에 곱연산 배수를 얹지
   않습니다(예: "레벨이 높을수록 별 2배" 같은 기능은 설계하지 않음 —
   레벨이 오를수록 오히려 파밍 유인이 커지는 역설을 피함).

<a id="sec-3"></a>
## 3. Hat Evolution

승급 규칙만 정의합니다(외형은 UI 영역 — 최근 세션이 이미 폴 선생님
마스코트 이미지 21종을 정리해둔 것이 있어 향후 모자 오버레이 아트
작업의 밑바탕은 있지만, 실제 스프라이트 제작은 프론트엔드 구현 세션의
몫입니다).

- **입력**: [섹션 1](#sec-1)의 레벨 하나만 봅니다(다른 축 혼합 없음 —
  단순한 조건일수록 학생이 "왜 안 올랐지"를 이해하기 쉬움).
- **승급 표(예시, 실제 임계값은 XP 곡선 확정 후 백엔드에서 튜닝)**:
  Lv.1 새싹모자 → Lv.5 비니 → Lv.10 탐험모자 → Lv.20 마법모자 →
  Lv.30**이면서 동시에** 기존 `STAR_BADGES` 최상위(1000별 뱃지)를 이미
  받은 상태 → 왕관모자. 마지막 단계만 레벨 조건에 기존 뱃지 조건을
  덧붙여, **완전히 새 시스템이 아니라 기존 뱃지 시스템 위에 얹힌
  최종보상**임을 명시적으로 만듭니다.
- **저장 위치 판단(저장소 관례 적용)**: `student_progress` 테이블은
  이미 `enable row level security` + `"allow anon all"`
  (`using(true) with check(true)`) 정책이라(`DATABASE.md` "RLS/컬럼권한
  현황"), 여기 새 컬럼을 추가할 때 `students` 테이블처럼 별도 컬럼
  GRANT가 필요 없습니다(CLAUDE.md 규칙 10은 `students` 전용 함정입니다
  — 혼동 방지 차 명시). 제안: `student_progress.hat_stage`(smallint,
  default 0) 신규 컬럼 — 교사/학부모 화면이 SQL로 직접 목록 조회할
  일이 있는 값이라(예: "우리반 모자 단계 분포") `total_xp`/
  `streak_count`와 같은 "빠른 조회용 사본" 패턴을 따릅니다. 진짜
  소유 값은 `progress_data.hatStage`(useStudent.js record)에 두고,
  이 컬럼은 사본입니다. **hatStage는 레벨의 100% 파생값이라 별도 병합
  정책이 필요 없습니다** — 병합 시 그냥 `maxNum`(기존 관례 그대로
  재사용 가능, 단조증가).
- SQL 미실행 상태에서도 앱이 깨지지 않아야 한다(CLAUDE.md 규칙 9) —
  컬럼 부재 시 `hatStage=0`(기본 모자, 지금과 동일한 화면) 폴백.

<a id="sec-3-impl"></a>
### 3.x 구현 갱신(2026-07-19, Engineering Head — "Paul Rank System 기반" 세션)

_이 항목은 append입니다 — 위 1~3번 섹션 원문은 전혀 수정하지 않았습니다.
운영자가 이번 세션에서 위 설계안(총 별=`total_xp` 그대로 재사용) 대비
**명시적으로 다른 지시**("별을 조용히 XP로 변환하지 말라")를 내려, 실제
구현은 아래처럼 위 설계 초안과 다른 방향으로 진행됐습니다 — 이 문서는
설계 "역사"를 보존하기 위해 원문을 그대로 두고, 실제로 무엇이 왜 다르게
구현됐는지만 덧붙입니다._

- **기반(계산 로직 + 설정 아키텍처) 구현 완료.** 실제 게임/Word King/
  House/티켓/미니게임/시각·애니메이션은 여전히 미구현 — 이 섹션들
  (§4~11)은 여전히 "⚠️ DESIGN DIRECTION"입니다(아래 표 참고).
- **원문과 달라진 핵심 판단**: §1~2 원문은 "새 XP 소스를 만들지 않고
  `total_xp`(=`totalStars` 사본)를 그대로 재사용"을 전제했지만, 운영자의
  이번 지시가 이 전제를 정정했습니다 — XP는 `totalStars`의 산술 파생값이
  아니라, **`addStars()` 호출 4곳(레벨업 미션 클리어/오늘의 미션 4/4
  보너스/중복 스티커 환전/쓰기시험 콤보)을 트리거로 재사용하되, 완전히
  독립된 감사 가능한 원장(`xp_ledger`)에 별도로 누적**됩니다. "같은 학습
  신호를 재사용하되 별 총합에서 산수로 뽑아내지 않는다"는 원칙 — 판단
  근거 전문은 `src/utils/paulRankShared.js` 헤더 주석과
  `wiki/decisions.md` 항목 9 참고.
- **실제 구현 파일**: `src/utils/paulRankShared.js`(RANKS/HAT_STAGES/
  EXPERIENCE_UNLOCKS/XP_EVENT_TABLE 설정 + `computeRankState()` 등 순수
  함수, 브라우저·서버 공유), `api/grant-xp.js`(유일한 쓰기 경로,
  service_role, 클라이언트 amount 불신), `supabase_v2_3_paul_rank.sql`
  (`xp_ledger` + `xp_totals` 뷰), `src/hooks/usePaulRank.js`(조회 훅),
  `src/hooks/useStudent.js`(addStars 4곳에 XP 이벤트 트리거 병행),
  `src/components/Dashboard.jsx`/`AdminScreen.jsx`(텍스트 전용 최소 표시).
- **§3 Hat Evolution 원문과의 차이**: 원문은 `student_progress.hat_stage`
  컬럼(레벨의 파생값, `maxNum` 병합)을 제안했지만, 실제 구현은 저장
  컬럼을 두지 않고 **매 조회 시 `computeRankState(xp)`로 다시 계산**합니다
  (`xp_totals` 뷰도 저장이 아니라 파생 집계) — "저장된 중복값보다
  파생값을 우선한다"는 이번 지시가 원문의 "사본 컬럼" 전략보다 우선
  적용된 결과입니다.
- **여전히 미구현(⚠️ DESIGN DIRECTION 유지)**: 모자 시각/애니메이션,
  Ticket Economy(§4), Word King(§5), House(§6), Daily Missions 확장(§7의
  "추가 선택 목표" 부분 — 4/4 후킹 자체도 없음, 순수 XP 지급만 추가됨),
  Weekly Events(§8), Seasonal(§9), Rewards 상점(§10), Word King
  Anti-cheat(§11), 경험 언락(§Hat 관련)이 실제로 무언가를 잠그거나 여는
  동작 — 전부 설정 스키마만 존재(`EXPERIENCE_UNLOCKS`, 전부
  `status:'planned'`, 아무 코드도 아직 읽지 않음).

<a id="sec-4"></a>
## 4. Ticket Economy

**가장 중요한 아키텍처 판단이 여기 있습니다.** 별(XP)은 위에서 확인한
대로 "한 번도 소비된 적 없는 단조증가 값"입니다. 티켓은 정의상
**소비되는(감소하는) 값**이므로, 기존 `mergeProgressRecords()`의
`maxNum()`(단조증가 가정) 병합 정책을 그대로 쓰면 한 기기에서 티켓을
쓰고 다른 기기의 옛 스냅샷과 병합될 때 **쓴 티켓이 부활**하는 실제
버그가 생깁니다(v2.2가 정확히 이런 부류의 유실/부활 버그를 잡으려고
만들어진 병합 정책이므로, 여기서 새로 그 버그를 만들면 안 됨).

- **결정**: 티켓 잔액을 원시 숫자로 저장하지 않고, `diaryPlacements`+
  `diaryRemovedIds`(삭제 tombstone) 조합과 똑같은 **append-only
  이벤트 로그 + id 기준 합집합** 패턴을 재사용합니다.
  `progress_data.ticketLedger: [{ id, delta, reason, at }]` — 잔액은
  저장하지 않고 **읽을 때 `sum(delta)`로 계산**합니다. 두 기기가 서로
  다른 항목을 추가해도 합집합(id 기준, 이미 diaryPlacements가 쓰는
  패턴)이라 유실도 부활도 없습니다. 이는 새 병합 특수 케이스를 만드는
  대신 기존에 검증된 패턴을 재사용하는 선택입니다(CLAUDE.md 규칙 3
  정신 — 이미 있는 해법을 재발명하지 않음).
- **소스(무엇이 티켓을 주는가)** — [XP 시스템](#sec-2)의 원칙대로 별과
  최대한 겹치지 않는, **빈도가 낮고 파밍하기 어려운** 행동에만 배정:
  - [Daily Missions](#sec-7) 4/4 완료 1회당 티켓 1개(기존 가챠 트리거에
    얹는 후킹, 새 트래킹 없음).
  - [Weekly Events](#sec-8) 완료 보너스.
  - [Word King](#sec-5)/[House](#sec-6) 참여·기여 보상(전부 서버 재검증
    이후에만 지급 — [Anti-cheat](#sec-11) 참고).
- **싱크(무엇을 소비하는가)** — [Rewards](#sec-10)의 티켓 상점만.
  **싱크 없는 통화를 먼저 배포하지 않습니다**(운영자 지시 "인플레이션/
  디플레이션 균형" 요구 그대로) — [구현 순서](#sec-15)에서 소스와 싱크를
  같은 배포 라운드에 묶습니다.

<a id="sec-5"></a>
## 5. Word King

**이 섹션이 이 기능의 최초 설계 기록입니다** — 재확인 결과 코드/스키마/
과거 계획 문서 어디에도 존재한 적 없음(`ARCHITECTURE.md`).

- **기존 VIP와의 명확한 구분(중복 시스템 방지)**:

  | | 입실시험 VIP(기존, v1.8) | Word King(신규) |
  |---|---|---|
  | 주기 | 하루(자정 리셋) | 주간(또는 시즌, [섹션9](#sec-9) 참고) |
  | 입력 | 그날 시험 1회 점수만 | 여러 소스 합성 점수(아래) |
  | 계산 위치 | 클라이언트(5초 폴링, 서버 재검증 없음) | **서버(cron/API)만** |
  | 저장 | `entrance_test_results`(원시 응시 기록) | 신규 `word_king_history`(계산된 스냅샷) |
  | 위협모델 | 이미 알려진 P1 갭([섹션11](#sec-11)) | 그 갭 위에 보상을 더 얹지 않도록 신규 설계부터 서버 검증 전제 |

  즉 Word King은 VIP의 재포장이 아니라, VIP가 안고 있는 "클라이언트
  점수를 그대로 믿는다"는 구조적 문제를 **반복하지 않는** 상위
  경쟁입니다.
- **점수 산정(제안, 전부 서버 재계산 가능한 값만 사용)**: 순수 별 총합은
  **의도적으로 배제**합니다 — 별은 "누가 오래 반복했는지"만 반영해
  실력과 무관하게 그라인딩한 학생이 왕이 되는 왜곡이 생깁니다. 대신:
  ① 입실시험 정확도(재채점 후, [섹션11](#sec-11) 선행 필요) ② 쓰기시험
  첫시도 정답률(`spellingCorrect/spellingTotal`, 이미
  `student_daily_progress`에 기록됨) ③ `word_status='mastered'` 개수
  (이미 `word_status` 테이블에 있음) — 가중합. 단, ②③도 현재
  `student_daily_progress`/`word_status`가 RLS `"allow anon all"`이라
  이론상 클라이언트가 직접 조작 가능함을 [섹션11](#sec-11)에서 별도
  Low~Medium 갭으로 명시(입실시험만큼 즉각적이지 않지만 동일한 클래스의
  문제).
- **범위**: 반별 주간 Word King(기본) + 반별 단어 수 편차를 보정한
  정규화 점수로 전체 Word King(선택, 교사가 [섹션13](#sec-13)에서 on/off).
- **저장(신규 테이블 판단)**: `entrance_tests`/`entrance_test_results`를
  재사용하지 않고 `word_king_history(class_id, period_start, period_end,
  student_id, score, crowned_at)` **신규 테이블**을 제안합니다 — 이유:
  기존 두 테이블은 "한 번의 시험 응시 원시 데이터"이고 Word King은 "여러
  소스를 합성한 계산 결과 스냅샷"이라 성격이 다릅니다(원시 데이터
  테이블에 계산 결과를 욱여넣으면 나중에 재계산 로직이 바뀔 때
  원본/파생을 구분할 수 없어짐). 저장소 관례대로
  `supabase_v{n}_word_king.sql`(멱등, `create table if not exists`)로
  준비만 하고 실행은 운영자가(CLAUDE.md 규칙 8). **이 테이블은 RLS를
  기존 게임화 테이블들과 다르게 설계해야 합니다** — anon
  `"allow anon all"`이 아니라 **anon read-only**(SELECT만) + 쓰기는
  service_role 서버 함수 전용. Word King이 정확히 "보상이 걸리면
  조작 유인이 커지는" 케이스이기 때문입니다([섹션11](#sec-11)).

<a id="sec-6"></a>
## 6. House System

- **팀 소속 판단**: `class_id`를 그대로 하우스로 쓰지 않습니다 —
  `classes`는 이미 학사적 의미(반 배정, 쓰기시험 설정 등)를 담고 있어
  "게임 팀"이라는 별개 개념을 얹으면 두 개념이 뒤섞입니다(반 삭제 시
  `ON DELETE SET NULL`로 학생을 보존하는 기존 로직과도 충돌 위험).
  대신 **신규 `students.house_id`**(nullable FK → 신규 `houses` 테이블,
  관리자 수동 배정 또는 최초 로그인 시 자동 균등배정) — **`students`에
  컬럼을 추가하므로 CLAUDE.md 규칙 10이 바로 적용됩니다**: 이 컬럼의
  `grant select/update ... to anon, authenticated`를 같은 마이그레이션
  파일에 반드시 포함해야 하며, 빠뜨리면 기존에 잘 되던 다른 `students`
  컬럼 조회까지 fail-closed로 깨질 수 있음을 [DATABASE.md](./DATABASE.md)
  RLS/컬럼권한 절이 이미 경고하고 있습니다(v2.1이 이 절차를 올바르게
  지킨 선례).
- **팀 점수 집계**: 별(XP) 합산이 아니라 **[티켓](#sec-4) 합산**을
  제안합니다 — 별은 파밍 가능(볼륨), 티켓은 이미 저빈도·비파밍성
  행동에만 배정되므로([섹션4](#sec-4)) 하우스 경쟁도 같은 왜곡(그냥 오래
  누른 사람이 팀을 캐리)을 피할 수 있습니다.
- 학생 개인 성취가 아니라 팀 단위 비교라, [Retention
  Psychology](#sec-12)에서 말하는 "하위권 개인 공개 망신 방지" 설계
  목표와 직접 연결됩니다.

<a id="sec-7"></a>
## 7. Daily Missions

**대체가 아니라 확장입니다.** 기존 "오늘의 미션 4개"
(`useStudent.js`의 `dailyProgress`/`categoriesCompleted`, 단어보기/
예문듣기/퀴즈/발음)는 스트릭 계산(`calcStreak`)과 가챠 트리거의 유일한
입력인 학습 흐름 핵심 인프라이므로 **절대 건드리지 않습니다**.

- 게임화는 기존 4/4 완료 `useEffect`(`useStudent.js` 약 713~727줄,
  `countCategoriesCompleted(round) >= 4`가 참일 때 발동하는 기존 로직)에
  **후킹만** 합니다: 이미 발동하는 지점에서 [티켓](#sec-4) +1을
  `ticketLedger`에 추가 — 새 트래킹 컬럼/트리거 없음.
- "Daily Missions"라는 이름의 **추가 선택 목표**는 이미 기록되고 있는
  `freshHistoryDay()`의 필드(`gamesPlayed`, `pronunciationAttempts`,
  `quizCorrect` 등)를 **읽기만** 해서 계산하는 보너스 조건으로 제안합니다
  (예: "오늘 서로 다른 미니게임 2종 플레이", "발음 연습 10회") — 새 저장
  필드가 전혀 필요 없는, 기존 히스토리 데이터 위의 파생 규칙입니다.

<a id="sec-8"></a>
## 8. Weekly Events

- 교사 on/off는 [Teacher Controls](#sec-13)의 반별 설정 관례를 그대로
  재사용(`classes.weekly_event_enabled`, 기본 false).
- 콘텐츠는 초기엔 **신규 이벤트 정의 테이블을 만들지 않습니다** — 기존
  `SPELLING_COMBO_BONUS`처럼 정적 JS 객체로 주(ISO week) 유형을 정의하고,
  이미 기록되는 `freshHistoryDay()` 필드를 주 단위로 합산해 판정합니다
  (예: "발음 연습 주간 — 이번 주 발음 시도 합계 20회 달성 시 티켓
  보너스"). 운영자가 실제로 이벤트 저작 도구를 요구하기 전까지 범용
  이벤트 에디터를 과설계하지 않습니다.
- 보상은 [Ticket Economy](#sec-4)를 통해서만 지급 — 별을 추가로 찍지
  않는다는 [섹션2](#sec-2) 원칙 유지.

<a id="sec-9"></a>
## 9. Seasonal Progression

- 시즌 경계 = 실제 학원 학기/방학 주기(운영자 입력 필요, 하드코딩된
  가정 없음).
- **리셋되는 것과 리셋되지 않는 것을 명확히 분리**: [Player
  Progression](#sec-1)/[XP](#sec-2)/기존 `STAR_BADGES`/
  `STREAK_MILESTONES`는 **절대 리셋하지 않습니다**(기존 코드가 이미
  "한 번 넘으면 영원히" 패턴이므로 이 전제를 깨면 기존 사용자 데이터
  의미가 바뀝니다). 시즌이 끝날 때 리셋되는 건 오직 **경쟁성 축**
  — [Ticket Economy](#sec-4) 잔액(다음 시즌 초기화) + [House](#sec-6)
  누적 점수뿐입니다.
- 시즌 종료 시점에 그 시즌의 [Word King](#sec-5) 기록을
  `word_king_history`에서 "역대 명예의 전당"으로 승격 — 경쟁 자체는
  리셋되지만 **받은 타이틀은 영구 보존**(별 뱃지가 영구적인 것과 같은
  원칙, 동기 일관성 유지).

<a id="sec-10"></a>
## 10. Rewards

- **기존 가챠 스티커 풀(별 소스)은 그대로 "무료 확률형" 경로로 유지** —
  현금 개입이 전혀 없는 이미 검증된 시스템이라 손대지 않습니다.
- **신규 티켓 상점 = 결정론적(비확률) 구매만**: [Hat Evolution](#sec-3)
  재스킨(이미 도달한 단계 내에서 다른 모자 스타일 선택), [House](#sec-6)
  점수 기부(내 티켓을 팀 점수로 전환), [Word King](#sec-5) 타이틀
  플레어(순수 코스메틱/사회적 인정, 기능 해금 아님) — **절대 확률형
  요소를 넣지 않습니다**(가챠는 별 시스템에만 있고, 그건 이미 무료
  플레이의 결과물이지 티켓으로 "산 확률"이 아니라는 구분을 유지).
- 실제 돈으로 살 수 있는 항목은 카탈로그 전체에 **0개**입니다 — 이
  저장소에 결제 연동이 아예 없고([섹션12](#sec-12) 참고), 학원 도구라는
  프로젝트 성격상 앞으로도 추가하지 않는 것을 원칙으로 못박습니다.

<a id="sec-11"></a>
## 11. Anti-cheat

**실제 코드 근거**: `wiki/security-notes.md` "알려진 보안 갭" P1 +
`PROJECT_BOARD.md` NEXT 카드 "입실시험 결과 서버 재검증 없음" —
`src/utils/entranceTestApi.js:126`(`submitEntranceResult`)이 클라이언트가
계산한 점수를 그대로 저장하고, `supabase_v1_8_entrance_test.sql:63-64`의
`entrance_test_results` RLS가 `using (true) with check (true)`라 anon
key로 임의 `student_id`/`test_id`의 점수를 조작할 수 있음이 **재현
실측으로 이미 확인**돼 있습니다. 현재 위협모델은 "학원 내부 오늘의 VIP
경쟁 배지 조작 한정"(결제/PII/계정탈취 아님)이라 Medium으로 유지되고
있습니다.

**게임화가 이 문제를 악화시키는 이유**: [Word King](#sec-5)이 바로 이
동일한 미검증 점수를, "하루 지나면 리셋되는 배지"에서 "주간/시즌 단위로
누적되고 티켓·House 점수까지 걸린 더 큰 보상"으로 격상시킵니다.
공격자(또는 그냥 승부욕 있는 초등학생)의 조작 유인이 배지 하나에서
실질적 보상 체인 전체로 커지는데, 정작 취약점은 그대로입니다. 따라서:

- **선행 조건(협상 불가)**: `api/submit-entrance-result.js`(문서화만
  돼 있고 미구현, `PROJECT_BOARD.md` NEXT 카드에 이미 근본 수정안까지
  적혀 있음 — 서버가 `entrance_tests.words`/`direction` + 클라이언트가
  보낸 원본 답안으로 `computeTestResult()`(`entranceTest.js`의 이미
  순수 함수, 서버에서 그대로 재사용 가능)를 재채점 후 결과만 저장)가
  **Word King이 입실시험 점수를 입력으로 쓰기 전에 반드시 먼저
  배포되어야 합니다.** [구현 순서](#sec-15) 1번.
- **일반화된 서버 검증 원칙(CLAUDE.md 규칙 11의 PIN 처리 패턴을
  일반화)**: PIN 검증/설정이 오직 `api/*.js`(service_role)에서만
  일어나고 클라이언트를 절대 신뢰하지 않는 것과 같은 원칙을, **보상이
  걸린 모든 신규 쓰기 경로**에 적용합니다 — Word King 산정, 티켓
  이벤트/시험 참여 크레딧, House 점수 집계는 전부 서버(service_role)
  함수가 원천 테이블에서 재계산해서 씁니다. 반면 [Daily
  Missions](#sec-7)의 4/4 완료 티켓 지급처럼 저빈도·저가치이고, 지금의
  별 시스템과 동일한 위협수준(학생이 자기 로컬 데이터를 조작해도
  실질적 이득이 없음 — 소비처가 코스메틱뿐)인 경로는 기존
  `student_progress` anon-write 관례를 그대로 유지해도 무방합니다
  (모든 경로를 서버화하면 과설계).
- **부차적 갭**: [Word King](#sec-5) 점수의 나머지 입력
  (`spellingCorrect`/`spellingTotal`, `word_status`)도 현재
  `student_daily_progress`/`word_status`가 anon `"allow anon all"`이라
  이론상 조작 가능 — 입실시험만큼 즉각적이진 않지만(정상 학습 흐름을
  거치지 않고서는 대량으로 조작하기 번거로움) 동일 계열의 위험이라
  Medium~Low로 별도 기록만 하고, Word King 1차 배포를 이 갭까지
  전부 막을 때까지 미루지는 않습니다(과도한 선행조건 팽창 방지).
- **레이트리밋 일반화**: `api/verify-admin-pin.js`의 알려진 갭(1.5초
  지연만, 정식 rate limit 없음, `PROJECT_BOARD.md` P2)을 신규
  게임화 API가 반복하지 않도록 최소한의 시도 제한을 새 엔드포인트에
  적용하되, 기존 admin-pin 갭 자체를 고치는 건 이번 설계의 범위가
  아닙니다(별도 카드로 이미 있음).

<a id="sec-12"></a>
## 12. Retention Psychology

**이미 이 코드베이스에 있는, 학문적으로 정당화 가능한 메커니즘**:
- **가변 비율 강화(variable-ratio reinforcement)**: 기존 가챠 확률
  (55/28/12/5)이 교과서적인 VR 스케줄 — 이미 검증된 채로 있습니다.
- **손실 회피(loss aversion)**: 기존 `STREAK_MILESTONES`가 이미 "끊기면
  아까운" 구조를 갖고 있습니다.
- **사회적 비교**: 기존 입실시험 VIP/랭킹.

**이 설계가 추가하는 것과 그 이유**:
- [Hat Evolution](#sec-3) = 시간축 자기비교(다른 학생과 비교가 아니라
  "예전의 나"와 비교) — 사회적 비교보다 부정행위 유인이 낮은 진행형
  보상.
- [House](#sec-6) = 팀 단위 사회적 비교 — 개인 실력이 부족해도 팀에
  기여할 방법이 있어, 순수 개인 랭킹보다 압박이 완충됩니다.

**명시적으로 배제하는 반교육적 패턴(이 앱은 학원 도구이지 상업 게임이
아니라는 원칙을 못박음)**:
- **실제 손실을 주는 타이머 없음** — 스트릭이 끊겨도 별/스티커/모자
  단계는 절대 삭제되지 않습니다(기존 `STREAK_MILESTONES` 의미론 그대로
  — 마일스톤 카운터만 멈출 뿐, 이미 받은 것을 뺏지 않음).
- **실제 결제 요소 0개** — 이 저장소에 결제 연동 자체가 없고([섹션10]
  (#sec-10)), 앞으로도 추가하지 않는 것이 원칙입니다.
- **재참여 유도 푸시 알림 다크패턴 없음** — 그런 인프라가 이 프로젝트에
  없고, 이 설계 목적을 위해 새로 만들지 않습니다.
- **페이투윈/스킵 없음** — 티켓 상점 어떤 항목도 학습을 건너뛰거나
  퀴즈/시험 정답을 사는 데 쓰이지 않습니다([섹션10](#sec-10)).
- **하위권 개인 공개 망신 없음** — Word King은 우승자만 발표하고
  "꼴찌"를 노출하지 않으며, House는 애초에 개인이 아니라 팀 단위입니다.

<a id="sec-13"></a>
## 13. Teacher Controls

- **재사용 대상**: `AdminScreen.jsx`의 `SpellingSettingsPanel` +
  `classes` 테이블의 반별 boolean/설정 컬럼 관례
  (`spelling_test_enabled` 등, 기본값 false, opt-in). 신규
  `GameSettingsPanel`(동일 컴포넌트 패턴)이 `classes`에 추가될
  `gamification_enabled`(마스터 스위치, **기본 false**)/
  `word_king_enabled`/`house_enabled`/`weekly_event_enabled`를
  읽고 쓰는 형태를 제안합니다.
- **왜 `config/features.js`를 재사용하지 않는가**: 이름이 겹치는
  `ranking`/`pointSystem`/`leaderboard`/`rewardSystem` 플래그가 이미
  있지만, 이걸 읽는 `useFeatureAccess.js`가 저장소 어디서도 import되지
  않는 죽은 코드임을 grep으로 확인했습니다. 이 위에 새 기능을 얹으면
  ① 검증 안 된 2년 전 코드를 되살려야 하거나 ② `FeatureManagementPanel`
  안에 "진짜 동작하는 새 토글"과 "장식용 죽은 토글"이 공존해 다음
  세션이 헷갈리는 문제가 생깁니다. 결론: `features.js`는 건드리지 않고
  (append-only/삭제 금지 원칙, CTO에게 정리 필요성만 별도 보고),
  이미 실사용 검증된 `classes` 컬럼 패턴으로 새로 만듭니다.
- **마스터 스위치가 기본 false인 이유**: `spelling_test_enabled` 도입
  선례와 동일 — 111명 실사용 학생에게 미검증 기능이 갑자기 노출되지
  않도록, 교사가 반별로 명시적으로 켜야만 보입니다.

<a id="sec-14"></a>
## 14. Parent Motivation

- `ParentScreen.jsx`는 **읽기 전용**임을 파일 상단 주석이 명시("쓰기
  동작은 전혀 없음 — 진행 기록을 절대 바꿀 수 없음")하고, 관리자
  대시보드와 동일한 `fetchDashboardData`/`computeStudentStats`/
  `buildWeeklyReport`(`utils/weeklyReport.js`)를 공유해 두 화면이 항상
  같은 숫자를 보여줍니다. 게임화 데이터도 **이 공유 경로를 그대로
  통과**시켜야, 관리자 화면과 학부모 화면이 다른 레벨/모자 단계를
  보여주는 불일치를 원천 차단합니다.
- 구체적으로 `computeStudentStats()`의 반환값에 파생 필드([섹션1](#sec-1)
  레벨, [섹션3](#sec-3) 현재 모자 단계, [섹션6](#sec-6) 이번 주 하우스
  순위, [섹션5](#sec-5) 최근 Word King 수상 이력)를 추가 — 전부
  `fetchDashboardData`가 이미 가져오는 `student_progress` 컬럼에서
  파생되므로 `ParentScreen.jsx`에 **새 Supabase 쿼리를 추가하지
  않습니다**(파일 자체의 기존 원칙과 정확히 일치).
- `buildWeeklyReport()`(AI 호출 없는 규칙 기반 템플릿,
  `wiki/api-costs.md`가 이미 "무료 대안 우선 원칙의 실례"로 기록한
  바로 그 함수)에 문장 1~2개만 조건부로 추가(예: "이번 주 OO팀에 티켓
  N개를 기여했어요", "모자가 다음 단계까지 별 N개 남았어요") — 새 AI
  호출을 추가하지 않고 기존 패턴을 그대로 확장합니다(CLAUDE.md 규칙 7).

---

<a id="sec-15"></a>
## 구현 순서 제안 (의존성 그래프)

```
1) Anti-cheat 인프라 (api/submit-entrance-result.js 등 서버 재검증)
   └─ 선행 이유: 섹션5(Word King)가 입실시험 점수를 입력으로 쓰는데,
      이게 없으면 배지 조작이 곧바로 "티켓+House+시즌 명예의 전당"
      전체로 확대 악용됨 (섹션11)

2) Player Progression / XP 표준화 (레벨 공식 확정 — 새 저장 필드 없음)
   └─ 선행 이유: 섹션3(Hat)/섹션4(Ticket 등급)/섹션6(House 계산)이
      전부 이 숫자를 입력으로 참조

3) Teacher Controls 마스터 스위치 (classes.gamification_enabled, 기본 false)
   └─ 선행 이유: 이후 모든 학생 노출 기능이 이 스위치 뒤에서만
      켜져야 111명 실사용자에게 미검증 기능이 갑자기 노출되지 않음

4) Hat Evolution (신규 컬럼 1개, 순수 파생값, 리스크 최소)
   └─ 목적: 신규 컬럼+GRANT(불필요 확인)+폴백 배포 파이프라인을
      가장 단순한 조각으로 먼저 검증

5) Ticket Economy (ledger 방식 — mergeProgressRecords 정책 확장 필요)
   └─ 선행 이유: 섹션7(Daily Missions 후킹)·섹션10(Rewards 싱크)·
      섹션6(House 집계)·섹션8(Weekly Events 보상)이 전부 이 위에서 성립

6) Daily Missions 후킹 + Rewards 카탈로그(싱크)   ← 5) 직후, 같은 라운드
   └─ 소스(4)와 싱크(카탈로그)를 반드시 같은 배포 라운드에 묶어
      "싱크 없는 통화" 상태를 만들지 않음 (섹션4/10)

7) Word King (신규 테이블, anon read-only + service_role 전용 write)
   └─ 반드시 1) 이후에만 착수 — 1) 없이 먼저 만들면 바로 악용됨

8) House System + Weekly Events
   └─ House는 5) 이후(티켓 합산), Weekly Events는 6)-7) 이후
      (이벤트 보너스가 티켓/Word King 참여를 확장하는 형태이므로)

9) Seasonal Progression (Ticket/House 리셋 경계 정의)
   └─ 5)·8) 완료 후에만 "무엇을 리셋할지"가 의미를 가짐

10) Parent Motivation 노출 (read-only 표면화, 가장 마지막)
    └─ 위 숫자 전부가 안정화된 뒤 노출하는 게 가장 낮은 리스크
       (ParentScreen은 쓰기 없음, 잘못돼도 되돌리기 쉬움)
```

각 단계는 CLAUDE.md 필수 완료 체크리스트(build/verify/문서화/GRANT/
학생 UUID 식별/`.ai-status` 체크포인트/소커밋)를 그대로 따릅니다. 이
설계 문서 자체는 위 어떤 단계도 구현하지 않았으며, 실제 착수는 운영자
승인 후 `PROJECT_BOARD.md`의 해당 카드를 BACKLOG → NEXT로 옮기는
시점부터입니다.

## 관련 파일

`C:\voca\ARCHITECTURE.md`(Word King 미실존 확인 섹션),
`C:\voca\DATABASE.md`, `C:\voca\wiki\security-notes.md`,
`C:\voca\wiki\api-costs.md`, `C:\voca\src\hooks\useStudent.js`,
`C:\voca\src\components\AdminScreen.jsx`,
`C:\voca\src\components\ParentScreen.jsx`,
`C:\voca\src\utils\weeklyReport.js`,
`C:\voca\src\utils\entranceTest.js`,
`C:\voca\src\utils\entranceTestApi.js`,
`C:\voca\src\data\stickers.js`, `C:\voca\src\config\features.js`,
`C:\voca\PROJECT_BOARD.md`(구현 순서 반영 BACKLOG 카드)

---

<a id="sec-16"></a>
## 16. 리뷰 및 개선 제안 (Engineering Head, 2026-07-19)

_이 섹션은 append입니다 — 위 1~15번 섹션 원문은 전혀 수정하지
않았습니다. 아동심리학/게임화 연구/교육과학/장기 리텐션 관점에서
위 설계를 검토한 결과이며, **코드 구현은 하지 않았습니다**(문서만).
일반론이 아니라 이 문서에 이미 적힌 구체적 수치/규칙에 대한 리뷰만
담았습니다 — 근거 없는 개선안은 포함하지 않습니다._

### 16.1 가챠가 하루 여러 번 발동 가능한 구조 — 파밍 유인 재검토 필요

[섹션 "기존 시스템 요약"](#기존-시스템-요약-설계의-출발점)이 명시하듯
스티커 가챠(common 55%/rare 28%/epic 12%/legendary 5%)는 "오늘의 미션
4/4 완료 시마다 발동(하루 여러 번 가능)"합니다. 가변 비율 강화
(variable-ratio reinforcement)는 [섹션12 Psychology](#sec-12)가 인용한
대로 학술적으로 정당화되는 기제이지만, **한 번의 강화 사이클이 아니라
"하루 여러 번 반복 가능"이라는 조건이 붙으면 초등학생 대상으로는
다른 문제가 생깁니다**: 학생이 "오늘의 미션 4/4"를 완료한 뒤에도
계속 라운드를 반복 진입하는 행동이 순수하게 "가챠를 더 뽑기 위해"
동기화될 위험입니다(학습 완료의 부산물이 아니라 학습 완료를
반복 소비하는 목적이 되는 역전). [섹션2 XP System](#sec-2)의
인플레이션 방지 원칙(별을 새로 찍어내지 않음)은 지켜지고 있지만, 가챠
자체는 그 원칙 밖에 있어 이 갭을 못 막습니다. **개선안**: 하루 N회차
이후부터는 등급 확률을 common 100%로 고정(첫 회차만 현재 분포 유지)하는
"일일 체감 로직"을 제안합니다 — 이렇게 하면 "오늘 처음 미션을 다
채웠을 때의 짜릿함"은 그대로 살리면서, 반복 진입으로 legendary를
여러 번 노리는 유인만 제거됩니다. 이 조정은 [섹션10 Rewards](#sec-10)
"무료 확률형 경로"의 성격을 바꾸지 않고 빈도만 제한하므로 재설계
없이 적용 가능합니다.

### 16.2 Word King 주간 갱신 주기 — 상시 패자 학생의 좌절 누적 위험

[섹션5 Word King](#sec-5)은 주기를 "주간(또는 시즌)"으로 제안합니다.
학급 규모가 고정된 상태에서 매주 정확히 1명만 왕관을 받는 구조라면,
실력이 상대적으로 낮은 학생은 **매주 반복해서 패배를 확인**하게
됩니다 — 성장 마인드셋(growth mindset) 관점에서, 승자가 매주 바뀌지
않고 고착되면 나머지 학생들에게는 경쟁이 아니라 "해봐야 소용없다"는
학습된 무기력의 반복 신호가 될 수 있습니다. [섹션12 Psychology](#sec-12)가
이미 "하위권 개인 공개 망신 없음"(Word King은 우승자만 발표)을
설계 원칙으로 못박은 것과 같은 문제의식이지만, **우승자 발표를
감춰도 "내가 이번 주도 못 받았다"는 사실 자체는 학생 본인에게는
투명합니다.** **개선안**: Word King(절대 1등)과 별개로, 같은 주기에
**"이번 주 성장상"**(직전 주 대비 개인 점수 향상폭이 가장 큰 학생,
[섹션5](#sec-5)의 서버 계산 점수를 그대로 재사용해 `score - 지난주
score`로 추가 계산만 하면 됨, 신규 저장 필드 불필요)을 함께 발표하는
것을 제안합니다 — 매주 다른 학생이 받을 수 있는 상이라 고착된 승자
구도를 완화하고, "꾸준히 하면 나도 받을 수 있다"는 신호를 줍니다.

### 16.3 Word King 점수 산정 — 소표본(작은 응시 수) 왜곡 미보정

[섹션5](#sec-5)의 점수 산정은 "쓰기시험 첫시도 정답률
(`spellingCorrect/spellingTotal`)"을 가중치 항목으로 포함합니다.
정답률은 응시 횟수가 적을수록 통계적으로 불안정합니다 — 예를 들어
그 주에 쓰기시험을 1~2문제만 푼 학생이 우연히 전부 맞히면 100%로,
50문제를 풀어 45문제(90%)를 맞힌 성실한 학생보다 높은 점수를 받을 수
있습니다. 이는 "그라인딩한 학생이 왕이 되는 왜곡을 피한다"는
[섹션5](#sec-5) 자체의 설계 의도(순수 별 총합 배제 이유)와 **정확히
반대 방향의 왜곡**을 새로 만듭니다. **개선안**: `spellingTotal`(응시
문항 수)에 최소 임계값(예: 그 주 10문항 이상)을 두어 미달 시 이
항목을 0 또는 학급 평균으로 대체하거나, 베이지안 평균(사전 확률을
학급 평균 정답률로 두고 응시 수가 늘수록 실제 정답률에 수렴시키는
가중 평균)을 적용하는 것을 제안합니다 — 두 방법 모두 신규 저장 필드
없이 서버 계산 시점(`api/*.js`, [섹션11 Anti-cheat](#sec-11) 선행 이후)
의 공식만 조정하면 되므로 스키마 변경이 필요 없습니다.

### 16.4 Ticket Economy — 초기 획득 속도가 너무 느리면 "콜드스타트" 이탈 위험

[섹션4](#sec-4)의 티켓 소스는 "오늘의 미션 4/4 완료 1회당 1개" +
저빈도 주간/시즌 보너스로, 의도적으로 파밍을 어렵게 설계돼 있습니다
([섹션2](#sec-2) 인플레이션 방지 원칙과 일관). 그러나 행동경제학의
"초기 성공 경험(early win)" 원리 관점에서, **첫 보상까지 걸리는
시간이 너무 길면 습관 형성 전에 학생이 흥미를 잃을 위험**이 있습니다
— 하루 1개씩만 쌓이는 구조에서 [섹션10 Rewards](#sec-10)의 상점
아이템(모자 재스킨 등)이 예를 들어 20~30개 단위로 책정되면, 첫 구매까지
3~4주가 걸려 "티켓이 뭘 위한 것인지" 체감하기도 전에 흥미가 식을 수
있습니다. **개선안**: 티켓 상점에 낮은 가격대(예: 3~5개, 첫 주 내
도달 가능)의 "입문용" 코스메틱 1~2종을 반드시 포함해, 신규
학생이 게임화 시스템을 처음 접한 뒤 1주 이내에 최소 1회 구매를
경험하게 하는 것을 제안합니다. 이는 [섹션4](#sec-4)/[섹션10](#sec-10)의
"소스는 저빈도" 원칙을 바꾸지 않고 **상점 가격 설계**만 이 원칙을
반영해 조정하는 것이라 신규 저장 필드나 소스 확대가 필요 없습니다.

### 16.5 House 배정 — "자동 균등배정"의 재조정(rebalancing) 규칙 미정의

[섹션6](#sec-6)은 신규 `students.house_id`를 "관리자 수동 배정 또는
최초 로그인 시 자동 균등배정"으로 제안하지만, **균등배정의 구체적
알고리즘과 재조정 시점**이 정의돼 있지 않습니다. 단순 라운드로빈이나
무작위 배정만으로는, 학기 중 신규 등록/반 이동이 시간에 따라 불균형
누적(예: 특정 시기에 등록이 몰리면 그 시기의 하우스가 인원 우위)될
수 있습니다. [섹션9 Seasonal Progression](#sec-9)은 시즌이 끝날 때
House **점수**를 리셋한다고 명시하지만 House **소속(인원 배정)**을
재조정하는지는 언급이 없어, 극단적으로 한쪽 하우스가 영구적으로
인원이 많아지는 시나리오를 배제하지 못합니다. **개선안**: (a) 최초
자동배정은 "가장 인원이 적은 하우스로 배정"(단순 라운드로빈보다
견고) 규칙을 명시하고, (b) 시즌 경계([섹션9](#sec-9))마다 하우스별
인원 편차가 임계값(예: 10%)을 넘으면 신규 학생만 재조정 대상으로
삼아(기존 학생의 소속감을 깨지 않기 위해 기존 학생은 유지) 균형을
맞추는 규칙을 [섹션6](#sec-6)/[섹션9](#sec-9)에 명시적으로 추가할 것을
제안합니다.

### 16.6 Anti-cheat 부차 갭의 유예 판단 — 위협모델 재확인 권고

[섹션11](#sec-11)은 `student_daily_progress`/`word_status`의 anon
`"allow anon all"` 갭을 "Word King 1차 배포를 막을 정도는 아님
(Medium~Low)"으로 유예합니다. 이 판단의 근거("정상 학습 흐름을
거치지 않고서는 대량으로 조작하기 번거로움")는 **입실시험처럼 단일
API 호출로 조작 가능한 갭보다는 확실히 낮은 위험**이지만, Word King이
실제로 배포되어 "매주 우승/성장상이 걸린다"는 사실이 알려지면
위협모델의 전제(조작 유인이 낮음)가 바뀝니다 — 골든타임 이전에는
없던 실질적 유인(급우 사이의 명예, 상점 티켓)이 생기기 때문에, 초등
고학년 학생 중 개발자도구/네트워크탭 조작법을 아는 소수가 시도할
가능성은 배지 하나였을 때보다 유의미하게 올라갑니다. **개선안**:
[섹션11](#sec-11)의 유예 판단 자체를 바꾸자는 것은 아니지만, Word
King 1차 배포 **직후 1~2주** 학생별 `spellingCorrect`/`mastered` 값의
비정상 급증(예: 하루 만에 학급 평균의 5배 이상 증가)을 관리자
대시보드에서 수동으로 훑어볼 수 있는 간단한 이상치 표(신규 쿼리 없이
기존 `fetchDashboardData()` 값을 정렬만 다르게 보여주는 뷰)를
[섹션13 Teacher Controls](#sec-13)에 추가하는 것을 제안합니다 — 서버
검증을 추가하지 않고도 운영 중 이상 징후를 사람이 조기에 발견할 수
있는 저비용 완화책입니다.

### 요약 — 우선순위 재조정 제안

위 6개 중 **16.3(소표본 왜곡)과 16.6(부차 갭 조기 관측)은 Word King
1차 구현([섹션15](#sec-15) 7번 단계) 자체에 포함해서 설계하는 것을
권장**합니다 — 별도 후속 라운드로 미루면 이미 배포된 산정 공식/운영
관례를 나중에 바꾸는 비용이 더 커집니다. 16.1(가챠 일일 체감)과
16.4(티켓 콜드스타트)는 각각 [섹션15](#sec-15) 6번 단계(Daily
Missions/Rewards)에서 함께 검토 가능한 저비용 조정입니다. 16.2(성장상)와
16.5(House 재조정 규칙)는 각각 7번/8번 단계 설계를 구체화할 때 반영
권장 — 지금 즉시 코드/스키마를 바꿔야 할 항목은 없습니다(이 섹션도
순수 문서 리뷰).
