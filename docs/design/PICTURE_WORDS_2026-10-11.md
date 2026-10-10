# 그림 단어 분류 + 승인 검토 화면 (248차, 2026-10-11)

운영자가 준 물건 그림 151장(`pics2/*.png`)을 단어/카테고리로 분류하고, 의심스러운 31장(+사용 불가 1장)을 **관리자만** 승인/수정/제외하는 화면을 만들었다. 학생 화면·학습 기능은 이번 범위가 아니다.

## 1. 검증 방법과 숫자

- 리드가 151장을 전부 직접 열어 무엇이 그려져 있는지 판단했다(`scripts/pictureWords/source/verdicts.json`, 한국어 `shown` = 그림 설명).
- 파일명이 아니라 **그림**이 기준이다. 파일명과 그림이 다르면 MISMATCH.
- 결과: MATCH 119 / MISMATCH 16 / UNCERTAIN 10 / MULTIPLE 5 / UNUSABLE 1 (합계 151).
- 기존 DB 단어와의 대조는 문자열 비교이며 18개가 이미 있는 단어(모두 MATCH). 나머지 MATCH 101개는 신규 등록 후보.

## 2. 직접 확인한 것 vs 추론한 것

| 항목 | 출처 |
|---|---|
| 그림 내용(`shown`) | **직접 열어 확인** |
| 영어 단어(`en`, 영국식 우선) | 그림에서 도출 |
| 한국어 뜻(`ko`) | 추론 |
| 샵 카테고리(`shop`) | 추론 |
| 미국식 표기(`enUS`) | 추론 |
| 파닉스 그룹/패턴 | 철자에서 추론(`inferred-from-spelling`), IPA는 영국식 |
| 기존 단어 대조(`existingWord`) | 문자열 비교 |

## 3. 승인 필요 목록 (16 / 10 / 5 / 1)

화면(관리자 > 🖼 그림단어 > 승인 필요)에서 카드로 본다. 불일치 16, 불확실 10, 여러 개 5, 사용 불가 1(별도 묶음, 승인 버튼 없음). 개별 파일명/판단 근거는 `verdicts.json`이 원본이며 화면에 모두 표시된다.

## 4. 데이터 구조

`scripts/pictureWords/buildPictureWordsData.mjs`가 `source/verdicts.json` + `source/phonics.json` + `src/assets/pictureWords/manifest.json`에서 `src/data/pictureWords/pictureWords.json`을 생성한다(손으로 고치지 않는다). 이미지 한 장 = 엔트리 하나, 원본 id(`pics2/<파일명 stem>`) 유지.

- `tracks`: `pictureVocabulary`, `shopVocabulary`, `phonics`, `townObject` 중 해당하는 것. 한 단어가 여러 트랙에 속해도 **파일은 한 번만** 저장하고 트랙 배열로 연결한다(복제 없음).
  - MATCH: picture + shop, 파닉스 목록에 있으면 phonics, shop이 garden/decoration이면 townObject(21개).
  - 비MATCH: 승인 전까지 `tracks: []`, `autoLink: false`.
- `phonics`: `{group, pattern, ipa, phonicsOrder: null}` (33개).
- 최상위 `phonicsReview.orderConfirmed=false`, `counts`.
- 헬퍼 `src/data/pictureWords/index.js`: `PICTURE_WORDS`, `byStatus`, `phonicsGroups`, `shopGroups`, `reuseSummary`, `applyDecisions`(순수; 승인/수정/제외를 적용한 사본 반환, 입력 불변).
- 이미지: `scripts/pictureWords/buildPictureWords.py`가 PNG를 알파 트림 -> 256px 이내 -> WebP(40KB 이하)로 `src/assets/pictureWords/<asset>.webp`에 만든다(`--root`/`PICTURE_WORDS_ROOT`, 멱등). 한글 파일명 2개는 `kr-cabbage`, `kr-microscope`. 중복 파일(`baskettt`)도 에셋이 있다. 151개 합계 2,448,798 바이트, 최대 33,708 바이트.

## 5. Phonics 33 (그룹) — 학습 순서 미확정

그룹: r-controlled 6, review: irregular 4, long e 4, short e 4, long a 3, long i 3, short a 2, short i 2, long o 1, oo (short) 1, short u 1, short o 1, long u / oo 1 (13그룹). **학습 순서는 커리큘럼 확인이 필요하다 — 화면의 그룹 순서는 임의 표시 순서이며 학습 순서가 아니다.** 모든 항목 `phonicsOrder: null`.

## 6. 재사용 / 신규

기존 단어 재사용 18, 신규 등록 후보 101(MATCH 기준). 비MATCH 32장은 승인 후 따로 분류한다.

## 7. 학습 흐름 (설계 — 미구현)

그림 보기 -> 영국식 발음 듣기 -> 따라 말하기 -> 그림 보고 단어 맞히기 -> 복습. 이번 라운드에는 학습 화면/상점 UI가 없다.

## 8. 저장과 안전

- 결정은 이 브라우저의 `localStorage['paulEasyVoca_pictureWordReview']`에만 저장(`{v:1, decisions:{id:{action,en?,ko?,at}}}`). `내보내기 복사`로 JSON을 꺼낸다.
- 패널/데이터에는 fetch/Supabase/`/api`/보상 호출이 없다(`scripts/testPictureWords.mjs`가 소스 핀으로 검증).
- 이미지는 `PictureWordReviewPanel` lazy 청크에서만 import(격리 검사). 번들 예산에서는 관리자 전용 청크로 제외.

## 7-A. (249차 추가) 결정 반입 · Phonics 미분류 · 연습 화면

- 결정 파일: `scripts/pictureWords/source/decisions.json`(지금은 비어 있음). 운영자가 내보낸 `{ "v":1, "decisions":{...} }`를 이 파일에 붙여 넣고 `node scripts/pictureWords/validateDecisions.mjs`로 검증한 뒤 `node scripts/pictureWords/buildPictureWordsData.mjs`를 다시 실행하면 학습 데이터가 갱신된다. `pending`은 승인 필요 31장(MISMATCH/UNCERTAIN/MULTIPLE) 중 결정이 없는 것 — 사용 불가 1장은 제외 결정만 가능하며 pending에 세지 않는다. 결정 전까지 학습 대상은 MATCH 119장뿐.
- Phonics: 운영자 지시로 분류하지 않는다(교재 유닛별 소리 순서 확정 전). `tracks`에서 제거, `phonicsCandidate`와 `phonicsReview.classified=false`만 유지, 학생 화면은 사용하지 않음.
- 연습 흐름(구현됨, 테스터 4명 전용): 그림 보기 → 영국식 발음 듣기(자동재생 없음) → 따라 말하기(녹음은 선택·메모리 전용·점수 없음) → 그림 보고 단어 맞히기(답 전 단어/뜻 비노출) → 복습(틀린 단어를 맞힐 때까지) → 요약.
- 세션 한정: 모든 진행 상태는 React state(새로고침 시 사라짐). 저장 키·네트워크·보상·분석 없음.
- 아직 없음: 철자 쓰기, 그림 듣고 고르기, 보상/기록, 상점 UI, 구매 SQL, 2x 이미지, 기존 18단어 저장 mp3 재사용.

## 9. 나중에 SQL이 필요한 것 / 하지 않은 것

- 상점 구매(`town_items` 항목 추가)와 승인 결과를 DB에 영구 저장하는 일은 별도 마이그레이션이 필요하다(이번에는 SQL 없음).
- 하지 않은 것: 학습 화면, 상점 UI, 단어 DB 등록, 승인 결과의 서버 반영, 파닉스 순서 확정, 2x 이미지.
