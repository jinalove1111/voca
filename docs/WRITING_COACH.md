# Writing Coach — 설계 문서 (MVP: Sentence Writing)

작성: 2026-08-09. 상태: **Sentence 모드 MVP 구현 완료(플래그 기본 OFF)**,
Guided/Free 모드는 설계만. 검증 하네스: `node scripts/testWritingCoach.mjs`.

## 1. 목표

학생이 배운 단어로 영어 문장을 **직접 쓰고, 직접 고치는** 경험을 만든다.
핵심은 "AI/앱이 고쳐주는 것"이 아니라 **자가 수정(self-correction)** —
오류 위치와 짧은 힌트만 주고 학생이 스스로 고치게 하며, 혼자 고친 비율을
추적 가능한 구조로 기록한다.

## 2. 3단계 모드

| 모드 | 상태 | 내용 |
|---|---|---|
| **Sentence** | ✅ MVP 구현 | 오늘 단어(0~N개)로 한 문장 작성 → 즉시 검사 → 힌트 → 재시도 → 완료 |
| **Guided** | 설계만 | 그림/상황 프롬프트 + 문장 3~5개(짧은 문단). 문장 단위로 같은 검사 루프 재사용 |
| **Free** | 설계만 | 자유 주제 일기/글. 로컬 규칙만으로는 부족 — AI 검사 단계(§7) 도입 이후 |

Guided/Free는 **같은 taxonomy·같은 compact state·같은 세션 상태 머신**을
문장 단위로 반복 적용하는 구조라, MVP의 순수 모듈이 그대로 하부 엔진이 된다
(재설계 없이 확장 — topic_type 컬럼이 이미 3모드를 구분, §8).

## 3. 피드백 원칙 (제품 불변식)

1. **정답 대필 절대 금지** — 힌트는 "어디를 다시 볼지"만 가리킨다.
   ("yesterday가 있으니 시제를 확인해보세요" ○ / "went로 바꾸세요" ×)
2. **짧은 힌트 최대 2~3개** — 긴 설명 금지. 초등학생은 3줄 이상 읽지 않는다.
   코드 상수: `writingSession.js`의 `MAX_FEEDBACK_LINES = 3`.
3. **자가 수정 인정 우선** — 고친 유형은 "시제는 고쳤어요" 인정 문구를
   힌트보다 먼저 보여준다.
4. **3회 시도 후에만 정답 공개** — `REVEAL_AFTER_ATTEMPTS = 3`. 그것도
   사전 기반 교정이 확실히 가능할 때만(`suggestCorrection`이 null이면 공개
   버튼 자체가 안 열린다 — 반쪽 정답을 "정답"으로 보여주는 것 금지).
5. **오탐 최소화 — 불확실하면 침묵** — 틀리지 않은 곳을 틀렸다고 말하는
   순간 코치 신뢰가 깨진다. 모든 규칙은 좁은 소사전 + 명시적 예외로만
   발화한다(예: go to school/home/work/bed는 무관사 관용이라 관사 규칙
   대상에서 제외).
6. **공개 후 수정은 자가 수정으로 안 셈** — 정답 공개가 열린 뒤 고친 오류는
   selfCorrected=false로 기록(베껴 적기 가능성 배제 불가 → KPI 정직성).

## 4. 오류 taxonomy (`src/utils/writing/errorTaxonomy.js`)

