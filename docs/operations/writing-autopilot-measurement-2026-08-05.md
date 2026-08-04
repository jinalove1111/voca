# 쓰기 오토파일럿 편집거리1 자동승인 — 라이브 데이터 측정(2026-08-05)

**작성**: implementer (측정 전용 세션, 코드/스키마 변경 없음)
**작성일**: 2026-08-05
**대상**: `src/config/features.js`의 `writingReviewAutoTypo`(티어③, 편집거리1
`decisionSource='levenshtein'` 자동 인정) — 켜도 되는지에 대한 근거.
**전제 문서**: `docs/operations/task2-writing-analysis.md`(파이프라인 설계 근거),
`docs/operations/task2-writing-report.md`(구현 보고서). 이 문서는 그 위에
"실제로 켜도 안전한가"를 라이브 데이터로 검증한 후속 측정이다.

---

## 결론 먼저

**`writingReviewAutoTypo`를 켜지 말 것.** 라이브 큐에서 교사가 이미 판단한
88건(accepted 18 + dismissed 70)을 정답지로 삼아 검증한 결과, 편집거리1
계단(`decisionSource='levenshtein'`)이 이 정답지에서 **맞춘 건이 0건**이고
**틀리게 자동승인했을 건이 16건**이다. 정밀도 0%. 이 계단을 자동승인으로
켜면 오탐이 그대로 학생 정답 기록(`words.accepted_meanings`)에 반영된다.

**대신 `writingReviewAiAssist`만 켜서 AI 판정 데이터를 쌓고, 아래 재현
스크립트로 재측정할 것.** AI 계단(`decisionSource='ai'`)은 지금까지 한 번도
실행된 적이 없어(§ 정직한 한계) 이 문서로는 위험도를 전혀 알 수 없다 —
"AI가 안전하다"는 뜻이 아니라 **측정하지 못했다**는 뜻이다.

---

## 재현 방법

```sh
node scripts/measureWritingReviewAutopilot.mjs
node scripts/measureWritingReviewAutopilot.mjs --top 20   # 오탐 사례 더 보기
```

