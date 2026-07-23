# Paul Memory Engine — 학습과학 종합 설계
### (Dual Coding · Active Recall/Retrieval Practice · 정서기억 · 스토리텔링 · 신체화 학습 · 몬테소리 · 게임화 — 간격반복과 통합)

_작성: 2026-07-24. 순수 문서 조사·설계 세션(researcher) — 소스코드/SQL/설정
파일은 전혀 수정하지 않았습니다. 아래 스키마/API 스케치는 전부 **설계
초안**이며, 실제 `supabase_v*.sql` 파일 생성·실행이나 컴포넌트 구현은 이
작업 범위에 포함되지 않습니다(저장소 헌법 규칙 8 — DDL은 운영자 전담,
규칙 12 — 학생 대상 신규 기능/UI/게임화의 **구현**은 이번 AI 개발
운영체제 구축 범위에서 절대 금지. 이 문서는 "구현"이 아니라 향후 별도
planner/implementer 세션이 참고할 설계 문서입니다)._

## 0. 요약 (TL;DR)

운영자가 요청한 "아이들이 단어를 가장 오래 기억하게 만드는 시스템"은
간격반복(SRS, `docs/research/memory-engine.md`가 이미 깊이 다룸) 하나로
완성되지 않습니다. 이 문서는 SRS를 다시 조사하지 않고, 그 위에 얹을
**7개 추가 학습과학 원리**(Dual Coding, Active Recall/Retrieval
Practice/Generation Effect, Interleaving, Emotional Memory,
Storytelling/Elaborative Encoding, Embodied Learning, Montessori)와
**이미 매우 성숙한 Gamification**을 조사해, Paul Easy Voca에 실제로
적용 가능한 것만 정리합니다.

핵심 발견 3가지:

1. **이 프로젝트는 이미 이 원리들의 상당수를 구현하고 있습니다** —
   단, "학습과학 원리"라는 이름을 붙이지 않고 다른 목적(감성적 UX,
   게임화)으로 만들어졌을 뿐입니다. 쓰기시험(`SpellingQuestion.jsx`)의
   타이핑 채점은 이미 진짜 **생성 효과(generation effect)** 기반 인출
   연습이고, "폴의 기억"(`paulMemory.js`)은 이미 진짜 **정서기억+
   스토리텔링** 레이어이며, `memoryTip`은 이미 **정교화 부호화
   (elaborative encoding)** 텍스트 슬롯입니다. 이걸 모르고 "새로"
   설계하면 헌법 규칙 3(완료된 것 재구현 금지)을 어기게 됩니다.
2. **가장 크게 비어있는 축은 Dual Coding(이미지)와 Interleaving(신구
   단어 섞어내기)입니다.** `words` 테이블에는 이미지 관련 컬럼이 전혀
   없고(DATABASE.md 역추적 확인), 오늘의 학습은 배정 순서 그대로
   순차 진행되며 새 단어/복습 단어를 섞는 로직이 없습니다(코드 확인,
   2.3절).
3. **가장 ROI가 높은 신규 요소는 "정원(Garden)을 진짜 기억 상태의
   시각화로 바꾸는 것"입니다** — 이미 존재하는 게임화 UI(`gardenPlots`,
   `PaulTown.jsx`)를 갈아엎지 않고, 그 입력값만 "학습 여부"에서
   memory-engine.md가 설계한 Leitner 박스 레벨로 바꾸면, 신규 화면
   0개로 SRS+게임화+정서기억을 한 번에 잇는 구조가 됩니다(6절).

## 1. 조사 범위와 방법

### 1.1 이 문서와 `memory-engine.md`의 관계

`docs/research/memory-engine.md`(2026-07-23)는 간격반복 **알고리즘
선택**(완화형 Leitner 6단계 채택, FSRS/HLR/SM-2 배제 근거, 신규 테이블
`word_review_schedule` 스케치)만 다룹니다. **이 문서는 그 결론을 그대로
전제하고 다시 조사하지 않습니다** — 3.3절에서 통합 지점만 요약합니다.
이 문서가 새로 다루는 것은 SRS가 답하지 않는 질문("언제 다시 보여줄까"가
아니라 "처음 볼 때/다시 볼 때 어떻게 보여줘야 더 오래 남는가")입니다.

### 1.2 코드베이스 확인 (WebSearch 전에 먼저 수행)