14종 고정 코드(snake_case slug — grammar_points.code와 같은 "label은 바뀌어도
code는 불변" 원칙): `tense`, `article`, `subject_verb_agreement`,
`singular_plural`, `preposition`, `word_order`, `spelling`, `punctuation`,
`verb_form`, `pronoun`, `comparison`, `infinitive_gerund`,
`vocabulary_choice`, `unnatural_expression`.

MVP 로컬 규칙은 이 중 5종만 발화(tense/article/subject_verb_agreement/
spelling/punctuation)하지만, 향후 AI 검사 단계가 **같은 코드 체계**로 분류를
반환하도록 전체를 미리 고정 — DB 기록 스키마(errors jsonb)가 단계 전환에도
안 바뀐다.

## 5. 로컬 규칙 검사기 (`src/utils/writing/ruleChecks.js`)

`runRuleChecks(sentence, { targetWords })` → `{ errors, usedTargetWords }`.
AI 호출 0, 순수 함수, 결정론.

| 규칙 | 발화 조건(전부 충족 시만) | 유형 |
|---|---|---|
| 시제 | 과거 시간 표현(yesterday/last ~/ago) + 소사전 현재형 동사(~32개) + 직전 단어가 to/조동사류 아님 | tense |
| 관사 | to/at/in/on **바로 뒤** 무관사 단수 가산명사 소사전(park/store/library… — school/home/work/bed/church 제외) | article |
| 첫 글자 소문자 | 첫 단어가 소문자 i면 침묵(아래 규칙이 담당 — 힌트 중복 방지) | punctuation |
| 끝 문장부호 없음 | `.!?`로 안 끝남 | punctuation |
| 소문자 i 단독 | `\bi\b` (it/in 안의 i는 안 잡힘) | spelling |
| 3인칭 단수 | He/She/It **바로 뒤** 소사전 원형 동사. 단 같은 동사에 시제 오류가 이미 발화됐으면 침묵(goes가 아니라 went가 정답인 상황에서 반대 방향 힌트 방지) | subject_verb_agreement |
| targetWords | whole-word 미포함 → 오류가 아니라 별도 필드 `usedTargetWords`로 반환(과제 조건은 문법 오류와 다른 축 — completed 판정 오염 방지) | (vocabulary_choice 계열) |

`suggestCorrection(sentence, errors)`: 정답 공개 전용. 사전 매핑
(PAST_TENSE_MAP/THIRD_PERSON_MAP + the 삽입/대문자화/마침표)으로 교정하되,
**하나라도 교정 방법을 모르는 오류가 있으면 null**(전부-또는-null).

## 6. compact state (`src/utils/writing/writingSession.js`)

전체 대화 이력 대신 압축 상태만 유지(운영자 지시):

```js
{
  original,          // 첫 제출 문장
  currentAttempt,    // 최근 제출 문장
  resolvedErrors,    // [{ type, selfCorrected }] 누적
  remainingErrors,   // 마지막 검사에서 남은 오류
  attemptCount,
  // + 파생: feedback(≤3), completed, revealAllowed, revealText,
  //   selfCorrectedCount, usedTargetWords
}
```

이 구조가 **향후 AI 검사 단계에 모델로 전달할 컨텍스트와 동일**하다 — 대화
이력 전체를 보내는 대신 이 압축 상태만 보내 토큰 비용을 시도 횟수와
무관한 상수로 묶는 것이 비용 설계의 핵심. Date/랜덤 무사용(결정론)이라
하네스가 전체 시나리오를 재현 검증한다.

완료 시 `getSessionSummary(state)` →
`{ attemptCount, selfCorrectedCount, errorTypes, completed }` — 저장 스키마
(writing_submissions)와 1:1 대응.

## 7. 비용 아키텍처 (단계적 — provider abstraction)

| 단계 | 검사기 | 비용 | 상태 |
|---|---|---|---|
| 1 | 로컬 규칙(`ruleChecks.js`, 브라우저) | 0원 | ✅ 현 MVP |
| 2 | 저가 AI(Haiku급) — 로컬 규칙이 못 잡는 오류만 | 문장당 소액 | 설계만 |
| 3 | 고급 모델 — Free 모드 문단 첨삭/자연스러움 | 상대적 고가 | 설계만 |

설계 원칙:
- **provider abstraction**: 검사기는 "compact state → errors[] (taxonomy
  코드)" 계약만 지키면 로컬/저가AI/고급AI 어느 것이든 갈아끼울 수 있다.
  1단계에서 taxonomy 코드·compact state를 고정해 둔 이유가 이것.
- **로컬 규칙 선(先)실행**: 2단계가 와도 로컬 규칙이 먼저 돌고, 잡힌 게
  있으면 AI를 안 부른다(writingReview 파이프라인 v1.1의 "규칙 먼저, 미해결만
  AI" 선례 그대로 — CLAUDE.md 규칙 7).
- **API key는 서버에만** — 클라이언트 노출 절대 금지(ANTHROPIC_API_KEY는
  서버 환경변수, `api/_pinAuth.js`류 service_role 취급과 동일 원칙).
- **짧은 응답 설계**: AI 응답은 taxonomy 코드 + span + 짧은 힌트 JSON만
  (자유 서술 금지 — 토큰 상한 고정). 스트리밍은 Free 모드 문단 첨삭처럼
  응답이 길어질 때만 도입 검토(문장 단위 MVP에는 불필요).

### ⚠️ 서버 검사 BLOCKED — Vercel 함수 12개 한도

현재 Vercel Hobby 서버리스 함수가 12개로 **한도에 꽉 차 있어**(api/
_pinAuth.js는 헬퍼라 미포함) 2단계용 새 API route를 만들 수 없다. **이번
MVP는 그래서 api/ 폴더에 아무 파일도 추가하지 않았다.** 2단계 진행 전
운영자 결정 필요:

- **옵션 A — Supabase Edge Function**: `grade-writing-answers`/
  `admin-content-write` 선례 그대로. Vercel 한도와 무관. 유력.
- **옵션 B — 기존 함수 통합으로 슬롯 확보**: admin-pin-actions처럼 action
  dispatch 패턴으로 유사 함수를 합쳐 1슬롯 비우기. 회귀 리스크 있음.
- **옵션 C — Vercel Pro 업그레이드**: 유료. 무료 대안 우선 원칙상 최후순위.

## 8. 저장 스키마 (설계만 — SQL 미실행)

`sql_migrations/writing_coach_20260810_design.sql` 참고(실행 금지 헤더).
`writing_submissions`(세션 요약 1행) + `writing_attempts`(시도별 이력).
MVP는 DB 접근 0 — SQL 실행 여부와 무관하게 완전 동작하고, 저장 연결은
후속 작업(CLAUDE.md 규칙 9의 순서 무관 안전 원칙).

## 9. KPI / 백로그

**KPI** (관리자 통계 뷰 예시 쿼리는 설계 SQL 하단 주석):
- **self-correction rate** = self_corrected_count / 총 오류 수 — 핵심 지표.
  힌트만으로 스스로 고치는 비율이 오르면 코치가 작동하는 것.
- completion rate(포기 없이 완료), 평균 attempt_count(재시도 횟수),
- 오류 유형 분포(이번 달 자주 틀린 유형 — 수업 피드백용),
- 정답 공개 의존율(reveal까지 간 세션 비율 — 낮을수록 좋음).

**백로그**:
- Dashboard targetWords 연결(오늘의 숙제 단어 → 칩) — MVP는 빈 배열
- 완료 요약 Supabase 저장(writing_submissions) + 관리자 통계 화면
- Guided(문장 3~5개)/Free 모드, AI 검사 2단계(§7 결정 선행)
- 규칙 소사전 확장(반 단어 데이터 기반 자동 확장 검토)