`scripts/measureWritingReviewAutopilot.mjs`는 읽기 전용(REST GET만, INSERT/
UPDATE/DELETE 없음)이고, 판정 로직을 재구현하지 않는다 — 실제 파이프라인이
쓰는 `supabase/functions/grade-writing-answers/pipeline.js`의
`classifyLocally`를 그대로 import해서 돌린다(헌법 규칙 3). `.env`의
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`를 `scripts/preMigrationCounts.mjs`
와 동일한 방식으로 읽는다. `verify` 하네스에는 등록하지 않았다 — 라이브
DB 값이 계속 바뀌는(정답지 표본이 매일 늘어나는) 일회성 의사결정 도구라
회귀 테스트 성격이 아니다.

---

## A. pending 205건에 로컬 판정을 적용한 결과(2026-08-05 실측)

라이브 `spelling_review_queue` 293행(pending 205 / accepted 18 / dismissed 70,
전부 `direction='en2kr'`) 기준.

| 판정 | 건수 |
|---|---|
| exact_match | 0 |
| synonym(accepted_meanings 일치) | 1 |
| levenshtein 거리 1 | 68 |
| 미해결(AI 필요) | 136 |

이 205건 자체는 이미 기존 채점 엔진(`isSpellingCorrect`)을 통과 못 한
답만 남은 것이라(`task2-writing-analysis.md` §1-3) exact_match가 0건인
것은 그 발견과 일관된다.

## B. 교사가 이미 판단한 88건을 정답지로 삼은 검증(핵심)

같은 큐에서 이미 `status='accepted'`(18건) 또는 `status='dismissed'`(70건)로
사람이 처리한 행을 정답지로 썼다 — 관리자가 "✅ 인정" 버튼을 눌렀으면
그 답은 실제로 맞는 답, "무시"를 눌렀으면 실제로 틀린 답이라는 뜻이다.

- **accepted 18건**: 로컬 판정이 **18/18 전부 맞춤** — 그런데 **전부
  `synonym` 소스**(관리자가 그 전에 "인정 변형으로 저장"해서
  `accepted_meanings`에 이미 들어있던 답이 다시 들어온 경우)다.
  `exact_match`/`levenshtein`으로 맞춘 accepted 건은 0건이다.
- **dismissed 70건**: 로컬 판정이 **16건을 잘못 승인** — **전부
  `levenshtein` 소스**다. `exact_match`/`synonym`으로 오인정된 dismissed
  건은 0건이다.

### 소스별 정밀도(맞춤 / (맞춤 + 오인정))

| 소스 | accepted에서 맞춤 | dismissed에서 오인정 | 정밀도 |
|---|---|---|---|
| exact_match | 0 | 0 | 발동 0건(측정 불가) |
| synonym | 18 | 0 | **100% (18/18)** |
| levenshtein | 0 | 16 | **0% (0/16)** |

**즉 편집거리 계단이 이 정답지에서 맞춘 건은 0건, 발동 16건 전부 오탐이다.**
반대로 `synonym`(관리자가 직접 "인정 변형으로 저장"한 것을 재확인하는
경로)은 이 정답지에서 100% 신뢰할 수 있다 — 애초에 사람이 한 번 확인한
값을 그대로 재사용하는 구조라 당연한 결과이기도 하다.

## C. 대표 오탐 사례(2026-08-05 실측, 상위 항목)

- `harm`(해치다) ← 답 `"다치다"` (능동/피동이 정반대)
- `flight`(비행) ← 답 `"비행기"` (다른 단어)
- `airport`(공항) ← 답 `"공할"`, `already`(이미, 벌써) ← 답 `"이ㄴ"`,
  `happiness`(행복) ← 답 `"행벅"`/`"행복한"`, `coral`(산호) ← 답 `"산허"`,
  `each other`(서로) ← 답 `"서러"`, `educational`(교육의, 교육적인) ← 답
  `"교유적인"` — 편집거리 1이라는 조건은 만족하지만, 이 중 상당수는
  "오타"가 아니라 아예 다른 음절 오류이거나(`이ㄴ`) 뜻이 미묘하게 다른
  말(`행복한` vs `행복` — 품사 차이)이다.
- (2026-07-23 분석 문서 §16에서 이미 인용된 사례) `ocean`(대양, 바다) ←
  답 `"비다"` — 편집거리 1이지만 "비어있다"는 완전히 무관한 뜻. 이번
  2026-08-05 재측정에서도 큐에 그대로 남아있다(상위 10건 출력에는
  안 걸렸지만 `--top 20`으로 확인 가능).

전체 오탐 목록은 `node scripts/measureWritingReviewAutopilot.mjs --top 16`
(발동 16건 전부)로 재현 가능.

## D. 한글 편집거리 디테일 — "음절 vs 자모" 애매함은 실제로 없다

`pipeline.js`의 `normalizeForCompare`는 비교 전에 항상 `String(raw).normalize
('NFKC')`를 적용한다(`pipeline.js:34`). 그래서 학생 답이 자모 분해(NFD)
상태로 들어와도 편집거리 계산 전에 **항상 완성형 음절 단위로 정규화**된다
— "음절 단위로 셀지 자모 단위로 셀지"를 걱정할 필요가 실제 파이프라인에는
없다(이 걱정 자체가 기우였다는 뜻).

## E. 문장부호/공백 정규화 갭 — 별도 측정

같은 293행에서, `normalizeForCompare`가 이미 하는 정규화(NFKC + trim +
중복 공백 축약 + 양끝 문장부호 제거, `pipeline.js:32-38`) 덕분에 문장부호가
있어도 어차피 비교 전에 제거된다. "애초에 답안 양끝에 문장부호가 붙은
행이 얼마나 있었나"만 별도로 세어보면 **0건**이다(2026-08-05 실측,
`scripts/measureWritingReviewAutopilot.mjs` §E). 즉 이 정규화 갭 자체가
이 큐에서는 실질적인 해소 효과가 없다 — 큐는 전부 한글 철자 오타
(`초초한`/`의싯`/`령성하다`/`빌생하다` 등, `task2-writing-analysis.md`
§1-3 항목4 참고)다.

---

## 왜 한국어에서 편집거리가 영어와 다르게 작동하는가

편집거리1 자동승인은 원래 "영어 철자 오타"를 잡으려고 설계된 휴리스틱이다
(예: `locker`를 `lokcer`로 친 경우 — 한 글자 위치가 바뀌어도 단어 자체의
뜻은 안 바뀐다). 하지만 한국어 음절은 자음+모음(+받침)이 한 글자 단위로
합쳐져 있어서, **한 글자를 바꾸면 그 글자 하나의 발음 전체가 다른 형태소로
바뀐다** — 영어 알파벳 한 글자 오타와 한글 한 음절 오타는 "정보량"이
근본적으로 다르다.

- `harm`(해치다) → `"다치다"`: 편집거리 1(`해→다`)이지만 "해치다"(가해자)와
  "다치다"(피해자)는 능동/피동이 정반대다 — 한 음절 차이가 문장의 주체를
  뒤집는다.
- `ocean`(대양, 바다) → `"비다"`: 편집거리 1(`바→비`)이지만 "바다"(장소
  명사)와 "비다"(형용사/동사, "비어있다")는 품사부터 다르다.
- `flight`(비행) → `"비행기"`: 편집거리 1(끝에 `기` 추가)이지만 "비행"
  (행위)과 "비행기"(사물)는 아예 다른 단어다.

영어라면 편집거리 1은 대부분 "같은 단어의 오타"지만, 한국어는 편집거리
1이 "완전히 다른 단어"인 경우가 이 정답지 기준으로 더 흔했다(16/16). 이
계단이 애초에 이 언어에 맞지 않는 휴리스틱이라는 뜻이다.

---

## 정직한 한계

이 측정을 근거로 결론을 확대 해석하지 않기 위해, 아래 한계를 명시한다.

1. **정답지 88건은 편향된 표본이다.** `spelling_review_queue`는 클라이언트
   채점(`isSpellingCorrect`)을 이미 통과하지 못한 답만 들어온다(설계상
   당연 — 그게 이 큐의 존재 이유다). 즉 이 88건은 "애초에 애매했던 답만
   모아놓은 집합"이지, 학생 전체 제출 답안의 대표 표본이 아니다. 정밀도
   숫자(특히 synonym 100%)를 "이 소스는 항상 안전하다"는 일반 결론으로
   확대하면 안 된다 — 다만 levenshtein 정밀도 0%(16/16 오탐)는 표본
   편향을 감안해도 자동승인을 켜지 말아야 할 근거로는 충분히 강하다(발동
   건수가 16건으로 통계적으로도 결코 적지 않다).
2. **`selectCertainRejects`(자동 반려 후보 선별,
   `src/utils/spellingReviewBulkPlan.js:419-427`)는 후보 자체가 0건이라
   검증이 원천적으로 불가능했다.** 이 함수는 (a) AI가 `reject_candidate`를
   신뢰도 0.95 이상으로 낸 경우, 또는 (b) `writing_answer_statistics`
   테이블의 `rejected_count >= 5 && accepted_count === 0`인 경우를 자동
   반려 후보로 잡는다. 2026-08-05 실측으로 `writing_answer_statistics`를
   직접 조회한 결과 89행이 존재하지만(제출 자체는 로깅됨) **`rejected_count`
   상위 10건 전부 0, `last_decision`도 전부 `null`이다** — 즉 AI가 이
   라이브 환경에서 **단 한 번도 실행된 적이 없다**(`writingReviewAiAssist`
   플래그가 계속 OFF였고, Edge Function도 배포/시크릿 설정이 안 된 상태,
   `task2-writing-report.md` §6~7 배포 전 체크리스트 미완료). **이건
   "AI 계단이 안전하다"는 뜻이 아니라 "위험을 아직 측정할 데이터 자체가
   없다"는 뜻이다.**
3. **AI 계단(`decisionSource='ai'`)의 실제 감소 효과는 모른다.** 이
   문서가 검증한 건 규칙 기반 계단(exact_match/synonym/levenshtein) 3개
   뿐이다. AI가 얼마나 정확한지, 어떤 종류의 오탐을 내는지는 이 정답지
   88건 중 단 한 건도 AI 판정을 거친 적이 없어(§2와 동일 이유) 전혀
   알 수 없다.

## 재측정 조건

`writingReviewAiAssist`를 켜고(관리자가 실제로 "분석 시작"을 눌러 AI
판정이 `spelling_ai_grading_cache`/`writing_answer_statistics`에 쌓인 뒤),
같은 스크립트(`node scripts/measureWritingReviewAutopilot.mjs`)를 다시
돌려 `decisionSource='ai'` 정밀도를 같은 방식(accepted/dismissed 정답지
기준)으로 확인할 것 — 그 결과가 나오기 전까지는 `writingReviewAutoPilot`/
`writingReviewAutoDismiss`도 함께 켜지 않는 것을 권장한다(둘 다 AI 단계
결과에 의존, `src/config/features.js:108-137` 주석 참고).