`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/`ROADMAP.md`/`DATABASE.md`를
전문 읽고, 아래 파일을 직접 열어 확인했습니다(전부 실측, 추정 없음):

- `src/components/WordDetail.jsx`(단계 구성 `buildSteps`, `memoryTip`
  렌더 지점, `PronounceStep`/`ExampleStep`)
- `src/components/QuizGame.jsx`(발음 녹음 채점 = `blob.size>0`, 4지선다
  인식형 퀴즈)
- `src/components/SpellingQuestion.jsx`(자유 입력 `<input>` 기반 타이핑
  채점 — 인식형이 아니라 생산형)
- `src/components/MatchGameShell.jsx`(소리 재생 후 뜻 탭 매칭 — 이미지
  없음)
- `src/utils/attachment/paulMemory.js`(폴의 기억 18종 템플릿 전문)
- `src/utils/houseSystem.js`/`src/utils/paulRankShared.js`/
  `src/utils/ticketEconomy.js`(게임화 3대 축 헤더 주석)
- `src/utils/dailyRitual.js`(적응형 마이크로세션 — 순서 재배열은 안 함,
  순차 슬라이스만)
- `DATABASE.md`의 `words`/`students`/기능별 테이블 전체 — 이미지 관련
  컬럼, 학년/POS(품사) 관련 컬럼 **부재 확인**
- `src/utils/wordLibrary.js`에서 `interleav`/`shuffle`/`무작위` 관련
  grep — 반 전체 사전 순서 정렬 이슈(natural sort 버그 수정 이력)만
  발견, "신구 단어를 섞어 낸다"는 의미의 로직은 없음(부재 확인)

### 1.3 WebSearch 조사 목록(9절에 URL 전체)

Dual Coding, Retrieval Practice/Testing Effect(아동), Emotional Memory
(L2 아동), Storytelling/Narrative(아동 어휘), Embodied
Cognition/Gesture/TPR(아동 L2), Montessori(언어 영역 설계 원칙),
Gamification(Duolingo 실증 연구), Generation Effect(생산 vs 인식),
Interleaving×Spacing(어휘/철자), Keyword Method/정교화 부호화 — 총
9개 검색, 전부 2020년 이후 결과 우선 확인(가능한 경우 아동/L2 맥락).

## 2. 기존 코드베이스 현황 — 원리별 "이미 있음" 실측표

이 표가 3절 각 원리 조사보다 먼저 오는 이유: 운영자가 "이미 있는 원리를
새로 발견한 것처럼 적지 말라"고 명시했기 때문입니다. 아래는 코드로
확인된 사실만 담습니다.

| 원리 | 이미 있음(실측) | 근거 파일 | 비어있는 부분 |
|---|---|---|---|
| Active Recall / Generation Effect | 쓰기시험이 **자유 입력 타이핑**(객관식 아님) 채점 | `SpellingQuestion.jsx` 94~340행(`<input>` 기반, `isSpellingCorrect`) | 퀴즈(`QuizGame.jsx`)와 매칭게임(`MatchGameShell.jsx`)은 여전히 4지선다 **인식형**(recognition) — 생성 효과 연구가 지적하는 "약한 쪽" |
| Emotional Memory + Storytelling | "폴의 기억" 18종 템플릿, 전부 학생 실데이터 기반, AI 호출 없음, 결정론적, 거짓 기억 금지 원칙 코드 강제 | `src/utils/attachment/paulMemory.js` 1~330행 | 템플릿이 **교사/시스템이 미리 쓴 문장**이라 학생 자신의 정교화(자기만의 연상)는 없음 |
| Elaborative Encoding(정교화 부호화) | 단어별 `memoryTip`("암기 꿀팁") 표시 슬롯 이미 존재·렌더 중 | `WordDetail.jsx` 332~340행, 388~396행 | 관리자가 입력한 **고정 텍스트**일 뿐, 학생이 스스로 만드는 연상(키워드법의 핵심)은 없음 |
| Dual Coding(부분) | 매칭게임이 "소리 재생 + 텍스트 뜻" 매칭(청각+텍스트 이중부호화) | `MatchGameShell.jsx` 61~64행(`playWordAudio`), 옵션은 `opt.meaning` 텍스트 | **이미지 채널이 아예 없음** — `words` 테이블에 이미지 관련 컬럼 자체가 없음(`DATABASE.md` `words` 역추적 표, 2.2절) |
| Embodied Learning(부분) | 발음 녹음(소리내어 말하기, 입 근육 운동) 이미 필수 단계 | `WordDetail.jsx`의 `PronounceStep`, `QuizGame.jsx`의 `PronStep` | **몸짓/동작(gesture/TPR)** 요소는 전혀 없음 — 발음만 신체화, 의미와 몸을 잇는 인터랙션은 없음 |
| Montessori(자기주도) | 학생이 스스로 유닛 전환 가능(v2.1, 진행도 리셋 없음), 적응형 세션 크기(`dailyRitual.js`), 오늘의 미션 순서 자유(공부/퀴즈/게임 중 보너스 선택) | `students.current_unit_id`(v2.1), `dailyRitual.js`, `BonusChoiceScreen.jsx` | "정답/오답을 스스로 확인하는 교구"(control of error)는 즉시 피드백으로 이미 구현되나, **오늘 뭘 먼저 복습할지 학생이 고르는 선택지**는 없음(전부 시스템이 순서를 정함) |
| Interleaving/Spacing | Spacing은 memory-engine.md가 이미 설계(Leitner 6단계) | `docs/research/memory-engine.md` 6.3절 | **Interleaving(신규 단어 vs 복습 단어를 섞어 내는 것)은 전혀 없음** — `dailyRitual.js`의 세션 분할은 순차 슬라이스일 뿐 순서를 재배열하지 않음(1.2절 grep 확인) |
| Gamification | Paul Rank(XP), House System(팀), Ticket Economy, Word King, Seasonal Progression, 모자 컬렉션, 정원, Paul Town, 성장앨범 — 8개 이상 축이 이미 실운영 | `paulRankShared.js`/`houseSystem.js`/`ticketEconomy.js`/`wordKing.js`/`DATABASE.md` `seasons` 절 | 신규 게임화 요소는 **불필요**(오히려 과잉 위험) — 강화 포인트는 "기존 게임화가 진짜 기억 정착과 연결되는가"뿐(6절) |

## 3. 원리별 조사 + Paul Easy Voca 적용 매핑

각 소절은 "연구가 뭐라고 하는가" → "그래서 Paul Easy Voca에 뭘 어떻게
붙이는가"(추상 원리 나열 금지, 운영자 명시 요구) 순서로 씁니다.

### 3.1 Dual Coding(이중부호화)

**연구**: 언어(verbal)와 이미지(nonverbal) 두 개의 독립적이지만 연결된
부호화 체계를 동시에 쓰면 인출 경로가 늘어나 기억이 더 견고해집니다.
2022년 Frontiers 연구(EFL 학습자 대상)는 멀티모달 입력이 L2 어휘 학습을
돕는다고 확인했고, 그림과 함께 배운 어휘가 언어 설명만으로 배운 경우보다
더 나은 이해도를 보인다는 결과가 반복 확인됩니다. 단, 같은 연구군은
"장식용 그림"과 "개념을 담은 그림"을 구분해야 한다고 강조합니다
(무관한 그림은 인지 부하만 늘림).

**Paul Easy Voca 적용**:
- **DB**: `words.image_url`(nullable text) 신규 컬럼 스케치(4.3절) —
  관리자가 무료 이미지(직접 촬영/무료 클립아트 URL)를 단어별로 선택적
  등록. **AI 이미지 생성은 채택하지 않음**(헌법 규칙 7 — 유료 API
  금지, 무료 대안 우선. 단어당 이미지 생성 비용이 반복 발생하는 구조는
  이 프로젝트의 "학부모 리포트는 규칙기반 템플릿" 선례와 정반대 방향).
- **저비용 대안(우선 권장)**: 이미지 URL 없이도, 이미 이 앱 전체에서
  일관되게 쓰는 이모지 언어(모자/House/폴의 기억 전부 이모지 기반)를
  단어에도 적용 — 관리자가 단어 업로드 시(Excel/PDF) 선택적으로 이모지
  1개를 지정하면 그게 "이미지 채널" 역할을 함(신규 이미지 자산·저장소
  ·CDN 비용 0). `words.image_emoji`(nullable text, 이모지 1~2글자)를
  `image_url`보다 먼저 구현하는 것을 권장 — 기존 관례(이모지가 이미
  "이 앱의 시각 언어")와 정합, 외부 의존성 0.
- **UI**: `WordDetail.jsx`의 `PronounceStep`/`ExampleStep`에 단어
  텍스트+발음 옆에 이모지(있으면) 또는 이미지(있으면) 노출 슬롯 추가.
  `MatchGameShell.jsx`의 보기 카드에도 뜻 텍스트 옆 이모지 배지 추가 —
  청각(소리)+시각(이모지/이미지)+텍스트(뜻) 3중 부호화로 확장.
- 둘 다 **없어도 완전히 정상 동작**해야 함(폴백: 지금처럼 텍스트+소리만)
  — 전 단어에 이미지/이모지를 채우는 건 운영 부담이 크므로 opt-in.

### 3.2 Active Recall / Retrieval Practice / Generation Effect

**연구**: "인출 연습이 추가 학습보다 장기 기억에 낫다"(testing effect)는
반복 확인된 결과이며, 특히 **직접 답을 만들어내는 것(생성, generation)이
객관식에서 답을 고르는 것(인식, recognition)보다 강한 기억 흔적을
남긴다** — 답을 만드는 과정이 뇌에서 실제 인출과 같은 경로를 활성화하기
때문입니다. 아동 대상 연구(12~13세)에서도 생성 효과가 확인되고, 다만
"인출 연습 효과는 학습 대상에 대한 의미망이 어느 정도 갖춰져 있어야
나타난다"(너무 이른 단계의 완전 신규 단어에는 효과가 약할 수 있음)는
단서가 있습니다.

**Paul Easy Voca 적용**:
- **이미 있음(강조)**: `SpellingQuestion.jsx`의 타이핑 채점은 이미
  "생성"입니다 — 이걸 다시 만들 필요 없음. 오히려 이 강점을 문서화해서
  향후 세션이 "퀴즈를 스펠링으로 바꾸자"는 식으로 잘못 재작업하지 않게
  하는 것 자체가 이 조사의 성과입니다.
- **강화 포인트(신규 UI 상호작용, 헌법 규칙 12상 이번 세션 구현 금지 —
  설계만)**: `QuizGame.jsx`/`MatchGameShell.jsx`의 4지선다 앞에 **"먼저
  생각해보기" 인터랙션**을 얹는 안 — 소리를 들려준 뒤 보기를 즉시
  보여주지 않고, "무슨 뜻일까? 아는 만큼 떠올려보세요"라는 화면(빈
  말풍선 + "생각 다 했어요" 버튼, 답 입력을 강제하지 않음 — 8세 아동에게
  타이핑을 매번 요구하면 이탈 위험)을 1~2초 거친 뒤 보기를 공개. 이는
  formal answer 없이도 "인출 시도"라는 인지 행위 자체를 강제하는
  저비용 절충안입니다(순수 UI 상태, DB/API 변경 없음).
- **주의(연구 단서 반영)**: 이 "먼저 생각해보기" 게이트는 **복습
  단어(박스 레벨 ≥1)에만** 적용을 권장 — 완전히 처음 보는 단어(박스
  0)는 의미망이 없어 인출 연습 효과가 약하다는 연구 결과와 정합
  (memory-engine.md의 Leitner 박스 레벨을 그대로 게이팅 신호로 재사용).

### 3.3 Spaced Repetition — 통합만(재조사 없음)

`memory-engine.md`의 완화형 Leitner 6단계(0~5, 간격 즉시/1/3/7/14/30일,
오답 시 1단계만 강등)를 그대로 채택합니다. 이 문서의 나머지 원리들은
전부 이 위에 얹히는 계층으로 설계합니다(4.1/4.3절에서 구체화) — 특히
3.2의 "먼저 생각해보기" 게이트, 3.4의 interleaving 우선순위, 6절의
정원 시각화 전부 박스 레벨을 입력으로 씁니다.

### 3.4 Interleaving(교차 연습)

**연구**: Interleaving(여러 개념/단어를 블록으로 몰아서가 아니라 섞어서
연습)은 장기 파지·전이에 blocked practice보다 낫다는 결과가 광범위하게
확인됩니다. 아동 철자 학습 연구(2020년대)는 interleaved 연습이 즉시
사후검사와 8주 후 추적검사 모두에서 오류를 줄였다고 보고합니다. 단,
**중요한 예외**가 있습니다 — 외국어 발음(pronunciation) 학습에서는
blocked practice가 interleaving보다 더 나았다는 연구가 있습니다(발음은
근육기억 형성에 반복 집중이 유리한 것으로 해석). Spacing과 결합하면
추가적 상승효과가 있다는 보고도 있습니다.

**Paul Easy Voca 적용**:
- **학습 순서(4.1절 본체)**: "오늘의 단어" 구성 시 신규 단어(오늘 처음
  배정)와 복습 대상(박스 레벨의 `next_review_date <= 오늘`)을 **블록으로
  나누지 않고 섞어서** 제시. 지금은(`dailyRitual.js`) 배정 순서 그대로
  순차 슬라이스만 하므로, 이 부분이 순수하게 새로운 로직입니다.
- **예외 반영**: `PronounceStep`/`PronStep`(발음 녹음)은 위 연구의
  "발음은 blocked가 유리" 결과를 반영해 **interleaving 대상에서
  제외** — 한 단어를 배우는 동안(공부하기 모드의 pronounce→example
  단계)은 그대로 블록 유지, 여러 단어를 넘나드는 **퀴즈/복습 단계**에서만
  신구 단어를 섞습니다. 즉 "단어 하나 안에서의 단계 순서"는 안 건드리고,
  "여러 단어를 어떤 순서로 내보내는가"만 바꾸는 설계입니다(기존 플로우
  안정성 우선 — 헌법 규칙 1).

### 3.5 Emotional Memory(정서기억)

**연구**: 정서적 단어(또는 정서적 맥락에 놓인 중립 단어)가 중립 단어보다
더 잘 기억된다는 결과가 L1뿐 아니라 L2 학습자에게도 재현됩니다(2023년
연구, post-encoding emotion 효과 포함). 이중언어 아동 대상 연구는
정서가가 높은 단어일수록 기억 왜곡(false memory)도 함께 커진다는 흥미로운
부작용도 보고합니다 — "정서적으로 각인"이 항상 "정확하게 각인"을
의미하진 않는다는 뜻이라 정서 장치는 어휘의 **의미 자체**를 왜곡하지
않는 선에서 써야 합니다(예: 단어 뜻은 정확히, 감정은 그 주변 맥락에만).

**Paul Easy Voca 적용**:
- **이미 있음(강조)**: "폴의 기억"(`paulMemory.js`)이 정확히 이
  "정서적 맥락"입니다. 학생의 실제 학습 데이터를 폴이 "기억"하고
  건네는 한마디가 매 홈 화면 방문마다 정서적 프레이밍을 제공합니다.
  진실성 원칙(거짓 기억 금지, 죄책감 언어 금지)이 이미 코드 주석으로
  강제돼 있어 "정서 왜곡" 위험도 이미 설계 단계에서 차단돼 있습니다.
- **강화 포인트**: 지금 폴의 기억은 **일반적 학습 이력**(스트릭,
  교재 완주, 정원 성장)에 반응하지만, **특정 단어의 정서적 순간**
  (예: "여러 번 틀렸다가 드디어 맞힌" 순간)은 `improved-word` 템플릿이
  이미 다룹니다 — 이걸 3.6(스토리텔링)과 결합해 "그 단어를 극복한
  순간"에 학생이 직접 짧은 감상을 남기게 하면(3.6 참고) 정서+생성 효과가
  동시에 걸립니다.
- **주의**: 새 정서 신호를 추가할 때도 기존 원칙(존재하지 않는 데이터를
  기억하는 척 금지)을 반드시 계승해야 합니다 — 이 문서가 제안하는 모든
  신규 템플릿 후보는 실제 `word_review_schedule`/`spellingReviewQueue`
  데이터에서만 파생돼야 합니다.

### 3.6 Storytelling / Elaborative Encoding(정교화 부호화, 키워드법)

**연구**: 스토리텔링(내러티브)에 어휘를 심어 가르치면 어휘 습득에
유의미한 효과가 있다는 연구가 반복됩니다(디지털 스토리텔링, Narrative
기반 개입 등). 더 구체적인 기법인 **키워드법(keyword method)**은
L2 단어와 발음이 비슷한 L1 단어를 연결한 뒤, 둘을 잇는 이미지/문장을
만드는 2단계 정교화 부호화 기법으로, 12~13세 아동 대상 연구에서도
효과가 확인되며 **인출 연습과 결합하면 상승효과**가 있다는 최신 연구
(2019~2024)도 있습니다. 핵심은 "본인이 직접 연상을 만드는 것"이 정교화
효과의 핵심이라는 점 — 교사가 미리 써준 팁보다, 학생이 스스로 만든
연상이 이론적으로 더 강한 흔적을 남깁니다(3.2 생성 효과와 같은 원리).

**Paul Easy Voca 적용**:
- **이미 있음(강조)**: `memoryTip`("암기 꿀팁")이 이미 정교화 부호화
  슬롯입니다. 다만 현재는 관리자가 미리 써넣는 고정 텍스트라, 연구가
  강조하는 "학생이 직접 만든 연상이 더 강하다"는 부분이 비어 있습니다.
- **신규 필요**: 학생이 특정 단어에 자기만의 짧은 연상 메모(텍스트
  또는 이모지 조합)를 남길 수 있는 개인 슬롯(`word_student_notes`
  테이블, 4.3절) — 관리자의 `memoryTip`을 대체하지 않고 **나란히**
  보여줌("선생님 꿀팁" vs "내가 만든 연상"). 키워드법을 문자 그대로
  구현(발음 비슷한 한국어 단어 자동 매칭)하는 것은 언어학적으로
  까다롭고 오분류 위험이 커 이번 설계에서는 **채택하지 않고**, 대신
  "자유 연상 메모"라는 더 단순하고 안전한 형태로 같은 정교화 효과를
  노립니다.
- 이 메모는 **어떤 채점/보상과도 연결하지 않음**(헌법 규칙 12 정신 —
  기록 자체가 목적이지 게임화 대상이 아님. 단, 정원/폴의 기억처럼
  이미 있는 정서 레이어가 "네가 적어둔 그 표현 기억나?" 식으로 후속
  회고에 재사용할 여지는 남겨둠 — 4.5절 시나리오).

### 3.7 Embodied Learning(신체화 학습)

**연구**: 체화된 인지(embodied cognition) 관점에서, 동작(gesture)이나
전신 신체 활동(Total Physical Response, TPR)을 곁들인 어휘 학습이
언어적 설명만 있을 때보다 낫다는 연구가 학령전기~초등 아동 대상으로
반복 확인됩니다. 2020~2021년 연구(Mathias et al.)는 제스처를 곁들인
L2 학습이 장기 파지를 유의미하게 늘린다는 행동 증거를 제시했고, 최신
메타분석(2025~2026, "From Body to Word")도 신체화 어휘 학습의 효과를
종합 확인합니다. TPR은 특히 동사·동작 어휘에 강점이 있습니다.

**Paul Easy Voca 적용**:
- **이미 있음(부분)**: 발음 녹음(`PronounceStep`/`PronStep`)이 이미
  "입으로 소리를 내는" 신체 행위이자 신체화 학습의 가장 기초적 형태
  입니다(단, 손/몸 전체 동작은 아님).
- **신규 필요(저비용, opt-in)**: `words.action_hint`(nullable text)
  컬럼 — 동사·동작성 단어에 한해 관리자가 "이 단어를 몸으로 표현해보면?"
  힌트를 입력(예: jump → "제자리에서 콩콩 뛰어보기"). `PronounceStep`에
  발음 녹음 전/후 이 힌트가 있으면 "폴처럼 몸으로 표현해볼까?"라는
  **선택적** 안내 문구만 노출 — **채점하지 않음**(카메라로 동작을
  인식하는 건 이 프로젝트의 "외부 의존성 최소화"/"무료 대안 우선"
  원칙과 정면 충돌하는 고비용 기능이라 명시적으로 배제). 순수하게
  "해보면 도움이 된다"는 제안형 UI 텍스트일 뿐, 검증·보상 로직 0.
- 모든 단어에 채울 필요 없음 — 명사/추상어에는 자연스럽게 비어있고,
  비어있으면 지금처럼 그냥 발음 단계만 진행(완전한 opt-in, 폴백 안전).

### 3.8 Montessori 원칙

**연구/원칙**: 몬테소리 언어 영역의 핵심은 (1) 구체물에서 추상으로
단계적 이행, (2) 학생 스스로의 속도로 진행(자기주도), (3) 한 번에 한
가지 어려움만 분리해서 다룬다(isolation of difficulty), (4) 오류
정정을 교사가 아니라 교구 자체가 알려준다(control of error).

**Paul Easy Voca 적용(대부분 이미 있음, 재발견 금지)**:
- **이미 있음**: (2) 자기주도 — `students.current_unit_id`로 학생이
  스스로 유닛을 바꿔도 진행도가 절대 리셋 안 됨(v2.1). `dailyRitual.js`의
  적응형 세션 크기도 학생 페이스를 반영. (3) 어려움 분리 —
  `buildSteps()`가 발음/예문/퀴즈/쓰기를 명확히 분리된 단계로 나눔(한
  번에 발음+철자+뜻을 동시에 요구하지 않음). (4) 오류 자기정정 —
  퀴�즈/스펠링 전부 즉시 정오 피드백(교사 개입 없이 학생이 바로 앎).
- **강화 포인트(신규, 소규모)**: (2) 자기주도가 "유닛 선택"에는
  있지만 "오늘 뭘 먼저 복습할지"에는 없음 — memory-engine.md의 "오늘의
  복습 대상" 목록에서, 시스템이 정한 순서 그대로 강제하지 않고 학생이
  간단히 순서를 바꿀 수 있는 여지(예: 카드 형태로 보여주고 원하는 걸
  먼저 탭)를 4.2절 UI에 반영. 이는 신규 로직이 거의 없는 순수 UI
  재량권 확장입니다.

### 3.9 Gamification(게임화) — 이미 성숙, 강화만

**연구**: Duolingo 실증 연구들은 게임화가 동기·지속 사용을 높인다는
결과가 일관되지만(2021~2023), 리뷰 논문들은 "게임화 설계 자체를 연구한
것이지 실제 학습 성과를 측정한 연구는 적다"는 방법론적 한계를 지적합니다
— 즉 게임화는 "더 하게 만드는 힘"은 강하지만 "하는 동안 더 잘 기억하게
만드는 힘"은 그 자체로는 약하고, 다른 학습과학 원리(간격반복·인출연습
등)와 결합될 때만 진짜 학습 효과로 이어진다는 뜻입니다.

**Paul Easy Voca 적용**:
- **신규 게임화 축은 만들지 않음** — House/Rank/Ticket/Season/모자/
  정원/Paul Town이 이미 8개 이상 축으로 충분히 성숙했고, 더 얹으면
  오히려 과잉(헌법 규칙 1 "기존 플로우 위험" 소지)입니다.
- **강화 포인트(핵심, 6절에서 상세)**: 위 연구 한계를 그대로 이 앱의
  강점으로 뒤집을 수 있습니다 — 이미 있는 게임화 시각 자산(특히
  정원 `gardenPlots`)이 지금은 "학습 여부"(구조상 `clearedCount`
  임계값)만 반영하는데, 이걸 memory-engine.md의 Leitner 박스 레벨(=
  실제 기억 정착도)로 바꾸면 "게임화가 진짜 기억과 연결"되는 상태가
  됩니다. 이게 정확히 위 연구가 지적한 약점(게임화가 학습효과와
  분리돼 있음)을 이 프로젝트만의 방식으로 메우는 지점입니다.

## 4. 필수 산출물 6축

### 4.1 학습 순서 재설계

기존(현재, 실측) 순서: 반의 오늘 배정 단어(`daily_assignments`, 없으면
유닛 전체) → `dailyRitual.js`가 총량 밴드에 따라 순차 슬라이스 →
슬라이스 안에서 `buildSteps(mode)` 순서(발음→예문→퀴즈→[쓰기]) 그대로.
신구 단어 구분도, 복습 우선순위도 없음.

**제안하는 새 순서**(memory-engine.md의 Leitner + 3.4 interleaving +
3.2 인출 게이트 통합):

```
1. "오늘의 학습 목록" 구성(클라이언트, App.jsx 진입 시점 계산)
   = 신규 단어(daily_assignments 오늘분, 아직 word_review_schedule
     행이 없는 단어)
   + 복습 대상(word_review_schedule.next_review_date <= 오늘,
     오래 묵은 순 우선 — memory-engine.md 6.3절 그대로)

