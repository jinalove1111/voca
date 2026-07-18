# wiki/product-flows.md — 제품 플로우 요약

_이 페이지는 `ARCHITECTURE.md`의
["주요 플로우" 섹션](../ARCHITECTURE.md#주요-플로우-핵심-파일-경로-포함)을
요약 목록화한 것입니다. 각 항목은 1~3줄 — 정확한 함수명/파일 경로/분기
조건은 항상 원본 섹션을 확인하세요(이 목록은 그 섹션이 갱신되면 stale해질
수 있습니다)._

## 학생 플로우

- **로그인** — `StudentSelect.jsx`(이름+PIN 입력) → `api/verify-student-pin.js`(서버 scrypt 대조) → 성공 시 `{id,name}` 세션 저장, 이름이 아니라 UUID가 진짜 키.
- **단어 학습(공부하기)** — `WordBrowser.jsx`에서 단어 선택 → `WordDetail.jsx`가 모드별 스텝 배열(`buildSteps`) 조립 → 발음(TTS+녹음) → 예문(영/한).
- **발음 녹음/듣기** — `speech.js`의 `recordWithAutoStop()`(무음 자동정지). 발음 정확도는 채점하지 않음 — `blob.size>0`을 "연습 완료"로 취급(의도적 설계, 정밀 STT는 v1.3 백로그).
- **퀴즈** — 4지선다, 정답 시 `recordQuizAnswer`, 오답이면 레벨업 미션 대기열에 추가.
- **쓰기 시험(스펠링)** — 반 설정이 켜져 있을 때만 노출. 방향(kr2en/en2kr/mixed)별 문제 렌더, 대소문자/공백 무시 채점, 애매한 오답(영→한인데 한글 답)은 교사 검토 큐로 기록.
- **듣기 전용 반복재생** — `speech.js`의 `playRepeating()`(취소 가능, React StrictMode 이중 mount로 인한 "에코" 재발 방지 구조).
- **미니게임/보너스** — 5단어마다 참여 여부 선택, 4종(풍선/낚시/피자/기차) 중 직전 게임 제외 랜덤.
- **미션/선물상자/캘린더/다이어리** — 오늘의 미션 4개(단어/예문/퀴즈/발음) 완료 시 스티커 뽑기 → 다이어리 자유 배치 → 캘린더가 날짜별 기록 표시.
- **입실시험(Entrance Test, v1.8)** — 교사가 반/문항수/방향/제한시간 지정 → 학생 홈 배너 → 자동 채점 → 반별 랭킹/오늘의 VIP 즉시 계산(날짜 바뀌면 리셋). **알려진 갭**: 서버 재검증 없이 클라이언트 채점값을 신뢰(`wiki/security-notes.md` 참고).

## 관리자 플로우

- **반/단어 업로드** — Excel(`xlsx`)/PDF(`pdfjs-dist`) 탭, `React.lazy`로 학생 번들과 분리 → `setClassWords()`로 반영.
- **학생/반 관리** — 반별 그룹핑, 체크박스 일괄 이동, CSV 내보내기. "반 미배정" 그룹은 `classId=null`(반 삭제 시 `ON DELETE SET NULL` 결과 — 학생 계정/진행도는 보존).
- **숙제/날짜별 배정** — 별도 `homework` 테이블 없이 `daily_assignments`(오늘 배정 단어) + `student_daily_progress.categories_completed>=4`(4개 카테고리 다 채움=완료)로 통합. 배정 없으면 유닛 전체로 자동 폴백.
- **대시보드/주간 리포트** — 관리자 대시보드와 학부모 화면이 같은 `fetchDashboardData()`/`buildWeeklyReport()`를 공유 — 두 화면이 항상 같은 숫자를 보여주도록 설계.

## 학부모 플로우

- **진도 조회** — `ParentScreen.jsx`(읽기 전용) → `fetchDashboardData([studentId])` 재사용, 별도 쿼리/통계 로직 없음(관리자 대시보드와 동일 소스). 별도 인증 없음(기존 학생 이름 조회 방식과 동일한 신뢰 모델).

## 인증 플로우 (두 종류, 완전히 분리)

- **학생**: 이름+4자리 PIN, `api/_pinAuth.js`가 Node `crypto.scryptSync`+`timingSafeEqual`로 검증, 5회 실패 시 서버 잠금. 상세: [`ARCHITECTURE.md` 3. 인증 흐름](../ARCHITECTURE.md#3-인증-흐름).
- **관리자**: 단일 PIN(`ADMIN_PIN` 환경변수), 파괴적 액션은 매 요청마다 `checkAdminReauth()`로 재검증(클라이언트 `authed` state만 믿지 않음).

## 관련 파일

`C:\voca\ARCHITECTURE.md`(원본, "주요 플로우" 섹션 + "3. 인증 흐름"),
`C:\voca\src\App.jsx`, `C:\voca\src\components\`
