# Phonics 시범 Unit SPEC (콘텐츠 아님) — 2026-10-08 초안 (225차)

_교육 설계 담당(읽기 전용 서브에이전트) 초안 → 리드 검토. **콘텐츠(음소·단어·문항)는 생성하지 않았다.** 구현도 하지 않았다 — 이 문서는 다음 차수가 Phonics Unit을 만들 때 지켜야 할 계약·원칙·검증 계획만 적는다. 근거: 운영자 설계안 `Paul_English_Integrated_Curriculum_v1.md` §4·§10·§13·§14·§15(worktree 밖, 운영자 첨부), `INTEGRATED_CURRICULUM_IMPL_2026-10-08.md` §1·§2, `courseModel.js`, `unitRecords.js`, `unitBorrow.js`, `speech.js`. QA 전용·PR #62 Draft·DB/SQL/Production 무변경 전제._

## 리드 메모 (운영자 결정 필요 1건)
- 설계안 §4 "철자 도입 순서는 학원이 선택한 SSP 프로그램을 따른다" ↔ 커리큘럼 독립 원칙 "순서는 자체 결정". 리드 제안 = 아래 §0. **운영자 확인 전까지 Phonics 콘텐츠 작성 금지.**
- 음소 단독 TTS 신뢰성(§③)은 **미검증**이며, 검증 전에는 듣기 활동을 만들 수 없다. 교사 녹음 클립 대체 시 음원 제작 일정이 선행된다.

## 0. 선결 충돌 1건
운영자 설계안 §4는 "철자 도입 순서는 학원이 선택한 SSP 프로그램을 따른다"고 하고, 리드 지시는 "순서는 자체 결정"이다. 제안: **순서 원칙은 자체 결정**, 학원 프로그램의 "현재 철자 범위"(§16, 미제공)는 나중에 "시범 음소가 그 범위 안인가"만 확인하는 입력값으로 둔다(순서 복제 아님). 운영자 확인 필요.

## ① 범위
- 과정 `phonics` · 블록 `P1` · Unit 1개. 앱 1회 5~8분(§10 가안) × 2~3회차 분량.
- 음소 **4개 = 자음 3 + 단모음 1**, 전부 글자 1:1 대응(이중문자·대체 철자 없음). 합치기 활동용 CVC 단어 ≥4개를 이 4글자만으로 만들 수 있어야 한다.
- 순서·선택 원칙(자체 결정, 콘텐츠 단계에서 적용): (a) 길게 끌 수 있는 자음(비음·마찰음) 우선 — 합성 시연 시 모음 첨가 없이 이어 들려주기 쉬움, (b) 글자 모양 혼동 쌍(b/d, p/q, m/n 중 둘)은 같은 Unit에 두지 않음, (c) 한국어에 가까운 대응이 없는 소리(/r/, /θ/ 등)는 P1 제외, (d) 영국식·미국식 모음 차이가 큰 모음은 제외. 특정 프로그램의 첫 글자 집합(예: s·a·t·p·i·n)을 그대로 쓰지 않는다 — 정적 핀으로 고정.
- 구어 트랙 1표현(§4 P1: "Help, please." 계열) — 듣고 말하기만, 읽기 활동에 넣지 않음.

## ② 데이터 계약
- **재사용**(courseModel/unitBorrow 그대로): `id, course:'phonics', block:'P1', level:1, titleKo, situationKo, activities[](id/kind/titleKo/goalKo), observation[], sources[](official/research/own)`. 기록은 `unitRecords.js` 무변경(UUID 키, completed·selfChecked만).
- `goalId`: COMM_GOALS에 파닉스 목표가 없으므로 구어 표현의 목표(`requesting` 또는 `greeting`)를 단다. 문해 목표 축은 아래 `phonemes`가 담당.
- **`validateUnit` 수정 금지**(vocab≥4·listening.turns≥4·reading·grammar 요구가 회화 전용, 기존 핀 깨짐) → `validatePhonicsUnit(u)` 별도 함수(같은 파일 또는 `phonicsModel.js`).
- **Phonics 전용 필드**:
  - `phonemes[]`: `{ id, grapheme:'m', ipa:'/m/', teacherNoteKo:'입술을 다물고 코로 내는 소리(교사용)', exampleWords:[{en, decodable:boolean}] ≥2 }`. 표기 원칙: 데이터·교사 화면은 IPA, **학생 화면은 글자+🔊만**, 한글 음차("므") 금지 — 모음 첨가를 유도하기 때문.
  - `audio`: 음소마다 `{ clipId|null, status:'unverified'|'teacher-approved' }`. 승인 클립 없으면 그 음소의 듣기 활동을 **숨긴다**(TTS로 대신하지 않음).
  - `oral`: `{ en, ko }` 1개(구어 트랙, 기존 문장 TTS 경로).
