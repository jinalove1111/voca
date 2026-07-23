# 경쟁 제품 분석 (2부) — Lingokids / Reading Eggs / Raz-Kids / Memrise / Tinycards / Anki

_작성: 2026-07-24. 담당: researcher(문서 전용 세션, 소스 코드/SQL 미수정).
**`docs/research/competitor-analysis.md`(1부, 2026-07-23 작성, Duolingo/
Quizlet/Wordwall/Baamboozle/Khan Academy Kids 분석)의 후속 문서입니다.**
1부의 조사 방법론·표기 규칙·문체를 그대로 따르되, 운영자 요청에 맞춰
서비스별 분석 축을 "좋은 UX / 좋은 심리학 / 좋은 보상 시스템 / 좋은 복습
시스템 / 좋은 캐릭터 / 좋은 애니메이션" 6개로 세분화했습니다(1부는 몰입/
리텐션/동기/매일 습관 4축). 마지막 통합 비교표는 1부와 동일한 4축으로
재환산해 10개(원래 요청 표현) 서비스를 한 표에 모읍니다.

## 조사 방법론 및 표기 규칙 (1부와 동일, 재확인)

- WebSearch로 조사한 공식 자료·업계 분석 글·리뷰를 근거로 작성했습니다.
  각 섹션 하단에 출처 URL을 남깁니다.
- **[실측]** = 조사한 출처에 명시적으로 언급된 내용. 이 문서의 출처도
  1부와 마찬가지로 대부분 1차 자료(각 사 공식 발표)가 아니라 2차 분석/
  리뷰 글이므로, 수치는 "해당 매체가 주장/인용한 값"이지 이 조사가 직접
  검증한 값이 아닙니다 — 방향성 참고용으로 취급하세요.
- **[추정]** = 검색 결과에 직접 언급되지 않았지만 여러 자료의 정황상
  합리적으로 추론한 내용, 또는 Paul Easy Voca 코드베이스 문서
  (`ROADMAP.md`/`PROJECT_GUIDE.md`)를 근거로 이 조사자가 판단한 비교
  지점.
- **필수 규칙(운영자 명시)**: 각 서비스 분석 끝에 "Paul Easy Voca에 그대로
  베끼면 안 되는 이유"와 "Paul Easy Voca 방식으로 재해석하면 어떤 모습일지"를
  반드시 구분해서 적었습니다. 이는 **절대 그대로 복사하지 말고 재설계**
  하라는 운영자 지시를 지키기 위한 장치입니다.
- 이 문서도 1부와 동일하게 **연구 문서**입니다. `CLAUDE.md` 규칙 12(학생
  대상 신규 기능/게임화는 이번 AI 개발 운영체제 구축 범위에서 절대 금지)에
  따라, "재해석" 항목은 구현 지시가 아니라 향후 별도 의사결정 세션을 위한
  조사 결과일 뿐입니다.
- **서비스 개수 메모**: 운영자 지시문은 "5개 서비스"라 표현했지만 실제
  나열된 이름은 Lingokids/Reading Eggs/Raz-Kids/Memrise/Tinycards/Anki
  6개입니다. Tinycards와 Anki 둘 다 별도의 "특별 지시"(각각 실패 원인
  분석, UX/커뮤니티 분석)가 명시돼 있어 둘 중 하나를 임의로 생략하지
  않고 **6개 전부** 분석했습니다. 그 결과 마지막 통합 비교표는 1부 5개 +
  2부 6개 = **11개 서비스**입니다(운영자가 말한 "10개"보다 1개 많음 —
  누락 없이 반영하기 위한 의도적 선택이며, 표 상단에 다시 명시합니다).
- **Anki 특별 처리**: `docs/research/memory-engine.md`가 이미 Anki의
  SM-2 변형 알고리즘을 깊이 다뤘으므로, 이 문서에서는 알고리즘을 다시
  설명하지 않고 **UX/커뮤니티/캐릭터 부재가 왜 아동에게 부적합한가**에만
  집중했습니다(운영자 명시 지시).

---

## 1. Lingokids — 라이선스 IP 캐릭터 총동원 + Playlearning 방법론

### 좋은 UX
자체 캐릭터(Cowy, Elliot, Billy)에 더해 Mickey and Friends, Moana,
Frozen, Blippi, Pocoyo, Toy Story(Woody/Buzz) 등 **글로벌 라이선스
IP를 대거 결합**한 멀티-IP 플랫폼입니다[실측]. 아동 친화적 내비게이션 +
오디오북 + 인터랙티브 비디오 레슨이 핵심 UX 축입니다.

### 좋은 심리학
자체 명명한 "Playlearning™" 방법론이 구성주의(constructivism, 능동적
상호작용을 통한 학습) + 사회문화이론(socio-cultural theory, 협력·맥락
학습) + 게임화 원칙을 결합했다고 설명합니다[실측, 회사 자체 자료 — 방법론
명칭 자체가 마케팅 용어라는 점 감안]. 커리큘럼은 핀란드/싱가포르/미국/
영국 등 여러 국가 커리큘럼의 요소를 조합해 설계했다고 주장합니다.
자체 효능 연구는 앱으로 어휘를 배운 그룹이 전통 수업 그룹보다 36.6% 더
동기부여됐다고 보고하나[실측, 회사 자체 발표 2차 출처 — 독립 검증
불가, 신뢰도 낮음으로 취급], 제3자 리뷰는 "수동적 비디오 시청 비중이
실제 기술 습득을 희석시킨다"는 비판적 시각도 냅니다[실측, 2차 출처].

### 좋은 보상 시스템
별/배지 획득과 레벨 진행이 확인되나[실측], 코인 경제(Lingokids
coins)의 구체적 작동 방식은 이번 조사에서 신뢰도 있는 자료를 확보하지
못했습니다[정보 부족 — 확인 안 됨으로 표기].

