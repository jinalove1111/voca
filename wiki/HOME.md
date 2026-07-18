# wiki/HOME.md — Paul Easy Voca 로컬 Wiki 색인

> **경고: 이 위키는 기존 문서(`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/
> `DATABASE.md`/`DEVELOPER_GUIDE.md`/`TESTING.md`/`ROADMAP.md`/
> `handoff.md`)의 사본이 아닙니다.** 각 페이지는 짧은 요약 + 핵심 사실만
> 담고, 상세는 항상 링크된 원본 문서를 확인하세요. 원본과 위키가 어긋나면
> **원본이 항상 우선**입니다 (`wiki/RETRIEVAL_RULES.md` 참고).

_작성: 2026-07-18. 코드/마이그레이션/git 이력/기존 문서에서 검증된 사실만
기록했습니다 — 추측/발명 없음. 벡터DB·임베딩·유료 API 없이, 기존 6개
문서 체계 위에 얹은 순수 markdown 색인/요약 레이어입니다._

## 왜 이 위키가 필요한가

기존 문서 체계(`PROJECT_GUIDE.md` 등 6종 + `handoff.md`)는 이미
포괄적이지만, `handoff.md`만 1800줄+ 상세 세션 로그라 "이 저장소가 왜
이런 결정을 했는지", "어떤 버그가 실제로 있었는지", "보안/비용 현황이
뭔지"를 빠르게 훑어보려면 매번 큰 파일을 뒤져야 합니다. 이 위키는 그
탐색 비용을 줄이는 **경량 색인**입니다 — 새로운 진실을 만들지 않고,
이미 검증된 사실을 주제별로 다시 묶어 짧게 보여주고 원본으로 안내합니다.

## 페이지

| 페이지 | 한 줄 설명 |
|---|---|
| [`wiki/product-flows.md`](./product-flows.md) | 학생/관리자/학부모 주요 플로우 목록(로그인/퀴즈/쓰기/입실시험/숙제/유닛전환 등) — `ARCHITECTURE.md` 요약 |
| [`wiki/decisions.md`](./decisions.md) | 이 저장소가 실제로 내린 설계 결정과 근거(컬럼권한 vs RLS, 이름+PIN 로그인 전환 등) — 무엇/왜/언제(커밋) 3줄 형식 |
| [`wiki/lessons-learned.md`](./lessons-learned.md) | `CLAUDE.md` 18개 규칙의 배경 사고 재참조 + `handoff.md`의 추가 교훈 |
| [`wiki/bug-history.md`](./bug-history.md) | 실제로 기록된 주요 프로덕션 버그 표(증상/원인/커밋/날짜) |
| [`wiki/security-notes.md`](./security-notes.md) | PIN 해시/컬럼권한/관리자 재인증/알려진 보안 갭 요약 |
| [`wiki/api-costs.md`](./api-costs.md) | 실제 사용 중인 외부 API/서비스와 비용 여부(`@anthropic-ai/sdk` 실사용처 확인 포함) |
| [`wiki/glossary.md`](./glossary.md) | 이 저장소 전용 용어(컬럼명/함수명/개념) 1줄 정의 |
| [`wiki/RETRIEVAL_RULES.md`](./RETRIEVAL_RULES.md) | 향후 에이전트가 이 위키를 코드/원본 문서와 대조 검증하도록 하는 검색·검증 규칙 |

## 로컬 검색 (API 불필요)

`scripts/wikiSearch.mjs`가 `wiki/` 전체 + 기존 6개 최상위 문서
(`PROJECT_GUIDE.md`/`ARCHITECTURE.md`/`DATABASE.md`/`DEVELOPER_GUIDE.md`/
`TESTING.md`/`ROADMAP.md`) + `handoff.md`를 대상으로 키워드 검색합니다.
Node 내장 `fs`만 사용 — 외부 검색 라이브러리, 벡터DB, 임베딩, 네트워크
호출 전혀 없음. 매칭 라인을 인접한 라인끼리 묶어 발췌(excerpt)로 보여주고,
검색어 등장 횟수(+ 헤딩 라인 보너스) 기준으로 **관련도 순 랭킹**합니다.

```bash
npm run wiki:search -- "current_unit_id"
npm run wiki:search -- "PIN 해시" --limit 5
node scripts/wikiSearch.mjs "entrance test 서버 재검증" --limit 10 --context 3
```

출력 형식: `[score N] 파일경로:시작줄-끝줄` 다음에 들여쓴 발췌 텍스트.
`--limit`(기본 15)로 결과 개수, `--context`(기본 2)로 매칭 라인 앞뒤에
포함할 줄 수를 조절합니다.

## 이 위키가 다루지 않는 것 (의도적 범위 제외)

- 벡터DB/임베딩 검색, 유료 API 기반 요약/생성
- 대시보드 기능(운영자 요구사항에서 명시적으로 금지)
- 모바일 QA 체크리스트(별도 `PROJECT_BOARD.md` P3 항목, `MOBILE_QA.md`
  후보로 이미 기록돼 있음 — 이 위키 범위 아님)
- 학생 대상 신규 기능/UI(`CLAUDE.md` 규칙 12와 동일한 제약을 이 위키
  작업에도 적용)

## 관련 파일

`C:\voca\scripts\wikiSearch.mjs`, `C:\voca\PROJECT_GUIDE.md`(문서 지도),
`C:\voca\CLAUDE.md`(저장소 헌법 18개 규칙)
