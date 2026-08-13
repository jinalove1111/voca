# 2026-08-14 야간 안정성 감사 — P6/P8/P10/P11/P13/P14 결과

_99차 야간 자율(검증 우선). 전부 READ-ONLY/정적 분석 — DB 변경 0,
프로덕션 동작 변경 0._

## P6 — 별(stars) 시스템 감사

`grantReward`가 단일 지급 경로(dedupKey 필수 + `starGrantLog` 멱등).
호출부 전수 6곳 — 전부 학습 완료 이벤트 내부, mount/새로고침/뒤로가기로
실행 불가:

| 호출부 | 트리거 | 수량 | 중복 방어 |
|---|---|---|---|
| `mission-clear:{wordId}` | 오늘의 미션 4칸 완성 | 3 | wordId 키 |
| `pronunciation:{wordId}:{날짜}` | 발음 성공(단어·일 단위) | 1 | 날짜 키 |
| `pronunciation-unidentified` | 비식별 발음 경로 | 1 | 타임스탬프 키(의도된 매회) |
| `sticker-duplicate:{id}` | 중복 스티커 보상 | n | 스티커 id |
| `daily-mission-bonus:{sig}` | 일일 미션 보너스 | n | 시그니처 |
| `spelling-combo:{wordId}:{combo}:{날짜}` | 쓰기 콤보 | n | 조합 키 |

델타 0 매트릭스(로그인/홈/단어장/뒤로가기/유닛·교재 선택/시험 화면
진입·이탈/새로고침/로그아웃/재로그인)는 `verify:stars`(28단언) +
`testEntranceClassroomMatrix` EXTRA(시험 화면이 useStudent/grantReward
자체를 import하지 않음 단언)로 상시 고정. **판정: PASS(코드)**.

## P8 — 계정 무결성 (라이브 READ-ONLY)

- students 1157행 = **실학생 37 + 아카이브/QA 1116 + 테스트 계정 4**
- 실학생 동일 이름 중복: **0건** / 깨진 참조(class·textbook·고아 SCA):
  **0건** / class 없는 실학생: 0 / SCA 0행 실학생: 0
- 실학생 22명이 아카이브 계정과 이름 겹침(과거 중복 정리의 흔적 — 정상)
- **아카이브인데 SCA가 남은 계정 376개** — 현재 이름 규칙 필터로 무해하나
  이름 규칙 의존이 장기 리스크. 근본 해법 = `supabase_v3_34`(is_test/
  archived 컬럼) 실행(운영자 승인 대기, TODO)
- 테스트 계정 4개의 반 소속 확인 — 전부 집계 필터로 제외됨(실측)

**판정: PASS** (구조 결함 0 — 376건은 WARNING/TODO)

## P10 — 모바일 정적 감사

- Service worker 없음, viewport meta 존재, 시험 화면 반응형(`max-w-lg
  mx-auto`, w-full 버튼) — 이전 CASE 9 단언 유지
- 고정 px: 학생 화면 중 `WordBrowser` grid `min-w-[280px]` (320px 뷰포트
  기준 여유 ~40px 내 — 잘림 위험 낮음, 실기기 확인 항목에 포함).
  나머지 고정폭은 관리자 화면(admin 전용, flex-1 병용)
- 320/360/375/390/412/430 실렌더 검증은 브라우저 e2e 부재로 **PENDING**

**판정: PASS(정적) / PENDING(실기기)**

## P11 — 오류 관찰성(설계만, 배포 없음)

제안 스키마(관리자 진단 패널 또는 콘솔 구조화 로그):
`{ ts, clientVersion(빌드 식별자), studentId(UUID만·이름 금지),
classId, textbookId, unitId, wordCount(loaded/expected),
entranceTestId, scope(반 id 목록), cacheAge(로그인 후 경과) }`
- PII 최소화: 이름/PIN/점수 미포함, UUID만
- 1단계(안전): 이미 있는 `verify:entrance-live -- <이름>`이 서버측 진단을
  전부 커버 — 클라이언트측은 `window.__paulDebug()` 읽기 전용 덤프 1개만
  추가하면 충분(미구현, 승인 대기)
- 배포 로깅(외부 전송)은 하지 않음 — 필요 시 별도 논의

## P13 — 부채 목록 (삭제하지 않음, 목록만)

| 항목 | 위치 | 위험도 | 비고 |
|---|---|---|---|
| `findActiveTest` 사용 2곳 잔존 | `EntranceTestBanner.jsx:62`(게이트 용도), `EntranceTestAdmin.jsx:112`(단일 반이라 정당) | LOW | 배너 상세줄이 학생이 실제 볼 시험과 다를 수 있음(표시상). 선택 로직과 무관 — 유지 |
| `pronunciation-unidentified` 타임스탬프 dedupKey | `useStudent.js:1161` | LOW | 의도된 매회 지급(비식별 경로) — 문서화됨 |
| 이름 규칙 기반 계정 판별 | `accountStatus.js` | MEDIUM | v3_34 컬럼 도입 전까지의 과도기 — 컬럼 우선 로직은 이미 준비됨 |
| TODO/FIXME | src 전체 2건 | LOW | 잔량 적음 |
| 아카이브 계정 1116행 + SCA 376행 | DB | MEDIUM | 조회 부하·필터 의존 — 정리는 운영자 결정(삭제 금지 원칙) |
| `_pinAuth.js` anon 키 폴백 | `api/_pinAuth.js:135` | LOW→WARNING | 아래 P14 |

## P14 — 보안 정적 감사

- **service role key 클라이언트 노출: 없음**(src/에 문자열 0 — 주석뿐).
  서버(api/)만 `process.env.SUPABASE_SERVICE_ROLE_KEY` 사용 ✓
- students 테이블: v1_9로 테이블 GRANT 회수 + 컬럼 화이트리스트(PIN 계열
  컬럼 클라이언트 접근 불가) ✓
- 시험 결과: v2_4로 anon 쓰기 회수, `api/submit-entrance-result`(서버
  재채점)만 기록 ✓ — 클라이언트 계산 점수를 신뢰하지 않음
- 관리자 API: ADMIN_PIN 환경변수 검증(6곳) ✓
- **WARNING 1**: `api/_pinAuth.js:135`가 SERVICE_ROLE_KEY 부재 시
  `VITE_SUPABASE_ANON_KEY`로 폴백 — 키 노출은 아니지만 환경변수 누락을
  조용히 가려 오동작 원인 추적을 어렵게 함. 명시 에러로 바꾸는 것을 제안
  (동작 변경이라 미수정, TODO)
- **WARNING 2(기지)**: `entrance_tests` 테이블은 anon 쓰기 허용(v1_8) —
  관리자 패널이 서버 없이 시험을 만들기 위한 설계 트레이드오프. 시험
  "결과"는 잠겨 있어 점수 위조는 불가하나, 시험 생성/종료는 anon 키로
  가능. 서버 경유로 옮기려면 Vercel 함수 한도(12개)와 상충 — 운영자 결정
  사항(TODO)

**판정: PASS + WARNING 2건(둘 다 신규 취약점 아님, 기존 설계의 정직한 기록)**