2. 리스트 순서 재배열(신규 로직, interleaving):
   - 신규 단어와 복습 단어를 번갈아 배치(예: 신규 2개 → 복습 1개 →
     신규 2개 → 복습 1개 …, 정확한 비율은 튜닝 가능한 상수)
   - 단, 한 "단어 세션" 안의 pronounce→example 단계 순서는 절대 안
     바꿈(3.4절 blocked 유지 근거)

3. dailyRitual.js의 세션 크기 밴드는 그대로 유지 — 이 재배열된
   리스트를 "무엇을 몇 개씩 보여줄지"가 아니라 "어떤 순서로 보여줄지"
   만 바꾸는 계층이므로 기존 밴드/적응 로직과 충돌 없음(합성 함수:
   orderForInterleaving(list) 결과를 planSessionSize()가 그대로
   슬라이스).

4. 퀴즈/복습 단계 진입 시(3.2절): 박스 레벨 ≥1인 단어에 한해 보기
   공개 전 "먼저 생각해보기" 게이트 1단계 추가. 박스 0(완전 신규)은
   게이트 없이 즉시 보기 노출(연구 근거: 의미망 없는 신규 단어에는
   인출 연습 효과가 약함, 3.2절).
```

### 4.2 UI

신규/변경이 필요한 화면 요소(전부 opt-in, 데이터 없으면 기존 화면과
동일하게 폴백 — 헌법 규칙 1/9):

- **Dual Coding 슬롯**: `PronounceStep`/`ExampleStep`/
  `MatchGameShell.jsx` 카드에 단어 텍스트 옆 이모지(`image_emoji`) 또는
  이미지(`image_url`) 배지. 둘 다 null이면 지금처럼 텍스트+소리만.
- **인출 게이트**: 퀴즈 진입 시 보기 공개 전 "무슨 뜻일까? 떠올려
  보세요 🤔" 중간 화면 1개(스킵 불가, 하지만 답 입력 강제 없음 — 다음
  버튼만) — 복습 단어(박스≥1)에서만 노출.
- **신체화 힌트**: `action_hint`가 있는 단어의 `PronounceStep`에 "폴처럼
  몸으로 표현해볼까? 🙆" 텍스트 배지(터치 시 힌트 문구 펼침, 검증 없음).
- **내 연상 메모**: `memoryTip`("선생님 꿀팁") 옆에 "내가 만든 연상"
  섹션 — 짧은 텍스트 입력 + 이모지 선택, 비어있으면 "나만의 기억법을
  적어보세요" 빈 상태만.
- **복습 순서 선택권(Montessori)**: "오늘의 복습" 화면에서 시스템이
  정한 순서를 카드 리스트로 보여주되, 학생이 원하는 카드를 먼저 탭해
  순서를 바꿀 수 있게(드래그 아님 — 그냥 탭한 게 다음 카드).
- **정원 재해석(6절 핵심 제안)**: `PaulTown.jsx`/`GrowthAlbum.jsx`의
  정원 화면 자체는 그대로 두고, 내부 계산 함수(`gardenPlots`)의 입력만
  교체(4.3절 API 참고) — 화면 재설계 없음.

### 4.3 DB(설계 스케치 — DDL 실행 금지, 문서 안 코드블록만)

memory-engine.md 7.2절의 `word_review_schedule` 위에 3개를 추가
제안합니다. 실제 파일명/버전 번호는 작업 시점 `DATABASE.md` 최신
마이그레이션 번호 재확인 필요(이 문서 작성 시점 최신 확인된 건
`writing_answer_statistics`=v3.9, 미실행 상태의 `ai_usage_daily`=v3.8
후보 — 그 다음 번호부터).

```sql
-- 설계 스케치 A — words 테이블 확장 (전부 nullable, opt-in)
-- students 컬럼이 아니므로 헌법 규칙 10의 GRANT 의무 대상은 아니지만,
-- words/classes/units는 애초에 저장소에 RLS/GRANT SQL이 없는 3테이블
-- (DATABASE.md "핵심 4테이블" 절)이라 anon 전체 CRUD 관례를 그대로
-- 따르면 되고, 신규 컬럼 추가 시에도 별도 GRANT 불필요(기존 관례).

