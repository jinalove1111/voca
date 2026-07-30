# Beta Final Checklist — Paul Easy Voca (단일 학원 50명)

_작성: 2026-07-30. 베타 오픈 직전 최종 체크리스트. 배포 명령/순서/롤백 상세는
`docs/DEPLOYMENT_CHECKLIST_V311_V312.md`, 종합 판정은
`docs/BETA_LAUNCH_READINESS_REPORT.md`, 보안은 `docs/SECURITY_AUDIT_V311.md`.
이 문서는 "무엇이 끝났고 / 사람이 뭘 해야 하고 / 무엇을 테스트하고 / 무엇을
감수하는가"의 한 장짜리 요약이다._

---

## 1. 완료된 항목 (Completed)

### 코드 — 커밋·push 완료 (origin/main)
- `da2761d` 문장학습 빈칸 입력 `autoComplete="off"`(자동완성 억제 일관성).
- `db4e169` v3.11/v3.12 배포·보안·베타 문서.
- `e88cf54` 미니게임 결과 별 표시를 실제 지급값에 일치(과다약속 제거).
- `5b49c92` v3.12 daily_assignments 무인가 쓰기 락다운 dual-path(코드).

### 코드 — 이번 세션, 커밋 예정(검증 후)
- 퀴즈 풀 마운트 시 고정: 백그라운드→복귀 시 문항이 몰래 재섞이던 HIGH
  버그 수정(`QuizGame.jsx`, useMemo→lazy useState). build+verify:quiz PASS.
- 모바일 터치타깃: 발음 재생 버튼(🔊원어민/🎧내발음) ≥44px로
  (`WordDetail.jsx`, `QuizGame.jsx`).
- iOS Safari 100vh 로그인 접힘 완화: `.min-h-screen`을 dvh 지원 시 100dvh로
  (`index.css`, `@supports` 가드 — 미지원 브라우저는 기존 100vh 폴백).

### 감사·검증 (여러 세션 누적)
- 학생 플로우 전수 감사: 데이터무결성/크래시 결함 0(로그인/유닛/듣기/스펠링/
  퀴즈/보상/숙제). 스펠링 SPOF·별 이중지급은 이전 세션에 이미 수정됨.
- 어휘 입력 자동완성 방어 감사: 스펠링 시험/입실시험 입력은 완전 보호
  (autoComplete/autoCapitalize/autoCorrect/spellCheck off + 무작위 name +
  붙여넣기 차단). §5 한계(OS 예측텍스트)만 잔존.
- 모바일 UX 감사(2회): 2026-07-24 6건 + 이번 세션 2건 수정, 나머지 문서화.
- 보안 감사: Edge Function/RLS 코드 정확, daily_assignments 무인가 쓰기
  CRITICAL 발견→코드 dual-path 완료(배포 대기).

---

## 2. 남은 수동 배포 단계 (Manual — 운영자만, 이 환경 불가)

_상세 명령: `docs/DEPLOYMENT_CHECKLIST_V311_V312.md`. 순서 위반 시 관리자 쓰기
42501._

- [ ] **이번 세션 커밋 push** (자동 배포 트리거) — 아래 코드 fix가 프론트에
      반영돼야 함(현재 origin에 push된 것 + 이번 세션 fix).
- [ ] `supabase login` + `link --project-ref azsjthtdjfpnctffjfsk` +
      `secrets list`(ADMIN_PIN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 3개 확인)
- [ ] `supabase functions deploy admin-content-write` (v3.11+v3.12 공통) +
      ACTIVE 확인 + 미인가 스모크(not_authorized)
- [ ] Vercel 최신 배포 = main HEAD 확인
- [ ] **[사람] 라이브 게이트**: 관리자 로그인 → 유닛 이름 저장 + 숙제 배정
      저장 각 1회 성공(실패 시 SQL 금지, 위 단계 재확인)
- [ ] `supabase_v3_11_...sql` 실행 → `supabase_v3_12_...sql` 실행(각 begin/commit)
- [ ] 정합성 프로브: classes/units/words/daily_assignments anon 쓰기 42501 확인
- [ ] (대기) v3_6/v3_8/v3_9/v3_10 SQL 검토

**주의**: Edge Function 미배포 상태에서 프론트만 최신이면 관리자 커리큘럼/
숙제 쓰기가 404로 실패한다 — 함수 배포가 사실상 베타의 단일 게이트.

---

## 3. 학생 테스트 체크리스트 (실기기 ≥3종: iPhone Safari / Android Chrome / 데스크톱)