### 좋은 복습 시스템
Duolingo/Quizlet/Memrise처럼 "간격 반복"을 공식적으로 표방하는 자료를
찾지 못했습니다 — 세션/게임 단위 반복 학습에 가깝고, 명시적 복습 스케줄링
엔진은 확인되지 않았습니다[추정 — 부재 자체를 직접 증명하는 자료보다는
"관련 언급이 전혀 없다"는 정황 근거].

### 좋은 캐릭터
6개 서비스 중 캐릭터 자산이 가장 화려합니다 — 자체 IP + Disney/Pixar급
라이선스 IP를 동시에 운용하는 유일한 사례입니다[실측].

### 좋은 애니메이션
인터랙티브 비디오 레슨과 애니메이션 캐릭터가 핵심 콘텐츠 포맷입니다.
다만 "수동적 비디오 소비"가 학습 효과를 희석시킨다는 비판이 함께
존재합니다[실측, 2차 출처].

### Paul Easy Voca에 그대로 베끼면 안 되는 이유
Disney/Pixar급 라이선스 IP는 막대한 라이선싱 비용이 드는 대기업 전용
전략이라 소규모 공부방 앱이 재현할 수 없습니다. 또한 "수동적 비디오
시청이 학습을 희석시킨다"는 비판은 Paul Easy Voca가 이미 경계하는
"에듀테인먼트로의 표류" 리스크와 정확히 겹칩니다 — 캐릭터 화려함을
학습 효과와 혼동하면 안 된다는 반면교사입니다.

### Paul Easy Voca 방식으로 재해석하면
Paul Easy Voca는 이미 자체 캐릭터 "폴"과 애착 시스템(모자 컬렉션/단어
박물관/성장 앨범/폴의 기억/잉글리시 정원)을 갖췄습니다. 외부 라이선스
IP를 좇기보다, 이미 있는 "폴" 서사를 더 깊게 파는 방향(라이선스 IP 없이도
가능한 유일한 길)이 Lingokids식 멀티-IP 전략보다 이 프로젝트 규모에
현실적으로 맞습니다 — 이는 구현 지시가 아니라 방향성 관찰입니다.

**출처**: [Lingokids Review 2026 (research.com)](https://research.com/software/reviews/lingokids-review), [Lingokids Review: Does Not Meet Learning Standard (thelearningstandard.org)](https://thelearningstandard.org/apps/lingokids), [Lingokids Methodology and Curriculum (공식 헬프센터)](https://help.lingokids.com/hc/en-us/articles/208259345-Lingokids-Methodology-and-Curriculum), [Efficacy Study Backs Lingokids' Playlearning™ Methodology (공식 블로그)](https://lingokids.com/blog/posts/efficacy-study-backs-lingokids-playlearning-methodology), [Lingokids Learning Methodology (공식 블로그)](https://lingokids.com/blog/posts/lingokids-learning-methodology)

---

## 2. Reading Eggs — 골든 에그 저축 경제 + 5대 읽기 기둥 연구 기반

### 좋은 UX
과제/레슨 완료 시 골든 에그(Golden Egg) 보상 애니메이션, 배치고사
(placement test) 기반 개인화 시작점, 아바타(바이킹 땋은머리 소녀,
문어팔 도토리 캐릭터 등) 커스터마이징, "Reading Eggs 집" 꾸미기가
핵심 UX 루프입니다[실측].

### 좋은 심리학
공식적으로 읽기의 5대 기둥(phonics/음소인식/어휘/유창성/독해)에 근거한
설계를 표방하며, 레슨 구조·활동 유형·보상 요소까지 자체 연구 근거
(Reading Eggs Scientific Research Base)에 포함시켰다고 주장합니다[실측,
회사 자체 자료]. 적응형 학습 경로가 성취도에 따라 콘텐츠를 건너뛰거나
반복시켜 "압도되지 않으면서 꾸준히 진전"하도록 설계됐다는 설명은 자기
효능감/몰입(flow) 이론과 부합합니다.

### 좋은 보상 시스템
골든 에그 → 개인 "Eggy Bank"에 저축 → 게임/아바타 옷/집 꾸미기에 소비하는
**저축-소비 2단계 경제**가 특징입니다[실측]. 레슨 완료마다 수집형
"critter"(작은 동물 캐릭터)를 얻는 컬렉션 메커닉도 있어 Khan Academy
Kids식 수집형 동기와 유사한 축을 함께 운용합니다.

### 좋은 복습 시스템
명시적 간격 반복(SRS)이 아니라, 배치고사+성취도 기반의 **적응형 진도
분기(mastery-based branching)** 입니다 — 못한 부분은 반복, 잘하는
부분은 건너뛰는 방식으로, Quizlet Learn 모드와 유사하게 "복습처럼
작동하지만 공개된 엄밀한 알고리즘은 아닌" 카테고리입니다[실측/추정
혼합 — 정확한 반복 스케줄링 로직은 비공개].

### 좋은 캐릭터
커스터마이징 가능한 개인 아바타 + critter 컬렉션이 캐릭터 자산의
핵심입니다. Lingokids처럼 라이선스 IP는 아니고 자체 오리지널 캐릭터로
구성됩니다.

### 좋은 애니메이션
애니메이션 캐릭터·퀴즈·노래가 결합된 "게임화된 온라인 학습"으로
묘사됩니다[실측]. 다만 비평은 과도한 게임화가 읽기 훈련을 "에듀테인먼트"로
바꿔, 아이가 문해력이 아니라 에그 수집 자체에 몰두하게 만든다고
지적합니다[실측, 2차 출처 비판적 시각].