alter table public.words
  add column if not exists image_emoji text,      -- 1~2글자 이모지, dual coding 저비용 채널
  add column if not exists image_url text,         -- 선택적 이미지 URL, 무료/자체 호스팅만
  add column if not exists action_hint text;       -- 동작성 단어의 신체화 힌트 문구

-- 설계 스케치 B — 학생 개인 연상 메모(정교화 부호화, 3.6절)
create table if not exists public.word_student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  note_text text,
  note_emoji text,
  updated_at timestamptz not null default now(),
  unique (student_id, word_id)
);
create index if not exists idx_word_student_notes_student
  on public.word_student_notes (student_id);
alter table public.word_student_notes enable row level security;
create policy "allow anon all" on public.word_student_notes
  for all using (true) with check (true);
-- RLS 분류 근거: word_status/word_review_schedule과 동일 — 학생 자기
-- 진행 데이터, 보상/랭킹 미연동, 조작 유인 낮음(3.6절 "채점과 연결
-- 안 함" 원칙과 정합).

-- 설계 스케치 C — memory-engine.md word_review_schedule 재사용 확인
-- (이 문서에서 새로 만들지 않음, 그대로 참조)
-- create table if not exists public.word_review_schedule ( ... )
-- memory-engine.md 7.2절 원문 그대로.
```

폴백 원칙(헌법 규칙 9 그대로 계승): `image_emoji`/`image_url`/
`action_hint`/`word_student_notes` 전부 부재 시 해당 UI 슬롯이 조용히
숨겨지고, 나머지 학습 플로우는 100% 기존과 동일하게 동작해야 함 —
`isMissingTableError()`/컬럼 존재 여부 방어 패턴을 그대로 재사용.

### 4.4 API(클라이언트-서버 계약 스케치)

전부 기존 `wordLibrary.js` 패턴(anon key 직접 CRUD)을 따르는 순수 함수
시그니처 스케치입니다 — 신규 `api/*.js` 서버리스 함수는 필요 없습니다
(PIN처럼 서버 검증이 필요한 민감 로직이 아니라, 기존 `word_status`/
`spellingReviewQueue`와 동일한 "학생 자기 진행 데이터" 성격이기
때문 — 3.6절 RLS 분류 근거와 동일 논리). Vercel Hobby 12개 함수 한도
(`ARCHITECTURE.md` 8번 섹션)에도 영향 없음.

```js
// wordLibrary.js에 추가될 함수 시그니처(설계만, 구현 없음)

// 오늘의 학습 목록(신규+복습 interleaved) — 4.1절 순서 로직의 진입점
async function getTodayLearningQueue(studentId, classId) { /* ... */ }

