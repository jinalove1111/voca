# Decision 0001 — 반 삭제 확인 다이얼로그 문구 개선 (Project Paul 조직 첫 파일럿)

_2026-07-20. `MULTI_AGENT_WORKFLOW.md` 절차 검증용 첫 실행._

## 작업 브리프 (Orchestrator)

`PROJECT_BOARD.md` BACKLOG "[P3] 반 삭제 확인 다이얼로그 문구 개선" 카드.
`AdminScreen.jsx`의 반 삭제 확인 다이얼로그가 학생 계정 자체가
삭제되는 것처럼 오해할 여지가 있는 문구만 갖고 있었다. `DATABASE.md:96`
(라이브 실측 기록)에 따르면 `students.class_id`는 `ON DELETE SET NULL`
— 학생 계정/진행도는 보존되고 반 배정만 해제된다. 안심 문구 1줄 추가.
범위: 관리자 전용 다이얼로그 텍스트 1곳. DB/스키마/시크릿 변경 없음.

## 소집된 전문가

- **Implementer** (Engineering Head) — 본 세션이 직접 수행(1줄 텍스트
  변경, 별도 서브에이전트 불필요 판단).
- **QA Reviewer** — 서브에이전트로 독립 검수(PASS).
- **Deployment Engineer** — 본 세션이 직접 수행(기존 번들 해시 대조
  방법 재사용).

**소집하지 않은 전문가와 이유**: Product Guardian/Learning Designer/
Child Experience Designer/Student Analytics — 이 변경은 관리자 전용
다이얼로그 문구이며 학생 경험/학습 설계와 무관해 불필요(`MULTI_AGENT_
WORKFLOW.md` "이 에이전트가 이 작업에 꼭 필요한가?" 원칙 적용). Security
Reviewer — 인증/권한 경로 무변경으로 불필요. Mission Guardian — 인프라
구축 자체가 아니라 이미 승인된 작업의 실행이라 생략.

## 이견

없음(작업이 단순해 challenge 라운드 불필요).

## 최종 결정 (Orchestrator)

승인. `AdminScreen.jsx` 1937~1946줄 근처에 "✅ 학생 계정과 학생별
진행도는 그대로 유지되고, 반 배정만 해제돼요" 한 줄 추가, 기존 경고문/
확인질문 문구는 보존.

## 테스트

- `npm run build` — PASS(0 errors).
- QA Reviewer 독립 검수 — PASS: diff가 설명과 정확히 일치, 추가 문구가
  `DATABASE.md:96`의 실측 사실과 정확히 일치(과장 없음), 기존 확인
  질문("정말 삭제하시겠습니까?")이 여전히 화면에 렌더링됨, `deleteClass()`
  호출 로직 무변경, 학생 메인 번들과 분리된 관리자 전용 청크임을 빌드
  산출물로 재확인.

## 배포

커밋 후 push, Deployment Engineer(본 세션)가 라이브 번들 해시 대조로
확인 예정(핸드오프 후 handoff.md에 결과 기록).

## 남은 리스크

없음(순수 텍스트 변경, 로직/DB 무변경).