- **활동 종류(ACTIVITY_KINDS에 추가)**: `listen-pick`(소리 듣고 글자 고르기, 보기 3 = Unit 글자만) · `blend`(글자 2~3개 소리 차례 재생 → 단어 고르기 3지) · `decode`(배운 글자만의 단어 ≤6개 읽기 → 자기 확인 '읽었어요/어려웠어요', 채점 없음) · `oral`. 분절·쓰기는 P1 제외(§4 "앱 키보드로 글자 형성 평가 안 함").
- 선택형 정답은 `correct` 인덱스(다답 배열 허용) 기존 규칙 재사용.

## ③ 음성 처리 원칙
- **미검증**: 기존 en-GB `speechSynthesis`/translate_tts가 음소 단독("m")을 글자 이름("em")이나 모음 첨가("muh")로 읽지 않는지 확인된 바 없다. §4 "음소 음원은 일반 문장 TTS만으로 제작·검수하지 않는다".
- 검증 방법(구현 전): 입력 후보("m", "mm", "mmm", SSML 불가 확인)를 Android Chrome·iOS Safari·데스크톱 Chrome에서 재생, 폴 선생님이 [글자 이름 읽음 / 모음 첨가 / 통과] 3단 체크. 통과 기준: 3기기 전부 글자 이름 0건·모음 첨가 0건. 어느 하나 실패 → 교사 녹음 정적 클립(`src/assets`, 기존 Paul 리액션 음성 방식)으로 대체.
- 합치기 시연(m-a-t → mat)은 기본 교사 클립. 단어 전체 발음만 기존 단어 TTS 경로 사용.
- 녹음: 기존 `useLocalRecorder` 기기 내 선택, 자동 채점·업로드 없음.

## ④ 학생 화면 원칙
- 한 화면 1 음소. 순서는 소리 → 글자(듣고 고르기는 소리 먼저, 글자는 보기로만).
- 답 확인 전 숨김 규칙 **적용**: `blend`·`decode`의 정답 단어 글자·음성은 확인 전 미마운트(UnitScreen `revealed` 패턴 재사용). `listen-pick`은 성격상 보기 글자가 보여야 하므로 예외(소리만 먼저).
- 글자 이름·한글 음차 표시 금지. 그림은 정답 단서가 되지 않게 보기에 쓰지 않음(§3).
- 선택 후 맞음/다시 들어 보세요 + 다시 고르기 가능, 점수 없음(기존 선택형 규칙).

## ⑤ 기록
- `unitRecords.js` 그대로: 활동별 `completed`·`selfChecked`만 앱이 켠다. 음소별 숙달·정답률·진급 필드 없음. 교사 관찰은 `observation[]` 문구와 오프라인 확인으로.

## ⑥ 검증 계획
- 정적 `scripts/testPhonicsUnit.mjs`: `validatePhonicsUnit` 통과 · decode 단어와 보기 글자가 Unit `grapheme` 집합의 부분집합 · 혼동 쌍 동시 미포함 · 한글 음차/글자 이름 문자열 0건 · 특정 프로그램 첫 집합과 불일치 핀 · `audio.status!=='teacher-approved'`면 listen-pick 비노출 · ACTIVITY_KINDS 추가가 `testPilotUnit` 회화 핀을 깨지 않음.
- e2e `unit-phonics.spec.mjs`(브라우저 1개 순차): 1 화면 1 음소, blend/decode 확인 전 미마운트, 다시 고르기, 재진입 complete 유지, 360/390/412/1280, 비QA 계정 차단.
- 교사 관찰(§14 항목 축소): 혼자 시작했나 · 지시 이해했나 · 합치기를 추측 아닌 소리 연결로 하나(입 모양은 오프라인 관찰) · 음성이 거슬리거나 틀렸나 · 5~8분 안에 끝나나 · 다음 수업에 글자-소리를 기억하나.

## ⑦ 근거 상태
- Hulme et al. 2012(음소 인식·글자-소리 지식의 인과)·Fricke et al. 2013(구어 중재): **영국 L1 유아·저학년 연구**. 확인 수준은 `INTEGRATED_CURRICULUM_IMPL_2026-10-08.md` §9(225차 참고문헌 검증) 참조. 한국 EFL 초등에 직접 적용 입증 없음. `sources[]`에 kind:'research', "L1·연령 일반화 불가"로 적는다.
- 순서 원칙·음소 수·활동 종류·화면 규칙은 전부 **kind:'own' 자체 결정, 교사 검수 전**. 학습 효과·판매 근거 주장 금지.

## ⑧ 하지 않는 것
- 대량 콘텐츠(2 Unit 이상, 블록 전체) 생성 · 외부 프로그램/교재 순서·단어 목록 복제 · DB/SQL/업로드/유료 API · 자동 채점·발음 평가 · 분절 쓰기·손글씨 평가 · 기존 `validateUnit` 변경 · 일반 학생 노출(QA 전용·PR #62 Draft 유지).