### Paul Easy Voca에 그대로 베끼면 안 되는 이유
"저축 후 아바타 옷/집 꾸미기에 소비"하는 가상 화폐-상점 경제는
`ROADMAP.md`가 이미 명시한 Paul Easy Voca의 원칙("무작위·뽑기·화폐·결제·
스트릭징벌 없음")과 정면으로 충돌합니다 — Ticket 시스템은 이미 "결정론적
교환"으로 화폐/뽑기 요소를 배제했는데, Reading Eggs식 코스메틱 상점을
그대로 들여오면 이 원칙을 되돌리는 셈입니다. 또한 "에그 수집에 몰두해
정작 읽기 자체를 소홀히 한다"는 비판은 게임화가 본질(학습)을 잠식하는
전형적 실패 패턴으로, Raz-Kids 섹션(아래)에서도 동일하게 반복됩니다.

### Paul Easy Voca 방식으로 재해석하면
Ticket 경제(적립-환급 원장)가 이미 "저축→교환"의 지연 만족 구조를
코스메틱 상점 확장 없이 구현하고 있습니다. Reading Eggs에서 진짜
transferable한 아이디어는 상점 자체가 아니라 **배치고사 기반 개인화
시작점**입니다 — Reading Foundation(v3.3, 스키마·API·관리자 편집기
완료, 학생 UI는 의도적 미구현)이 향후 학생 UI를 만들 때, "학생 수준에
맞는 지문부터 시작"하는 설계 근거로 참고할 수 있는 조사 결과입니다
(구현 지시 아님).

**출처**: [Reading Eggs Reviews (brighterly.com)](https://brighterly.com/blog/reading-eggs-review/), [3. Rewards systems (공식 지식베이스)](https://kb.readingeggs.com/3-rewards-systems), [The Science Behind Reading Eggs (공식)](https://readingeggs.com/articles/science-behind-reading-eggs/), [Reading Eggs Review | Detailed Breakdown For Parents (testprepinsight.com)](https://testprepinsight.com/kids-education/reviews/reading-eggs/)

---

## 3. Raz-Kids / Raz Plus — ZPD(근접발달영역) 기반 레벨링 리딩의 교과서

### 좋은 UX
학생마다 읽기 레벨(A-Z 단계)이 배정되고, 그 레벨에 맞는 책만 보이는
구조입니다. 완독/퀴즈 통과마다 별을 얻어 "Raz Rocket"(우주선) 방을
외계인/가구/장비로 꾸미는 아바타-룸 커스터마이징이 보상 UX입니다[실측].

### 좋은 심리학
6개 서비스 중 **가장 학술적으로 근거가 탄탄한 심리학 기반**입니다 —
Fountas & Pinnell류의 레벨 텍스트 그라디언트(교사가 러닝 레코드로 학생의
정확한 지도 수준을 측정)와 비고츠키의 근접발달영역(ZPD, "너무 쉽지도
너무 어렵지도 않은 도전"이 학습을 촉진한다는 이론)이 설계 근거입니다
[실측 — 다만 Raz-Kids 자체 문서가 아니라 F&P/ZPD 일반 교육학 자료
기준이며, Raz-Kids가 정확히 이 프레임워크를 표방한다는 1차 확인은
아님, 업계에서 통상 F&P 계열로 분류됨].

### 좋은 보상 시스템
별 적립 → Raz Rocket 방 꾸미기(가구/외계인 구매) 가상 경제, 마일스톤
배지, 대시보드의 "My Stats"에서 배지까지 남은 진행도를 시각화합니다
[실측].

### 좋은 복습 시스템
간격 반복이 아니라 **레벨 사다리(leveled ladder) + 반복 읽기**
모델입니다 — 같은 책을 여러 번 다른 목적(첫 읽기/유창성 읽기/퀴즈용
읽기)으로 재방문시켜 숙련도를 올리는 방식으로 보입니다[추정 — 검색
자료에 "반복 읽기" 관행이 리딩 교육 일반론으로 언급되나 Raz-Kids 자체의
공식 설명으로 명시 확인은 부족].

### 좋은 캐릭터
뚜렷한 단일 마스코트 캐릭터는 없습니다 — "로켓"과 외계인들은 보상
경제의 시각적 그릇이지 서사형 캐릭터는 아닙니다[추정].

### 좋은 애니메이션
캐릭터 중심 애니메이션 투자는 약한 편으로 보이며, 오히려 교사 리뷰는
"학생이 실제로 읽기보다 별을 벌기 위해 그냥 클릭하며 진행한다"는
불만을 반복적으로 제기합니다[실측, 교사 리뷰 다수] — 이 때문에 교사가
Raz Rocket/아바타 빌더 접근을 통제하는 기능이 따로 존재합니다.

### Paul Easy Voca에 그대로 베끼면 안 되는 이유
"별을 벌기 위해 실제 읽기 대신 클릭만 한다"는 교사 불만은 게임화가
과하면 본질(읽기/학습)을 밀어낸다는 것을 실제 교실에서 반복 관찰된
증거로 보여줍니다 — Reading Eggs와 동일한 실패 패턴이 서로 다른 회사에서
독립적으로 재현됐다는 점에서 신뢰도가 높은 경고입니다. 또한 F&P류
레벨링 시스템 자체는 라이선스된 상용 프레임워크라 정확히 복제할 수
없고 법적으로도 바람직하지 않습니다.

### Paul Easy Voca 방식으로 재해석하면
Raz-Kids가 검증하는 것은 특정 UI가 아니라 **ZPD 원칙 자체**(학생 최근
성취도에 맞춰 과제 난이도를 자동 조정)입니다 — 이는 3분 데일리
리추얼의 "배정 총량 밴드 + 직전 세션 정답률/페이스로 밴드 내 조정"
설계가 이미 채택한 방향과 본질적으로 같은 패턴입니다. 즉 Raz-Kids
조사는 새 아이디어를 주기보다, **이미 구현된 Daily Ritual의 적응형
설계가 검증된 교육학 원칙과 같은 방향임을 외부에서 재확인**해주는
역할을 합니다. Reading Foundation 학생 UI를 언젠가 만든다면, "완독
보상 상점" 대신 이 ZPD 원칙만 가져오는 편이 안전합니다.

**출처**: [Raz-Plus Review (thelearningstandard.org)](https://thelearningstandard.org/apps/raz-plus), [Student Incentives & Awards (공식)](https://www.raz-plus.com/technology/student-incentive-awards/), [Increase Student Engagement & Motivation With Raz-Plus (공식 블로그)](https://www.learninga-z.com/site/resources/breakroom-blog/increase-student-engagement-with-raz-plus), [Community Review of Raz-Kids (Common Sense Education)](https://www.commonsense.org/education/reviews/raz-kids/teacher-reviews/3951606), [Fountas and Pinnell (structural-learning.com)](https://www.structural-learning.com/post/fountas-and-pinnell), [F&P Text Level Gradient (공식)](https://www.fountasandpinnell.com/textlevelgradient/)

---

## 4. Memrise — Mems(연상 이미지) + 원어민 비디오 + 손실 회피 스트릭

### 좋은 UX
"Mems"라 부르는 개인화 연상 카드(이미지+텍스트, 기억에 남도록 우스꽝
스럽거나 독특하게 구성)와 "Learn with Locals"라는 원어민 실사 비디오
클립이 결합된 학습 화면이 핵심 UX입니다[실측].

### 좋은 심리학
이중 부호화(dual-coding, 이미지+언어 동시 인코딩) 기반 연상 기억법과
간격 반복을 공식적으로 표방합니다 — "잊어버리기 직전 순간에 복습을
배치한다"는 설명이 마케팅 핵심입니다[실측, 2차 출처 — 정확한 알고리즘은
Quizlet과 마찬가지로 비공개].

### 좋은 보상 시스템
포인트/레벨/스트릭/배지/업적(코스 완료, 특정 레벨 도달, 장기 스트릭,
특정 단어 수 학습)과 **글로벌/친구 리더보드**가 결합돼 있습니다[실측,
2025년 게임화 사례 연구 기준].

### 좋은 복습 시스템
6개 서비스 중 Anki 다음으로 SRS를 명시적으로 내세우는 서비스입니다 —
다만 Anki처럼 알고리즘을 사용자에게 노출하지 않고, "학습한 단어들이
정원에서 자라난다"는 서사적 은유(Garden)로 진행 상황을 시각화해
복잡한 스케줄링 로직을 사용자에게 감춥니다[실측].

### 좋은 캐릭터
Duolingo 부엉이 같은 단일 마스코트는 없습니다 — 정원(garden) 메타포가
캐릭터라기보다 시스템적 서사 프레임에 가깝습니다[추정].

### 좋은 애니메이션
카툰 애니메이션이 아니라 **실제 원어민이 등장하는 비디오**가 이
서비스의 독자적 미디어 투자 지점입니다 — 발음/억양/실사용 맥락을
카툰이 줄 수 없는 방식으로 전달합니다[실측].

### 부가 조사: 2021년 커뮤니티 코스 축소
Memrise는 원래 사용자 제작 크라우드소싱 코스가 중심이었으나, 품질
편차가 크고 Memrise 고유의 비디오 콘텐츠와 연동되지 않는다는 이유로
공식 코스 중심으로 전환하며 앱 내 커뮤니티 코스 검색을 제거했습니다
[실측, 공식 지원 문서 기준 — 다만 이 조사에서 당시 사용자 반발/논쟁의
구체적 규모는 확인하지 못함]. Wordwall/Quizlet의 UGC 중심 모델과
정반대 방향 선택을 한 사례로, "큐레이션 vs 사용자생성콘텐츠" 트레이드
오프를 보여줍니다.

### Paul Easy Voca에 그대로 베끼면 안 되는 이유
스트릭 기반 손실 회피와 글로벌/친구 리더보드는 이미 Paul Easy Voca가
의도적으로 배제한 두 가지 메커니즘과 정확히 겹칩니다 — `student_progress`의
스트릭 필드는 있지만 "명시적으로 스트릭징벌 없음" 원칙이 확립돼 있고
(1부 문서 근거), 개인 대 개인 소셜 그래프 경쟁도 PIN 로그인 구조상
설계상 부재합니다(안전 설계로 추정). Memrise를 표면적으로 베끼면 이미
내린 두 결정을 되돌리는 셈입니다.

### Paul Easy Voca 방식으로 재해석하면
스트릭/리더보드가 아니라 **Mems 개념(단어당 개인화 연상 이미지)**과
**원어민 비디오**가 진짜 차별화 지점입니다. Paul Easy Voca는 이미
"폴의 기억"이라는 실데이터 기반 서사 레이어를 갖고 있어, 향후(별도
의사결정 세션에서) 단어별로 학생이 만든 연상 이미지를 이 레이어에
연결하는 방향을 고려해볼 수 있다는 정도의 관찰입니다 — 이번 세션
범위에서 제안·설계하는 것은 아닙니다(규칙 12).

**출처**: [Memrise Review 2026 (braintrailtips.com)](https://www.braintrailtips.com/reviews/memrise-review-making-vocabulary-stick-with-science-backed-methods), [Memrise: A Language Learning App Built on Mnemonics (CRM.org)](https://crm.org/news/memrise-a-language-learning-app-built-on-mnemonics), [How Memrise Leverages Gamification to Boost Retention (Trophy, 2025)](https://trophy.so/blog/memrise-gamification-case-study), [Why can I no longer get to my community courses in the app? (공식 지원)](https://memrise.zendesk.com/hc/en-us/articles/20218164673681-Why-can-I-no-longer-get-to-my-community-courses-in-the-app), [Memrise (Wikipedia)](https://en.wikipedia.org/wiki/Memrise)

---

## 5. Tinycards (2016~2020, 서비스 종료) — 왜 실패/종료했는가

Duolingo가 만든 플래시카드 앱으로, iOS(2016)→웹(2017)→Android 순으로
확장했다가 **2020년 9월 1일 서비스를 종료**했습니다[실측].

### 좋은 UX (생전 평가)
심플하고 "아름답다"는 평가를 받은 카툰풍 카드 디자인, 직관적 인터페이스,
사용자 제작 덱+퀴즈 기능이 리뷰에서 긍정적으로 언급됩니다[실측, 생전
리뷰 기준].

### 좋은 심리학 / 보상 / 복습 시스템 (생전 평가 — 상대적으로 얕음)
Duolingo/Quizlet/Memrise와 달리 명시적인 간격 반복(SRS) 마케팅 문구를
이번 조사에서 찾지 못했습니다 — 단순 플래시카드+퀴즈에 가까웠던 것으로
보입니다[추정 — SRS 언급 부재라는 정황 근거]. 배지/보상 체계도
Duolingo 본체만큼 두텁지 않았던 것으로 보이며[추정], 지속 마스코트
캐릭터도 확인되지 않았습니다.

### 왜 실패/종료했는가
- **공식 사유**: Duolingo는 부속 앱보다 핵심 Duolingo 앱에 자원을
  집중하기 위해 Tinycards를 종료한다고 밝혔습니다[실측, 회사 발표/
  테크 매체 보도 기준 — Duolingo가 "실패"라는 표현을 직접 쓴 것은
  아니고 "전략적 자원 재배치"로 프레이밍했습니다].
- **경쟁 열위 추정**: 독립 리뷰들은 Tinycards가 Memrise가 가진
  연상기억법(mnemonic aid) 기능이나 폭넓은 학습 목표 관리 기능이
  부족했다고 지적합니다[실측, 2차 출처]. 결정적으로, Tinycards가
  진입한 카테고리(범용 사용자 제작 플래시카드)에는 이미 **Quizlet이라는
  압도적 선두주자**가 있었고, Quizlet은 이미 거대한 UGC 콘텐츠 축적 +
  교사/교실 채택(Quizlet Live) + 여러 학습 모드 전환이라는 차별화를
  갖추고 있었습니다(1부 문서 2장) — Tinycards는 이 시장에 뒤늦게
  진입해 뚜렷한 차별화 지점 없이 경쟁한 것으로 보입니다[추정 — Duolingo가
  "Quizlet에 밀려서"라고 명시한 자료는 찾지 못했으며, 기능 비교 정황상
  추론].

### Paul Easy Voca가 반면교사로 삼을 점 (운영자 명시 지시 — 별도 정리)
1. **이미 압도적 승자가 있는 범용 카테고리에 콘텐츠 생태계 없이
   진입하지 않는다.** Tinycards는 Quizlet이 이미 장악한 "범용 사용자
   제작 플래시카드 공유" 시장에 뒤늦게 들어가 차별화에 실패했습니다.
   Paul Easy Voca는 다행히 범용 플래시카드 플랫폼이 아니라 자체
   반/교재/유닛 커리큘럼을 갖춘 폐쇄형 학습앱이라 이 함정과 원천적으로
   무관하지만, **향후 어떤 신기능이든 "이미 더 잘하는 범용 도구가 있는
   기능"을 굳이 재발명하지 않는다**는 원칙의 근거로 삼을 수 있습니다.
2. **모기업/코어 제품과 통합되지 않은 부속 기능은 우선순위 변화에
   가장 먼저 잘린다.** Duolingo가 코어 앱에 집중하기 위해 부속 앱을
   접었다는 사실은, 본 제품과 명확히 통합되지 않은 실험적 기능/앱이
   구조적으로 더 취약함을 보여줍니다 — `CLAUDE.md` 규칙 12("학생 대상
   신규 기능/게임화는 이번 AI 개발 운영체제 구축 범위에서 절대 금지")가
   이미 이런 자원 분산을 막고 있다는 점에서, Tinycards 사례는 이 규칙의
   타당성을 사후적으로 뒷받침하는 외부 증거로 볼 수 있습니다.
3. **Phase 5 로드맵 "절대 추가하면 안 되는 기능" 근거**: 학생이 자기
   카드/단어 세트를 만들어 다른 학생과 공유하는 **범용 UGC 콘텐츠 공유
   기능**은 이 사례가 가장 강한 반대 근거입니다 — (a) 이미 Quizlet
   같은 압도적 강자가 있는 카테고리이고, (b) Paul Easy Voca의 폐쇄형/
   교사(원장) 주도 커리큘럼 철학과 맞지 않으며, (c) 학생 간 콘텐츠 공유는
   안전/운영(부적절한 콘텐츠 검수 등) 부담이 큽니다.

### Paul Easy Voca에 그대로 베끼면 안 되는 이유 / 재해석
위 "반면교사" 항목이 이 두 질문에 대한 답을 겸합니다 — 베낄 대상이라기
보다는 "하지 않을 이유"의 실증 사례입니다.

**출처**: [Moving from TinyCards to FLIP](https://www.flip.training/moving-from-tinycards-to-flip/), [TinyCards Duolingo Discontinued Overview (ICTmenu)](https://ictmenu.com/tinycards-duolingo-discontinued/), [Method Review — The Short-lived Tinycards (2016–2020) (The Language Closet)](https://thelanguagecloset.com/2020/10/17/%F0%9F%91%8F%F0%9F%8F%BB-method-%F0%9F%91%8F%F0%9F%8F%BB-review-the-short-lived-tinycards-2016-2020/), [App of the week: Tinycards review (Stuff)](https://www.stuff.tv/review/app-of-the-week-tinycards-review/), [Tinycards - Fun Flashcards - App Review (Common Sense Media)](https://www.commonsensemedia.org/app-reviews/tinycards-fun-flashcards)

---

## 6. Anki — 알고리즘은 최강, UX/캐릭터/커뮤니티는 아동 부적합

_이 섹션은 알고리즘(SM-2 변형)을 다시 설명하지 않습니다. 알고리즘
상세는 `docs/research/memory-engine.md` 2장을 참고하세요. 여기서는
운영자 지시대로 **UX/커뮤니티/캐릭터 부재가 왜 아동에게 진입장벽이
되는가**만 다룹니다._

### 좋은 UX — 정확히는 "왜 안 좋은가"가 이 섹션의 핵심
리뷰들은 일관되게 Anki를 "기능적이지만 직관적이지 않은 UI", "다소
오래된 느낌의 인터페이스"라고 묘사합니다[실측, 2차 출처 다수]. 학습
곡선이 가파른 이유는 덱 설정과 애드온 설치를 스스로 이해해야 하기
때문이며, 앱 내장 온보딩보다 커뮤니티 튜토리얼/포럼 의존도가 훨씬
높습니다[실측]. 덱을 직접 만들려면 상당한 시간 투자가 필요한 완전
수동 프로세스입니다[실측].

### 좋은 심리학 (설계 철학 자체는 참고할 가치 있음)
Anki의 심리학적 기반은 알고리즘(간격 반복)에 있지만, UX 철학 차원에서
주목할 점은 "성인 자기규율 학습자"를 유일한 타깃으로 가정한다는
것입니다 — 사용자가 스스로 리뷰 큐를 관리하고 설정을 튜닝할 수 있다는
전제를 UI 전체가 깔고 있습니다. 이는 메타인지 부담을 전적으로
사용자에게 위임하는 설계입니다[추정 — UI 관찰 기반 해석].

### 좋은 보상 시스템 — 사실상 없음
외재적 보상(포인트/배지/스트릭 축하 연출) 체계가 사실상 없습니다 —
진행 통계 그래프는 있지만 게임화 장치로 설계된 것이 아닙니다[추정,
검색 자료에서 보상 시스템 관련 언급 자체가 없다는 정황 근거]. 이는
의도적 미니멀리즘으로 보이며, Duolingo류의 도파민 설계와 정반대
극단입니다.

### 좋은 복습 시스템
(알고리즘 상세는 `memory-engine.md` 참고). UX 관점에서만 언급하면,
"오늘의 리뷰 큐가 몇 개인지 그대로 숫자로 노출"하는 방식이 성인
파워유저에게는 투명성으로 받아들여지지만, 저연령 학습자에게는 "그날의
리뷰를 다 앉아서 처리하기 힘들어한다"는 관찰로 이어집니다[실측, 2차
출처].

### 좋은 캐릭터 / 좋은 애니메이션 — 둘 다 존재하지 않음
마스코트, 서사, 애니메이션이 전혀 없는 텍스트 우선(text-first) 도구
입니다[실측/추정 혼합 — 명시적으로 "없다"는 서술은 드물지만, 어떤
자료도 캐릭터/애니메이션을 언급하지 않는다는 점이 강한 정황]. 이는
1부의 Baamboozle(리텐션 축의 극단적 대조군)처럼, 이 문서에서
"캐릭터/보상 축의 극단적 대조군" 역할을 합니다 — Anki는 복습 알고리즘
축에서는 최강이지만 캐릭터/애니메이션/보상 축에서는 최약체입니다.

### 커뮤니티 (운영자 명시 조사 항목)
AnkiWeb Shared Decks 공식 플랫폼과 별개로 방대한 포럼/애드온 생태계가
존재하며, 의대생 커뮤니티가 함께 유지보수하는 대형 덱(AnKing 등)처럼
**도메인 전문가 파워유저 커뮤니티**가 실질적 콘텐츠 엔진 역할을
합니다[실측]. 이는 Anki의 진짜 강점이 제품 자체의 UX가 아니라
커뮤니티 생태계에 있다는 뜻이며, 동시에 그 커뮤니티가 성인 자기주도
학습자 중심이라 아동 대상 폐쇄형 커리큘럼 앱과는 구조적으로 맞지
않는다는 것을 보여줍니다.

### Paul Easy Voca에 그대로 베끼면 안 되는 이유
Paul Easy Voca는 이미 Anki와 정반대 방향(캐릭터/애니메이션/결정론적
보상을 갖춘 아동 친화 설계)으로 성숙해 있어 "베낄 위험" 자체가 낮은
사례입니다. 다만 향후 어떤 이유로든 "고급 설정/리뷰 큐 노출/애드온형
커스터마이징"처럼 메타인지 부담을 학생에게 전가하는 방향의 기능이
제안된다면, 이 섹션이 왜 안 되는지의 근거가 됩니다.

### Paul Easy Voca 방식으로 재해석하면
Anki의 진짜 교훈은 "베낄 기능"이 아니라 **"베끼지 않아도 되는 이유의
확인"**입니다 — 초등학생 대상 앱에서 복습 스케줄링을 사용자에게
노출하지 않고 시스템이 알아서 처리하는 현재 설계(`useStudent.js` 중앙
진행도 관리, Daily Ritual 자동 배정)가 Anki식 "리뷰 큐를 사용자가 직접
관리" 모델보다 아동에게 근본적으로 더 적합한 방향임을, 이 조사가 외부
근거로 재확인해줍니다. 이는 새 기능 제안이 아니라 기존 설계 철학에
대한 조사 기반 확인입니다.

**출처**: [9 Best Anki Alternatives to Try in 2026 (RemNote)](https://www.remnote.com/blog/best-anki-alternatives), [Does Anki work (and is it worth the hype)? (Brainscape Academy)](https://www.brainscape.com/academy/does-anki-work/), [Anki Reviews 2026 (G2)](https://www.g2.com/products/anki/reviews), [Shared Decks - Anki Forums](https://forums.ankiweb.net/c/shared-decks/14), [Contributing - Anki Manual (공식)](https://docs.ankiweb.net/contrib.html), [awesome-anki (GitHub)](https://github.com/tianshanghong/awesome-anki)

---

## 7. 10(11)개 서비스 통합 비교표

_1부의 4축(몰입/리텐션/동기/매일 습관) 형식을 그대로 유지합니다. 위쪽
5개 행은 1부 "6. 축별 비교 요약" 표 내용을 그대로 재인용한 것이고,
아래쪽 6개 행이 이번 2부 신규 분석입니다. 운영자가 요청한 표현은
"10개"였지만, 서비스명 6개(Tinycards/Anki 포함)를 전부 분석한 결과
5+6=11개가 됐습니다(위 방법론 섹션 참고)._

| 축 | Duolingo | Quizlet | Wordwall | Baamboozle | Khan Academy Kids |
|---|---|---|---|---|---|
| 몰입 | 가변 보상(XP 랜덤) + 승산 있게 스코프된 리그 | 학습모드 전환으로 단조로움 회피 | 콘텐츠 고정+형식 40종 전환 | 기기 불필요 즉흥 팀전 | 캐릭터 동반 수집 서사 |
| 리텐션 | 손실 회피(스트릭) + 위젯/알림 | 간격 반복(공식 주장, 알고리즘 비공개) | 숙제 배정+완료 추적(교사 주도) | 구조적으로 없음(계정 자체 없음) | 적응형 난이도(좌절 방지) |
| 동기 | 개인 지위(리그 순위) + 소셜(친구 대결) | 팀전 실시간 경쟁 | 배지/포인트(세션 단위) | 팀 소속감 + 즉흥 경쟁 | 내재적(수집) — 경쟁 요소 없음 |
| 매일 습관 | Hook 모델 완결(트리거→보상→투자) | 학습자 자기설계 의존, 강제 루프 약함 | 교사가 트리거(학생 자발 아님) | 습관 개념 자체 없음(1회성 이벤트) | 부모 매개 루틴 |

| 축 | Lingokids | Reading Eggs | Raz-Kids/Raz Plus | Memrise | Tinycards(종료) | Anki |
|---|---|---|---|---|---|---|
| 몰입 | 라이선스 IP 총동원+비디오 다양성 | 골든에그+아바타 커스터마이징 | 아바타 룸(로켓) 꾸미기 | Mems(연상 이미지)+원어민 비디오 | 심플 UI, 형식은 사실상 Quizlet 서브셋 | 없음(텍스트 카드, 의도적 미니멀) |
| 리텐션 | SRS 확인 안 됨(약함) | 적응형 진도 분기(mastery branching), SRS 아님 | ZPD 기반 텍스트 레벨링+반복 읽기 | SRS(공식 주장)+스트릭(손실 회피) | 명시적 SRS 없음(약함), 결국 종료 | 알고리즘 최강(SM-2/FSRS), 습관 트리거는 전무 |
| 동기 | 별/배지/레벨(내재적+수집) | Eggy Bank 저축-소비+critter 수집 | 별→로켓 꾸미기(가상경제)+배지 | 포인트/레벨/배지+글로벌·친구 리더보드 | 배지/보상 체계 얕음 | 외재적 보상 0, 파워유저 커뮤니티가 사회적 동기 대체 |
| 매일 습관 | 부모 매개 추정(저연령 특성) | 자기 페이스 진행, 알림 체계 불명 | 교사 주도 배정(Wordwall과 유사) | 스트릭 기반 Hook형(Duolingo 유사) | 차별화된 트리거 없음(종료로 논외) | 전적으로 자기규율 의존(보조 장치 없음) |

---

## 8. Paul Easy Voca 적용 시사점 (2부 — 1부와 동일 형식)

_전제: 1부와 동일하게, Paul Easy Voca는 이미 Paul Rank(XP/모자
5단계)·Ticket 경제·House System·Word King·Seasonal Progression·
Attachment 시스템·3분 데일리 리추얼·Paul Town을 갖춘 성숙한 게임화
제품입니다. 여기에 더해 이번 2부 조사 시점 기준 Reading Foundation
v3.3(지문/문장 스키마·API·관리자 편집기는 완료, **학생 학습 UI는
`readingStudentUI` 예약 플래그로 의도적 미구현**)과 다중 교재
(Multi-Textbook, v3.1 활성화 완료 — 반은 불변, 교재별 유닛/진도 분리)
아키텍처가 이미 구현돼 있습니다. 아래는 "이미 있다"와 "없다"를 구분한
시사점이며, 구현 지시가 아닌 조사 결과입니다(규칙 12)._

### 몰입 (Engagement)
- **이미 있는 것**: Attachment 시스템의 모자 컬렉션/단어 박물관은
  Reading Eggs의 critter 수집·Khan Academy Kids식 수집형 몰입과 이미
  같은 궤도에 있습니다. Daily Ritual의 배정량 밴드+정답률/페이스 기반
  조정은 Raz-Kids가 표방하는 ZPD(근접발달영역) 원칙과 독립적으로
  이미 같은 방향으로 설계돼 있음이 이번 조사로 재확인됐습니다.
- **없는 것**: Lingokids식 라이선스 IP 다변화·Memrise식 원어민 비디오
  클립·개인화 연상 이미지(Mems류)는 없음 — 다만 라이선스 IP는 비용
  구조상 애초에 이 프로젝트 규모에서 고려 대상이 아니고, 원어민
  비디오/개인화 연상 이미지는 조사 시점 기준 미구현으로 확인됨(제안이
  아니라 사실 확인).

### 리텐션 (Retention)
- **이미 있는 것**: 스트릭 처벌 부재 원칙(1부 근거)이 이번 조사로 더
  강하게 뒷받침됨 — Memrise(스트릭 손실회피)·Reading Eggs/Raz-Kids
  (교사·비평가 모두가 "과도한 게임화가 본질을 밀어낸다"고 지적한
  코스메틱 상점 경제)라는 두 개의 독립적 실패 패턴이 확인돼, 이 원칙을
  지키는 것이 여러 유사 서비스가 실제로 겪은 문제를 회피하고 있음을
  보여줌.
- **없는 것**: Anki의 "리뷰 큐를 사용자에게 노출"하는 방식과 정반대로,
  Paul Easy Voca는 이미 시스템이 알아서 배정하는 구조라 이 갭 자체가
  없음(오히려 강점으로 재확인). 다만 1부에서 지적된 외부 트리거(푸시/
  위젯) 부재는 이번 조사로도 대체할 서비스 사례를 찾지 못함 — Lingokids/
  Reading Eggs 모두 자체 알림 체계에 대한 구체 자료를 확보하지 못해
  "부모 매개 루틴에 의존한다"는 1부의 Khan Academy Kids 추정과 유사한
  선에 머무름[추정].

### 동기 (Motivation)
- **이미 있는 것**: Ticket 경제(결정론적 적립-환급)가 이미 Reading
  Eggs의 Eggy Bank식 "저축→소비" 지연 만족 구조의 핵심 가치(즉시
  보상이 아니라 모아서 교환하는 경험)를 화폐/뽑기/코스메틱 상점 확장
  없이 구현하고 있음이 이번 비교로 명확해짐.
- **없는 것**: Memrise/Raz-Kids식 글로벌·친구 리더보드, Reading Eggs식
  아바타 코스메틱 상점 확장은 없음 — 둘 다 1부에서 이미 확인된
  "개인 소셜 경쟁 부재"(안전 설계 추정) 및 `ROADMAP.md`의 "화폐/뽑기/
  결제 없음" 원칙과 정확히 같은 이유로 부재하는 것으로 재확인됨(신규
  발견이 아니라 기존 원칙의 교차 검증).

### 매일 습관 (Daily Habit)
- **이미 있는 것**: Daily Ritual의 저마찰 진입(3분 가이드 세션)은
  1부 평가 그대로 유지. Raz-Kids/Wordwall처럼 "교사(관리자)가 배정을
  트리거"하는 구조가 아니라 학생이 스스로 여는 구조라는 점은 오히려
  1부에서 못 찾았던 대조 축을 이번 조사가 보여줌 — Paul Easy Voca는
  Raz-Kids/Wordwall형(교사 주도) 대신 Duolingo/Memrise형(개인 주도,
  다만 스트릭 손실회피는 배제) 쪽에 더 가깝다는 것이 명확해짐.
- **없는 것**: 외부 트리거(알림/위젯) 부재는 1부와 동일한 갭으로
  남아있고, 이번 2부 6개 서비스 중 어느 것도 이 갭을 메울 명확한 신규
  아이디어를 주지 못함 — Lingokids/Reading Eggs는 부모 매개 추정에
  머물고, Memrise/Duolingo형 알림·위젯은 1부에서 이미 다룬 스트릭
  기반 트리거라 원칙상 재도입 대상이 아님.

### 신규 확인: "절대 추가하면 안 되는 기능" 후보 (Phase 5 로드맵용 근거)
이번 2부 조사에서 명확히 드러난, Phase 5 로드맵의 금지 목록 후보로
쓸 수 있는 근거는 다음과 같습니다(구현 지시가 아니라 근거 정리):
1. **범용 콘텐츠 공유/UGC 플랫폼 기능**(Tinycards 실패 교훈) — 이미
   압도적 강자(Quizlet)가 있는 카테고리이며 폐쇄형 커리큘럼 철학과
   불일치, 학생 간 콘텐츠 공유는 안전 부담 큼.
2. **코스메틱 상점/아바타 소비 경제 확장**(Reading Eggs/Raz-Kids
   실패 교훈) — 교사/비평가 모두 "본질(학습) 대신 수집/꾸미기에
   몰두" 현상을 독립적으로 보고, `ROADMAP.md` 기존 원칙과도 충돌.
3. **글로벌/친구 소셜 경쟁 리더보드**(Memrise/Duolingo 친구 대결) —
   1부에서 이미 "개인정보/안전 측면 의도적 결핍 가능성"으로 정리된
   결론을 재확인.
4. **고급 설정/리뷰 큐를 학생에게 직접 노출**(Anki 반면교사) — 메타
   인지 부담을 초등학생에게 전가하는 방향은 이 조사 전체에서 가장
   확실하게 "하지 않을 이유"가 뒷받침되는 항목.

---

## 핵심 요약 (2부, 축별 1줄)

- **몰입**: Daily Ritual의 적응형 배정이 Raz-Kids가 표방하는 ZPD
  원칙과 독립적으로 이미 같은 방향이었음을 외부 근거로 재확인.
- **리텐션**: Memrise(스트릭)·Reading Eggs/Raz-Kids(코스메틱 상점)
  두 개의 독립된 실패 패턴이, Paul Easy Voca가 이미 배제한 메커니즘이
  "배제할 만한 이유가 있었다"는 것을 교차 검증.
- **동기**: Ticket 경제가 Reading Eggs식 저축-소비 구조의 핵심 가치를
  이미 화폐/뽑기 없이 구현 중임을 재확인, 리더보드 부재도 원칙과 일치.
- **매일 습관**: 외부 트리거(알림/위젯) 부재라는 1부의 갭은 이번
  2부에서도 메울 신규 아이디어를 찾지 못함 — 여전히 남은 숙제.
- **가장 중요한 반면교사**: Tinycards는 "이미 압도적 강자가 있는 범용
  카테고리에 차별화 없이 진입"해 종료됐다 — Paul Easy Voca가 향후
  어떤 신기능이든 범용 콘텐츠 공유/UGC 플랫폼 방향으로 확장하지 않을
  근거로 삼을 수 있음(Phase 5 금지 목록 최우선 후보).
