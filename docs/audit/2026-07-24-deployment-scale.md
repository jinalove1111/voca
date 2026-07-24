---
# 배포/인프라 확장성 감사 결과 (2026-07-24)

담당: deployment-engineer(읽기 전용 역할). 100명×20학원 동시접속 가정.

## (1) 서버리스 함수 개수/한도

**실측 결과: 여전히 12/12, 여유 0.** `git ls-tree -r --name-only HEAD -- api/ | grep -v '^api/_'` 실행 결과 정확히 12개 라우트 파일(`admin-pin-actions.js`, `clear-student-pin.js`, `compute-word-king.js`, `generate-audio.js`, `grant-xp.js`, `self-set-student-pin.js`, `set-student-pin.js`, `start-new-season.js`, `student-pin-status.js`, `submit-entrance-result.js`, `verify-admin-pin.js`, `verify-student-pin.js`) — `_pinAuth.js`는 밑줄 헬퍼라 제외. `vercel.json`은 저장소에 아예 없음 — 즉 함수당 메모리/타임아웃/리전을 커스터마이징할 수단이 현재 전혀 없고 Vercel 기본값에 그대로 노출됨.

**등급: HIGH (경고 유지).** ARCHITECTURE.md "8. 배포 프로세스" 4번에 2026-07-20 P0 사고(14개→조용한 배포 실패)가 기록돼 있고, 이 감사 시점에도 정확히 한도선. 새 API 엔드포인트가 하나라도 필요해지면 반드시 먼저 action dispatch 통합(예: admin-pin-actions.js) 검토가 선행돼야 함 — 지금 그대로 새 파일 추가하면 즉시 재사고. **(2026-07-24 같은 날, 정확히 이 제약 때문에 Critical 보안 수정이 Vercel api/*.js가 아니라 신규 Supabase Edge Function `admin-content-write`로 구현됨 — 이 감사의 경고가 실제로 그날 설계 결정에 반영된 사례.)**

## (2) Vercel Hobby로 2000명 동시접속 감당 가능한가

확인 필요 항목이 많아 확정 불가하나, 정성적으로 위험 신호 다수.

- **가장 심각한 발견(신규): Vercel Hobby 플랜은 ToS상 비상업적(non-commercial) 용도로 제한됩니다.** 이 앱은 20개 학원(유료 고객)에게 서비스하는 상업적 SaaS입니다 — 이는 기술적 용량 문제가 아니라 **약관 위반 리스크**이며, 규모가 커질수록(20학원=명백한 상업 운영) Vercel이 계정을 정지시킬 가능성이 기술적 장애보다 먼저 현실화될 수 있습니다. 이 판단은 공개적으로 알려진 Vercel Hobby 약관 취지에 기반한 것으로, **정확한 최신 조항은 Vercel 공식 약관 페이지에서 운영자가 재확인 필요**(이 세션은 실시간 웹 접근 불가 — 즉 이 항목은 [추정]이며 1차 출처 재확인 전까지 사실로 단정하지 말 것).

  **[2026-07-24 후속 확정] [추정] 아님 — 확정.** 조정자가 별도 세션에서 WebSearch로 직접 확인했습니다. Vercel 공식 Terms of Service는 Hobby 플랜을 "개인 또는 비상업적 용도"로 명시적으로 제한하며, 실제로 상업적 프로젝트가 Hobby 플랜에서 발견되면 계정을 정지/경고하는 집행 사례가 있습니다(검색 결과 인용): "Vercel's Terms of Service explicitly state that you shall only use the Services under a Hobby plan for your personal or non-commercial use." / "Vercel actively monitors and warns/disables accounts that violate Hobby terms. Additionally, Vercel may suspend commercial projects found on Hobby plans." 출처: https://vercel.com/legal/terms (공식 ToS), 2차 확인 https://www.promptstoproduct.com/vercel-free-tier-limits 등. (직접 원문 열람은 이 확정 작업 세션의 WebFetch가 훅에 의해 차단돼 하지 못했으나, WebSearch 결과로 Vercel 공식 ToS의 취지가 명확히 확정됨.) 20학원(상업 SaaS) 규모로 확장 시 기술적 용량 문제보다 **약관 위반으로 인한 계정 정지**가 먼저 현실화될 실제 리스크임이 확정됐습니다 — 아래 종합 판정 표 및 재확인 문구는 이 확정 사실을 반영해 갱신했습니다.
- **서버리스 함수 실행시간**: `vercel.json` 부재 = 기본값(짧은 실행시간 한도) 그대로 적용. `generate-audio.js`(Anthropic + Google TTS 순차 호출)처럼 수 초 걸릴 수 있는 함수가 기본 타임아웃에 걸릴 위험 — 다만 관리자 전용 트리거(신규 단어 등록 시)라 2000명 동시접속과는 무관, 로그인류 함수는 매우 가벼워 안전.
- **동시 실행 한도/대역폭 정확한 수치**: 확인 필요 — Hobby 플랜 대역폭이 매달 수십~100GB 수준으로 알려져 있으나 Vercel이 정책을 자주 바꿔 정확한 현재 수치는 대시보드/공식 페이지 확인 필요.
- **번들 크기 기반 추정**: 학생용 메인 번들 gzip 약 185KB/방문(첫 로드). 오디오 mp3는 Supabase Storage에서 서빙되므로 별개. 2000명×1일 1회 로드로는 Hobby 무료 대역폭을 단기간에 소진할 정도는 아닐 것으로 보이나 이 추정도 확인 필요.

## (3) 빌드 산출물 크기 — 실측

`npm run build` 실행 결과:

| 파일 | Raw | gzip | 비고 |
|---|---|---|---|
| 메인 청크(학생 전원 로드) | 621.02 kB | **185.64 kB** | 500kB 경고 대상 |
| AdminScreen 청크 | 484.97 kB | 160.80 kB | React.lazy로 코드분할, 학생 무관 |
| pdf 관련 청크 | 472.12 kB | 140.35 kB | AdminScreen 전용, lazy import, 학생 무관 |
| pdf.worker | 1,245.45 kB | (미측정) | 관리자 PDF 업로드 전용 |

**중요: 500kB+ 경고 3개 중 2개(AdminScreen, pdf)는 이미 React.lazy로 관리자 전용 코드분할이 되어 있어 학생 로딩 성능과 무관합니다.** 학생 2000명이 실제로 받는 건 메인 청크(gzip 185KB)뿐 — 모바일 3G 기준으로도 크게 나쁜 수준은 아니나 여유는 없는 편.

**등급: LOW~MEDIUM.** 앞으로 학생 화면에 기능 추가 시 React.lazy 우선 적용을 관례화할 것을 권고.

## (4) 환경변수/시크릿 관리 — 20학원 학원별 격리

**등급: HIGH — 구조적으로 학원별 격리가 인프라 레벨에서 전혀 없음.** `api/verify-admin-pin.js`, `api/_pinAuth.js` 확인 결과 `process.env.ADMIN_PIN`이 **전역 단일 값**입니다. 관리자 PIN 하나가 전체 배포(모든 학원)에 공통 적용 — 학원 A 원장이 학원 B 데이터에 접근하는 것을 막는 인프라적 장치가 없음. Supabase 키도 프로젝트 전체 단일 세트이며, DB 레벨 테넌트 분리(RLS)는 ARCHITECTURE.md에 명시된 대로 "RLS 대신 컬럼권한(v1.9)" — 행 단위(학원 단위) 접근 제어가 아예 없고, 학원 간 데이터 격리는 순수하게 애플리케이션 로직 수준입니다.

**참고(같은 날 보안 감사가 독립적으로 재확인): `classes` 테이블에 `academy_id` 같은 경계 컬럼이 전혀 없음을 실측으로도 확인했습니다(`docs/audit/2026-07-24-security.md` 참고) — 이 항목과 정확히 같은 사실을 다른 각도(보안 vs 인프라)에서 짚은 것.**

**무료 티어 내 권장 조치**: (a) 최소한 Supabase RLS를 academy_id 기준으로 도입해 DB 레벨에서 강제하는 방향 검토, (b) 관리자 PIN을 학원별로 분리 — 둘 다 유료 플랜 불필요, 순수 스키마/RLS 설계 문제.

## (5) Supabase 무료/저가 티어 한계

**등급: 확인 필요(코드로 판별 불가).** "Supabase 프로젝트의 실제 요금제는 코드로 판별 불가 — 운영자의 Supabase 대시보드 확인이 필요"가 기존 `wiki/api-costs.md`에도 이미 명시돼 있음. 정성적 위험 신호(정확한 수치는 운영자 확인 필요): 무료 티어 DB/스토리지/egress 상한이 낮아 2000명 규모 진행도 JSON blob 누적 시 DB 용량이 먼저 병목이 될 가능성, 오디오 mp3 누적으로 스토리지 상한도 함께 봐야 함, 비활성 시 자동 일시정지 정책(20학원 상시 운영이면 낮은 우선순위), 버스트 요청 시 커넥션 풀 한도는 실측 없이 단정 불가.

**권장**: 유료 업그레이드 검토 전에 운영자가 Supabase 대시보드에서 현재 사용량/플랜을 먼저 확인.

## (6) 모니터링/알림 부재

**등급: HIGH — 사실상 전무.** 관련 인프라 문서가 전혀 없음. 현재는 **장애가 나도 학생/학부모의 신고 전까지 아무도 모르는 구조**.

**추가 발견 — 별도 리스크(`.github/workflows/deploy.yml`):** GitHub Actions로 **GitHub Pages에 동시 배포**하는 워크플로우가 존재합니다(`main` push마다 build → GitHub Pages 배포). GitHub Pages는 정적 호스팅이라 `api/*.js` 서버리스 함수(PIN 검증 등 전부)가 동작하지 않습니다 — 이 배포 타겟이 실제로 활성화(Pages 설정 On)돼 있고 누군가 그 URL로 접속한다면 로그인부터 깨지는 "그림자 배포"가 될 수 있습니다. 이 세션은 네트워크 호출이 차단돼 있어 Pages 활성 여부를 **확정하지 못했습니다** — 운영자가 리포지토리 Settings → Pages에서 직접 확인 필요.

**[2026-07-24 후속 확정]** 조정자가 별도 세션에서 WebFetch로 `https://jinalove1111.github.io/voca/`를 직접 열람해 확인 — 실제로 활성 상태였습니다("Paul Easy Voca 🌟" 페이지가 실제로 응답, API 라우트 없는 정적호스팅이라 로그인/PIN 검증 전체가 깨지는 상태로 실제 라이브 노출 중이었음). 운영자 승인 하에 즉시 조치: 커밋 `c34a5e3`("fix(deploy): GitHub Pages 그림자 배포 자동 재배포 중단")로 `.github/workflows/deploy.yml`의 트리거를 `on: push` → `on: workflow_dispatch`로 전환해 향후 자동 재배포는 차단됐습니다. **단, 이미 게시된 사이트 자체(확인 시점 기준 여전히 응답 중일 가능성 높음)는 이 커밋만으로는 내려가지 않고, 운영자가 GitHub 저장소 Settings → Pages → Source를 None으로 직접 변경해야 완전히 해소됩니다** — 이 잔여 액션은 여전히 운영자 대기 상태입니다.

**무료 티어 내 권장 조치**: Vercel/Supabase의 기본 제공 알림(배포 실패 이메일 등, 정확한 제공 여부는 대시보드 설정에서 확인)을 켜는 것이 새 유료 도구 도입보다 우선.

## 종합 판정

| 항목 | 등급 | 즉시 무료로 고칠 수 있는가 |
|---|---|---|
| 서버리스 함수 12/12 한도 | HIGH | 코드 통합 필요(설계는 가능) — **2026-07-24 보안수정에서 이미 이 원칙 적용됨** |
| Vercel Hobby 상업적 사용 ToS | HIGH(**확정**, 2026-07-24 후속 WebSearch 확인) | 아님 — 확정, 운영자가 플랜/구조 결정 필요 |
| 빌드 번들 크기 | LOW~MEDIUM | 이미 대부분 lazy-split 완료, 추가 조치 우선순위 낮음 |
| 학원별 인프라 격리 부재 | HIGH | 설계 변경 필요(RLS 도입), 무료 티어 내 가능 |
| Supabase 티어 한계 | 확인 필요 | 아님 — 대시보드 확인 선행 필요 |
| 모니터링/알림 부재 | HIGH | 부분적으로 무료 옵션 존재, 설정만 필요 |
| GitHub Pages 그림자 배포 | HIGH(**확정**, 2026-07-24 후속 WebFetch 확인 — 활성이었음) | 부분 — 자동 재배포는 커밋 `c34a5e3`로 이미 차단, 완전 비활성화(Settings→Pages→Source: None)는 여전히 운영자 대기 |

**요약**: 서버리스 함수는 여전히 12/12로 여유 없어 새 기능 추가 시 2026-07-20과 동일한 사고 재발 위험이 가장 시급. **[2026-07-24 후속 확정]** 새로 드러난 가장 심각한 구조적 리스크 중 (a) 20개 학원이라는 상업적 운영 규모에 Vercel Hobby(비상업 전제) 사용 — 약관 위반으로 인한 서비스 중단 가능성은 더 이상 [추정]이 아니라 **확정**(WebSearch로 Vercel 공식 ToS 문구·집행 사례 확인, 출처 https://vercel.com/legal/terms), (c) GitHub Pages 그림자 배포도 더 이상 "활성 여부 미확정"이 아니라 **실제로 활성 상태였음이 WebFetch로 확정**됐고 자동 재배포는 조치 완료(커밋 `c34a5e3`)나 기존 게시물 완전 비활성화는 운영자 대기. (b) 관리자 PIN·Supabase 키가 전역 단일값이고 RLS가 없어 학원 간 데이터 격리가 애플리케이션 로직에만 의존(같은 날 보안 감사와 교차확인됨)하는 문제는 그대로 유지. 빌드 번들은 이미 lazy-split으로 심각하지 않음. Supabase 티어 여부만 운영자 직접 확인이 남아 있음.
