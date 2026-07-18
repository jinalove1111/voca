# wiki/api-costs.md — 외부 API/서비스 비용 현황

_코드(`package.json`, `api/*.js`, `src/`)를 실제로 grep해서 확인한
사용처만 기록. "무료 대안 우선" 원칙(`CLAUDE.md` 규칙 7)이 실제로 어떻게
적용됐는지도 함께 기록._

## 사용 중인 외부 API/서비스

| 서비스 | 용도 | 비용 | 근거 |
|---|---|---|---|
| Supabase (Postgres + Storage) | DB 전체, 오디오 mp3 저장(`AUDIO` 버킷) | **확인 필요** — 무료/유료 티어 여부는 코드에서 판별 불가(운영자 Supabase 대시보드 확인 필요) | `src/utils/supabaseClient.js`, `DATABASE.md` |
| 브라우저 내장 `speechSynthesis` | 학생 화면의 TTS(단어/예문 듣기 중 일부 경로) | **무료** — 브라우저 내장 API, 외부 호출 없음 | `src/utils/speech.js` |
| Google Translate TTS 엔드포인트(`translate.googleapis.com/translate_tts`) | `api/generate-audio.js`가 새 단어 등록 시 단어/예문 mp3를 서버에서 미리 생성 | **무료**(공식 API 아닌 비공식 엔드포인트, API 키 불필요 — 요청 헤더에 User-Agent만 설정) | `api/generate-audio.js:52-58` |
| **`@anthropic-ai/sdk` (Claude Haiku 4.5)** | 아래 "실제 사용처" 섹션 참고 | **유료** (Anthropic API 종량제) | `api/generate-audio.js:15,24-40` |

## `@anthropic-ai/sdk` 실제 사용처 (package.json에 있으나 사용처 불명확했던 것 — 확인 완료)

`package.json`의 `dependencies`에 `@anthropic-ai/sdk`가 있고, 실제로
호출하는 코드는 **`api/generate-audio.js`가 유일**합니다(저장소 전체
grep 결과, `src/`에서는 호출 없음 — `WordDetail.jsx`/`QuizGame.jsx`의
"anthropic" 언급은 이 API 라우트를 설명하는 **주석**일 뿐, 클라이언트가
직접 호출하지 않음).

- **무엇을 하는가**: 관리자가 새 단어를 추가할 때, 예문을 직접 안 넣었으면
  Claude(`claude-haiku-4-5`)에게 "짧고 쉬운 영어 예문 + 그 예문의 한국어
  번역 + 아이 눈높이 한국어 메모리팁"을 한 번의 호출로 생성 요청.
- **호출 빈도**: **신규 단어 1개당 최대 1회.** 학생이 앱을 쓰는 동안은
  전혀 호출되지 않음 — "관리자가 예문 없이 새 단어를 저장할 때"만
  트리거(코드 주석: "students never call any TTS or AI service themselves").
  이미 오디오+예문이 모두 있는 단어는 재호출하지 않음(no-op 가드,
  `if (row.word_audio_url && row.example_text) { ...alreadyComplete... }`).
- **비용 방어 장치(코드에 실제로 구현된 것)**:
  1. `wordId`가 실제 `words` 테이블에 존재해야만 진행(없으면 404) —
     임의 텍스트로 비용을 태우는 것 차단.
  2. 생성에 쓰는 word/meaning은 클라이언트 body가 아니라 DB row 값을
     사용 — 요청 body를 조작해도 실제 단어 데이터로만 생성됨.
  3. 이미 완료된 단어는 no-op.
  4. Anthropic 호출은 자체 try/catch로 격리 — 과금 미설정/호출 실패
     시에도 발음 오디오(Anthropic 무관 부분)는 정상 저장, 예문/팁만
     비어있는 채로 graceful 폴백.
- **학생 대상 AI 문장검사/STT 채점 등은 아직 미구현**(`ROADMAP.md` v1.3
  백로그 — "비용 발생 가능, 무료 대안 없는지 먼저 확인 후 신중 검토").
  현재 코드에 학생이 트리거하는 AI 호출 경로는 없음.

## "무료 대안 우선" 원칙 적용 사례 (대조)

`CLAUDE.md` 규칙 7 / `DEVELOPER_GUIDE.md` Development Rules 6번 —
"비용이 드는 AI/유료 API 기능은 무료 대안을 먼저 찾는다"의 실제 적용
사례: 학부모 주간 리포트(`utils/weeklyReport.js`)는 AI 호출 없이 규칙
기반 템플릿으로 "AI처럼 보이게" 구현됨(상세는
[`wiki/decisions.md`](./decisions.md) 8번 항목). 즉, 이 저장소는
"AI가 꼭 필요한 곳"(자연스러운 예문/번역 생성처럼 규칙 기반으로
대체하기 어려운 작업)에만 제한적으로 유료 API를 쓰고, 템플릿으로 충분한
곳(리포트 문구)은 무료로 대체한 것으로 확인됩니다.

## 확인되지 않은 것 (정직하게 "확인 필요"로 표기)

- Supabase 프로젝트의 실제 요금제(무료 티어 vs 유료)는 코드로 판별
  불가 — 운영자의 Supabase 대시보드 확인이 필요합니다.
- Anthropic API의 실제 월별 사용량/비용은 이 저장소(코드)만으로 알 수
  없습니다 — Anthropic 콘솔의 사용량 확인이 필요합니다.

## 관련 파일

`C:\voca\package.json`, `C:\voca\api\generate-audio.js`,
`C:\voca\src\utils\weeklyReport.js`, `C:\voca\CLAUDE.md`(규칙 7)
