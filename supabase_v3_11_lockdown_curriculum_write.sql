-- Paul Easy Voca v3.11 — 커리큘럼 쓰기 보안 락다운(classes/units/words)
--
-- ⚠️⚠️⚠️ 실행 순서 경고 — 이 파일에서 가장 중요한 문단입니다 ⚠️⚠️⚠️
-- 이 SQL은 다음 두 가지가 "전부" 완료된 뒤에만 실행하세요:
--
--   1) 코드 배포: src/utils/wordLibrary.js(반/유닛/단어 쓰기 함수들이
--      supabase/functions/admin-content-write Edge Function을 거치도록
--      전환된 버전)가 Vercel 프론트에 배포되고, 동시에
--      `supabase functions deploy admin-content-write`로 Edge Function
--      자체도 배포돼 있을 것.
--
--   2) [★★★ 이번 구현 세션 범위 밖 — 반드시 별도 후속 작업으로 완료 ★★★]
--      src/components/AdminScreen.jsx의 반/유닛/단어 CRUD 호출부 8곳
--      (createClass / setClassWords / addClassUnit / deleteClassUnit /
--      deleteClass / renameClass / setClassSettings /
--      setWordAcceptedMeanings)이 화면에 이미 들고 있는 관리자 pin 상태를
--      각 호출의 새로 추가된 마지막 인자로 실제로 전달하도록 고쳐졌을 것.
--      wordLibrary.js 쪽 함수들은 이미 이 인자를 받을 수 있게(하위호환
--      옵셔널 마지막 인자) 고쳐졌지만, 지금 이 세션은 AdminScreen.jsx를
--      의도적으로 "단 한 줄도" 건드리지 않았습니다(동시 작업 중일 수 있는
--      다른 세션과의 파일 충돌을 피하기 위함, CLAUDE.md 규칙 16) — 즉 코드
--      배포(1번)만으로는 관리자 화면이 여전히 adminPin을 안 보냅니다.
--
-- 2번을 건너뛰고(또는 1번만 해두고) 이 SQL을 실행하면, 관리자 화면의 반/
-- 유닛/단어 생성·수정·삭제가 전부 "관리자 인증 실패"(권한 없음)로 즉시
-- 깨집니다 — 조회(학생 학습 화면 포함)는 계속 정상 동작합니다(이 SQL은
-- SELECT를 전혀 막지 않음).
--
-- 확인 방법(실행 전 권장): Vercel 프로덕션에서 관리자 로그인 → 아무 반의
-- 유닛 이름 하나를 저장(수정) 시도 → 정상 저장되면 AdminScreen.jsx가 이미
-- adminPin을 보내고 있다는 뜻이므로 이 SQL을 실행해도 안전합니다.
--
-- ── 배경(왜 필요한가, 2026-07-24 보안 감사 라이브 실측) ──────────────────
-- classes/units/words 테이블에 RLS/GRANT 제한이 전혀 없어, 공개된 anon key
-- (배포된 JS 번들에 포함, 로그인/PIN 불필요)만으로 인터넷 누구나 인증 없이
-- 전체 CRUD가 가능했다(INSERT/PATCH/DELETE 전부 실측 확인, 실제 행 생성 후
-- 즉시 삭제로 검증). students 테이블의 PIN 컬럼은 동일 anon key로 이미
-- 42501(permission denied)이 반환되는데(v1.9 정상 동작), 이 3개 테이블만
-- 그 보호가 없었다.
--
-- ── 무엇을 하는가 ────────────────────────────────────────────────────
-- classes/units/words 세 테이블에 RLS를 켜고, SELECT만 허용하는 정책 하나씩
-- 남긴다(INSERT/UPDATE/DELETE는 이 정책에 해당 작업이 없으므로 RLS
-- default-deny로 자동 차단됨) — xp_ledger/word_king_history/seasons가 이미
-- 쓰는 "anon read only" 패턴과 정확히 동일(supabase_v2_3_paul_rank.sql:81-82,
-- supabase_v2_6_word_king.sql:68-69, supabase_v2_8_seasonal_progression.sql:
-- 72-74 참고). 학생 학습 화면/관리자 조회 화면의 기존 SELECT는 전혀 영향
-- 없음(변경 없음) — 이 SQL을 실행해도 앱이 "즉시" 깨지지 않는 유일한 축은
-- 조회뿐이고, 쓰기는 위 실행 순서 경고를 지켜야 깨지지 않는다.
--
-- 멱등(여러 번 실행해도 안전) — drop policy if exists 후 재생성. 테이블/
-- 컬럼 삭제나 전체 행 비우기 구문은 전혀 쓰지 않음(순수 RLS 정책 추가).

alter table classes enable row level security;
drop policy if exists "classes anon read only" on classes;
create policy "classes anon read only" on classes for select using (true);

alter table units enable row level security;
drop policy if exists "units anon read only" on units;
create policy "units anon read only" on units for select using (true);

alter table words enable row level security;
drop policy if exists "words anon read only" on words;
create policy "words anon read only" on words for select using (true);

-- 참고: service_role 키(Supabase Edge Function/서버리스 함수가 쓰는 키)는
-- RLS를 우회하므로 이 정책들과 무관하게 계속 전체 CRUD가 가능하다 —
-- supabase/functions/admin-content-write가 인가(adminPin) 통과 후 이
-- service_role 키로 쓰기를 수행하는 구조이기 때문에, 이 SQL 실행 이후에도
-- "제대로 배선된" 관리자 쓰기는 정상 동작한다(위 실행 순서 경고 참고).