- [ ] 이름+PIN 로그인 / 세션 유지 / 새로고침 후 진행도 복구
- [ ] 유닛 선택·전환(반의 유닛 목록 정상)
- [ ] 단어 듣기(🔊 원어민 재생) / 녹음 후 내 발음 듣기 — **재생 버튼 탭
      쉬운지(44px)**
- [ ] 예문 학습(예문+뜻 표시)
- [ ] 스펠링 연습/시험: 입력 시 키보드 자동완성 뜨지 않는지(실기기 필수),
      붙여넣기 차단, 오답→"다음 문제" 진행
- [ ] 퀴즈 4지선다: 진행 중 **앱 백그라운드 후 복귀해도 문항이 안 바뀌는지**
      (이번 수정 확인 포인트)
- [ ] 4·4 미션 완료 → 기프트/스티커 → 별 저장
- [ ] 숙제(오늘의 단어) 완료 표시 / 캘린더 / 다이어리
- [ ] 미니게임 결과 별 표시 = 실제 받은 별과 일치
- [ ] 작은 화면(320~360px): 가로 스크롤·버튼 잘림 없음
- [ ] 로그인 첫 화면에서 "시작하기" 버튼이 스크롤 없이 보이는지(iOS)

## 4. 교사/관리자 테스트 체크리스트 (배포 후)

- [ ] 관리자 PIN 로그인
- [ ] 반 생성 / 이름변경 / 삭제(테스트 반)
- [ ] 유닛 추가
- [ ] 단어 엑셀 업로드 / PDF 업로드 / 개별 수정
- [ ] **오늘/특정일 숙제 배정 저장**(v3.12 신규 경로 — 라이브 게이트 항목)
- [ ] 추가 정답(뜻) 인정 / (해당 시) 쓰기검토 큐
- [ ] 반 설정(쓰기시험/게임화 on-off) 저장
- [ ] 학생 반 이동(대조군 — 항상 정상)
- [ ] 대시보드에서 학생 진도/숙제 완료 확인
- [ ] (교실 운영) 발음 오디오 볼륨이 거슬리면 — 현재는 시스템 볼륨/기기
      하드웨어 볼륨으로 조절(앱 볼륨 슬라이더는 미구현, §5)

## 5. 알려진 한계 (Known Limitations — 베타 감수)

| 항목 | 성격 | 상태 |
|---|---|---|
| OS 키보드 예측텍스트 | 스펠링 시험에서 웹 속성으로 100% 차단 불가 | 문서화, 교사 안내 권장(고배점은 예측텍스트 끄기) |
| 오디오 볼륨 조절 UI 없음 | 단어 오디오가 볼륨 1 고정, 앱 내 조절 불가 | `docs/AUDIO_TTS_VOLUME_RECOMMENDATION.md`(quick fix=per-device 슬라이더, iOS는 Web Audio 필요) |
| 같은 목소리 반복 | 저장 MP3 단일 목소리 재생 | variation은 베타 후 |
| WordBrowser 범위학습("모르는 단어만")+"알아요" off-by-one | MEDIUM, 2차 경로(기본 GuidedSession 무관) | 문서화 — App.jsx 중앙 수정 위험이라 자율 미수정 |
| SpeedBtn(속도 버튼) 터치타깃/키보드 겹침 | 부동 버튼 <44px, iOS 키보드와 코너 겹침(이론적) | 문서화 — 전역 :has() 숨김은 광범위/행동변경이라 미적용, 실기기 확인 후 판단 |
| 다이어리 스티커 삭제(✕) 28px | Low, 무-undo | 문서화 — 히트영역 확대는 인접 오탭↑ 위험이라 미적용 |
| 기프트 애니메이션 스킵(연속 동일 스티커) | Low, 시각효과만 | 문서화 |
| 발음 별 dedup 라운드 스코프 | 경제 애매(코드 내 의도 상충) | 제품 결정 대기 |
| 멀티테넌트 | 미준비(단일 학원 전용) | `docs/SAAS_READINESS_REVIEW.md` — 베타 무관 |
| Vercel Hobby ToS | 상업 사용 리스크 미검증 | 유료 전환 시 검토 |

---

## 6. Go / No-Go

- **GO 조건**: §2 배포 시퀀스 완료 + §2 정합성 프로브 42501 + §3·§4 테스트
  통과.
- **현재**: 코드/검증 READY(학생 제품·이번 fix 포함). 유일 실질 게이트는
  §2 운영자 배포(특히 admin-content-write 함수 배포). 배포 전엔 관리자
  콘텐츠/숙제 편집 불가라 실질 운영 불가.

_이 세션은 안전한 프론트엔드 fix(퀴즈 풀 고정, 모바일 터치타깃, iOS 100dvh)만
적용했다 — DB/보안정책/Edge Function 배포는 건드리지 않았다._