// 인출 게이트 노출 여부 판단(순수 함수, DB 접근 없음)
function shouldGateBeforeReveal(boxLevel) { return (boxLevel ?? 0) >= 1 }

// 학생 개인 연상 메모 조회/저장(word_student_notes)
async function getWordStudentNote(studentId, wordId) { /* ... */ }
async function saveWordStudentNote(studentId, wordId, { noteText, noteEmoji }) { /* ... */ }

// 관리자 분석 — 반별 기억 정착률/어려운 단어 Top N(4.6절)
async function getClassRetentionStats(classId) { /* word_review_schedule 집계 */ }
```

### 4.5 학생 경험 시나리오

> 월요일 아침, 승우(10세)가 앱을 켠다. 홈 화면에 폴이 인사한다 — "지난
> 주말 3일 쉬었네요! 다시 만나서 반가워요"(정서기억, 이미 있는
> `comeback` 템플릿). 오늘의 학습을 누르니 목록이 뜬다 — 신규 단어
> "elephant"(이모지 🐘, 처음 보는 단어라 인출 게이트 없이 바로 뜻+발음
> 학습), 그다음 복습 단어 "jump"(2일 전 배웠던 동작 단어, 박스 레벨
> 2 — "먼저 생각해보기" 화면이 뜬다: "무슨 뜻일까? 떠올려보세요 🤔",
> 승우가 잠깐 생각한 뒤 "다 생각했어요"를 누르면 4지선다가 나타난다).
> "jump" 카드에는 action_hint가 있어 발음 연습 화면에 "폴처럼 몸으로
> 표현해볼까? 🙆"가 살짝 보인다 — 승우는 무시하고 그냥 넘어가도 되고
> (완전 선택), 한번 콩콩 뛰어보고 넘어가도 된다. "elephant" 학습이
> 끝난 뒤 memoryTip("코가 길어서 e-le-phant, 코를 늘여서 발음해봐요")
> 아래 빈 칸이 보인다 — "내가 만든 연상"에 승우가 "코끼리 코 랩처럼
> 길다"라고 직접 적는다(선택, 안 적어도 무방). 세션이 끝나면 오늘도
> 정원에 물이 조금 더 준다 — 단, 이번엔 "공부했다"가 아니라 "jump가
> 박스 3으로 올라갔다"(진짜 기억이 한 단계 더 단단해졌다)가 반영된
> 성장이다.

### 4.6 교사 경험

관리자 화면(`AdminScreen.jsx`)에 신규 탭 또는 기존 `AnalyticsPanel.jsx`
확장으로 아래를 노출(구현은 이번 세션 범위 아님, 설계만):

- **반별 기억 정착률**: `word_review_schedule`에서 박스 레벨 4~5
  비율(= memory-engine.md 6.3절의 "숙달" 임계) / 전체 학습 단어 수.
  반별 막대 그래프 한 장이면 충분(신규 차트 라이브러리 불필요, 기존
  관리자 화면 스타일 재사용).
- **이번 주 어려운 단어 Top N**: `word_review_schedule`에서 최근 7일
  내 박스 레벨이 **내려간**(오답) 이벤트가 많은 단어 순 정렬, 반별
  필터. 교사가 "이 단어들 다음 수업에서 한번 짚어줘야겠다"는 판단을
  하도록 돕는 목적 — 자동 개입(추가 숙제 자동 배정 등)은 하지 않음
  (교사 판단 대체 금지, 학부모 리포트가 "규칙기반 요약"에 머무는
  선례와 같은 절제 원칙).
- **복습 밀린 학생**: `next_review_date`가 오늘보다 많이 지난 채 쌓인
  단어 수가 많은 학생(=최근 결석/미접속으로 복습 사이클이 밀린 아이)을
  별도로 표시 — 기존 "반 미배정" 그룹 표시 관례(`AdminScreen.jsx`)와
  동일한 패턴.
- 전부 **읽기 전용 집계**이며, 학생 개인 연상 메모(`word_student_notes`
  의 `note_text`)는 교사 화면에 노출하지 않음(아이의 사적 연상 텍스트를
  교사가 열람하는 것은 이번 설계 범위에서 의도적으로 제외 — 필요해지면
  별도 프라이버시 논의가 선행되어야 함).

## 5. 원리별 3분류표

| 원리 | 이미 있음 | 강화 포인트 | 신규 필요 |
|---|---|---|---|
| Spaced Repetition | word_status(자기신고)만, 스케줄링은 그린필드(memory-engine.md 확인) | — | `word_review_schedule`(memory-engine.md 기설계, 재조사 안 함) |
| Dual Coding | 소리+텍스트(MatchGameShell) | — | `words.image_emoji`/`image_url`, UI 배지 슬롯 |
| Active Recall/Generation Effect | 쓰기시험 타이핑 채점(이미 생성형) | 퀴즈/매칭게임의 인식형(4지선다) 앞에 "먼저 생각해보기" 게이트 | 게이트 UI 상태 로직(DB 불필요) |
| Interleaving | 없음(순차 슬라이스만) | — | 오늘의 학습 목록 신구 단어 교차 배치 로직 |
| Emotional Memory | 폴의 기억 18종(정서 프레이밍) | 극복 순간과 학생 연상 메모 연결 | — |
| Storytelling/정교화부호화 | memoryTip(교사 작성 고정 텍스트) | — | `word_student_notes`(학생 자기 연상 메모) |
| Embodied Learning | 발음 녹음(음성 신체화) | — | `words.action_hint` + 선택적 UI 배지(채점 없음) |
| Montessori | 자기주도 유닛전환/적응세션/단계분리/즉시피드백(대부분 이미 있음) | 복습 순서 학생 선택권 | — |
| Gamification | House/Rank/Ticket/Season/모자/정원/Paul Town(매우 성숙) | 정원 입력값을 "학습여부"→"기억 박스 레벨"로 교체 | — |

## 6. 우선순위 권고 (ROI)

1. **정원(Garden) 입력값을 Leitner 박스 레벨로 교체**(신규 화면 0,
   기존 `gardenPlots` 계산 함수 입력만 교체) — SRS + 게임화 + 정서기억
   3개 축을 한 번에 잇는 가장 저비용·고효과 변경. `word_review_schedule`
   이 실운영되면 바로 착수 가능.
2. **Interleaving(신구 단어 교차 배치)** — DB 스키마 변경 0, 순수
   클라이언트 로직 함수 하나(`orderForInterleaving`)만 추가하면 되고,
   연구 근거가 가장 일관되게 강한 원리 중 하나(3.4절).
3. **이모지 기반 Dual Coding**(`image_emoji`) — 이미지 URL/CDN 없이
   기존 이모지 시각 언어를 그대로 확장하는 것이라 자산 관리 비용 0.
4. 나머지(인출 게이트, 신체화 힌트, 학생 연상 메모, 복습 순서 선택권,
   교사 정착률 대시보드)는 전부 opt-in·저위험이지만 UI 상호작용
   설계·구현 공수가 상대적으로 크므로 1~3 이후 순차 진행을 권장합니다.

## 7. 출처

- Dual Coding: [Frontiers — Dual Coding or Cognitive Load? (EFL 어휘, 2022)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.834706/full), [ResearchGate — A Dual Coding View of Vocabulary Learning](https://www.researchgate.net/publication/238317055_A_Dual_Coding_View_of_Vocabulary_Learning), [structural-learning.com — Dual Coding: A Teacher's Guide](https://www.structural-learning.com/post/dual-coding-a-teachers-guide)
- Retrieval Practice(아동): [SAGE — Retrieval Practice: Beneficial for All Students? (2021)](https://journals.sagepub.com/doi/10.1177/1475725720973494), [Frontiers — Retrieval practice enhances learning in real primary school settings (2025)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1632206/full), [PMC — Retrieval Practice and Word Learning by Children With DLD](https://pmc.ncbi.nlm.nih.gov/articles/PMC11087082/)
- Generation Effect: [structural-learning.com — The Generation Effect](https://www.structural-learning.com/post/generation-effect-active-learning), [Neurako Learn — The Generation Effect](https://learn.neurako.com/docs/learning-science/generation-effect), [Very Big Brain — The Neuroscience of Recall vs. Recognition](https://verybigbrain.com/psychology-thinking/the-neuroscience-of-recall-vs-recognition/)
- Emotional Memory(L2/아동): [SAGE — The Effects of Post-Encoding Emotion on L2 Vocabulary Learning (2023)](https://journals.sagepub.com/doi/10.1177/21582440231214927), [Cambridge Core — Did you see that? False memories for emotional words in bilingual children](https://www.cambridge.org/core/journals/bilingualism-language-and-cognition/article/did-you-see-that-false-memories-for-emotional-words-in-bilingual-children/44E3353A41E220A158865E02B780A062), [Cambridge Core — Memory for emotional words in the first and second language](https://www.cambridge.org/core/journals/bilingualism-language-and-cognition/article/abs/memory-for-emotional-words-in-the-first-and-the-second-language-effects-of-the-encoding-task/CAA95D603639FF040E6551792BE86EA7)
- Storytelling/Narrative(어휘): [ResearchGate — The Effect of Digital Storytelling on English Vocabulary Learning](https://www.researchgate.net/publication/378487213_The_Effect_of_Digital_Storytelling_on_English_Vocabulary_Learning_in_Inclusive_and_Diverse_Education), [ASHA — Vocabulary Instruction Embedded in Narrative Intervention (2023)](https://pubs.asha.org/doi/10.1044/2023_AJSLP-23-00004), [Taylor & Francis — Evaluating storytelling activities for early literacy development (2021)](https://www.tandfonline.com/doi/full/10.1080/09669760.2021.1933917)
- Keyword Method/정교화부호화: [Springer — Adding the keyword mnemonic to retrieval practice (2019)](https://link.springer.com/article/10.3758/s13421-019-00936-2), [ScienceDirect — The facilitative effect of the keyword mnemonic on L2 vocabulary retrieval practice](https://www.sciencedirect.com/science/article/pii/S240584402401243X), [mempowered.com — Using the keyword method to learn vocabulary](https://www.mempowered.com/mnemonics/language/using-keyword-method-learn-vocabulary)
- Embodied Learning/TPR(아동 L2): [Springer — Preschool Children's Foreign Language Vocabulary Learning by Embodying Words](https://link.springer.com/article/10.1007/s10648-015-9316-4), [Springer — From Body to Word: A Three-Level Meta-Analysis of Embodied Vocabulary Learning](https://link.springer.com/article/10.1007/s10648-026-10194-9), [MDPI — Your Body as a Tool to Learn Second Language Vocabulary](https://www.mdpi.com/2076-328X/15/8/997), [ERIC — The Effect of Total Physical Response Method](https://files.eric.ed.gov/fulltext/EJ1324215.pdf)
- Montessori: [American Montessori Society — 5 Core Components of Montessori Education](https://amshq.org/the-ams-difference/core-components-of-montessori/), [applebeemontessori.com — From Concrete to Abstract](https://www.applebeemontessori.com/from-concrete-to-abstract-the-montessori-approach-to-math-and-science), [xihamontessori.com — A Complete Guide To Montessori Language](https://xihamontessori.com/montessori-language/)
- Gamification/Duolingo(실증): [eltin journal — Gamified Vocabulary Learning with Duolingo](https://e-journal.stkipsiliwangi.ac.id/index.php/eltin/article/view/6268), [ejels.com — Investigating Duolingo's Gamification Effect on EFL Students' Writing Skills](https://www.ejels.com/levelling-up-writing-investigating-duolingos-gamification-effect-on-efl-students-writing-skills), [journal-gehu.com — The Effect of the Duolingo App to Improve Vocabulary Mastery](https://journal-gehu.com/index.php/gehu/article/view/720)
- Interleaving×Spacing(어휘/철자): [Springer — Spacing and Interleaving Effects Require Distinct Theoretical Bases (2021)](https://link.springer.com/article/10.1007/s10648-021-09613-w), [PMC — Spelling acquisition in children through interleaved practice](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12511507/), [effectiviology.com — Interleaving: How Mixed Practice Can Boost Learning](https://effectiviology.com/interleaving/), [ResearchGate — The Effects of Spaced Practice on Second Language Learning: A Meta-Analysis](https://www.researchgate.net/publication/358406370_The_Effects_of_Spaced_Practice_on_Second_Language_Learning_A_Meta-Analysis)

## 8. 이 문서가 다루지 않은 것 / 범위 밖 명시

이 문서는 헌법 규칙 12("학생 대상 신규 기능/UI/게임화는 이번 AI 개발
운영체제 구축 범위에서 절대 금지")의 적용을 받는 순수 조사·설계
문서입니다. 실제 구현(SQL 실행, `wordLibrary.js`/`WordDetail.jsx`/
`QuizGame.jsx`/`MatchGameShell.jsx`/`AdminScreen.jsx` 코드 변경, 학생·
관리자 화면 UI 추가)은 이 세션의 범위가 아니며, 별도의 planner/
implementer 세션이 이 문서와 `memory-engine.md`를 함께 근거로 진행해야
합니다. 특히 4.1절의 interleaving 로직과 4.3절의 신규 컬럼/테이블은
`word_review_schedule`(memory-engine.md)이 먼저 실운영돼야 의미가
있으므로, 착수 순서는 memory-engine.md 실행 → 이 문서 6절 우선순위
순으로 권장합니다. 키워드법의 "발음 유사 자동 매칭" 같은 언어학적으로
정교한 하위 기능은 오분류 위험과 구현 복잡도 대비 효과가 불확실해
의도적으로 설계에서 제외했습니다(3.6절).
