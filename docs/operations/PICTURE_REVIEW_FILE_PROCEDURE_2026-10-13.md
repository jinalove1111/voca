# 그림 검토 기록 파일 절차 (2026-10-13)

## 1. 한 줄 요약

기존에 자동 공개된 119개 그림의 교사 승인·반려 기록은 데이터베이스가 아니라 저장소의 파일 한 개(`src/data/pictureWords/legacyReviews.json`)에 둡니다. 관리자 화면에서는 저장되지 않습니다. 파일은 개발자가 Git 커밋으로만 바꿉니다.

## 2. 기록 파일 위치와 구조

위치: `src/data/pictureWords/legacyReviews.json`. 현재 `reviews`는 비어 있습니다(아직 아무도 검토하지 않았습니다).

```json
{ "v": 1, "note": "...", "reviews": { "<그림 id>": { "action": "approve | reject", "reviewer": "표시용 이름", "at": "YYYY-MM-DD", "note": "선택", "replacement": "선택, reject에만" } } }
```

아래는 모양을 보여 주는 예시입니다. 실제 기록이 아닙니다.

- 승인 예시(가짜): `"pics2/anchor": { "action": "approve", "reviewer": "예시교사", "at": "2026-10-20" }`
- 반려 예시(가짜): `"pics2/avocado": { "action": "reject", "reviewer": "예시교사", "at": "2026-10-20", "note": "그림이 뜻과 다름", "replacement": "example-asset-name" }`

## 3. 검증 규칙

- `v`는 1이어야 하고 `reviews`는 객체여야 합니다.
- 그림 id는 `scripts/pictureWords/source/legacyAutoPublished.json`에 있는 119개 중 하나여야 합니다.
- 기록은 객체이고, `action`, `reviewer`, `at`, `note`, `replacement` 외의 키는 없어야 합니다.
- `action`은 `approve` 또는 `reject`입니다.
- `reviewer`는 앞뒤 공백 없는 1~40자 문자열입니다.
- `at`은 실제로 있는 날짜의 `YYYY-MM-DD` 형식입니다(미래 날짜 여부는 검사하지 않습니다).
- `note`는 200자 이하 문자열입니다.
- `replacement`는 `reject`에만 쓸 수 있고, 비어 있지 않은 문자열이어야 합니다.

확인 명령: `node scripts/pictureWords/validateLegacyReviews.mjs` (승인·반려·남음 개수와 오류를 출력하고, 오류가 있으면 실패로 끝납니다).

## 4. 적용 절차

관리자 화면에서는 저장되지 않습니다. 화면의 승인·반려 버튼은 꺼져 있습니다.

1. 교사가 관리자 화면의 "그림 검토"에서 그림을 보고, 어떤 그림을 승인하고 어떤 그림을 반려할지 개발자에게 알려 줍니다.
2. 개발자가 작업 브랜치에서 기록 파일을 수정합니다.
3. 개발자가 `node scripts/pictureWords/validateLegacyReviews.mjs`와 `node scripts/testPictureWords.mjs`를 실행해 통과를 확인합니다.
4. 개발자가 작업 브랜치에 커밋하고, 운영자가 배포를 승인합니다.
5. 배포 후 관리자 화면의 그림 검토에 새 상태(승인/반려 개수, 기록자, 날짜)가 나타납니다.

## 5. 지금 이 기록이 하는 일과 하지 않는 일

하는 일: 관리자 화면에 표시되는 검토 상태(검토 필요/승인/반려)와 기록자·날짜를 바꿉니다.

하지 않는 일: 학생이 보는 화면은 전혀 바꾸지 않습니다. 학생 쪽 코드는 이 파일을 읽지 않습니다(테스트가 막고 있습니다). 반려로 기록해도 그림은 지금처럼 학생 화면에 계속 쓰입니다.

## 6. 앞으로의 설계 (미구현, 별도 승인 필요)

반려된 그림은 학생 화면에서 숨깁니다.

- 생성 규칙 `isLearnable`(`scripts/pictureWords/validateDecisions.mjs`)에 "반려이면 기존 자동 공개 id라도 학습 대상이 아님"이라는 우선순위를 추가합니다.
- `replacement` 그림이 기록되어 있으면, 그 그림이 승인된 뒤 해당 단어가 그 그림을 씁니다.
- 대체 그림이 없으면 그림 없는 학습으로 돌아갑니다. 파닉스 단어는 `image`가 `not-needed`/`needed`인 단어가 쓰는 기존 글자 카드 경로를 탑니다. 단, 코드상 그림이 없는 단어는 `NOIMG` 목록에 있으면 `not-needed`, 없으면 `needed`(이미지 제작 대기)로 분류되므로, 반려된 단어를 `not-needed`로 보려면 별도 처리가 필요합니다. 그림 단어 연습 세트에서는 그 단어가 세트에서 빠지고, 상점 세트가 4단어 미만이 되면 `ready`가 아니게 됩니다(`shopSets`의 `ready: words.length >= 4`).

바꿔야 할 코드: `validateDecisions.mjs`의 `isLearnable`, `buildPictureWordsData.mjs`(기록 파일을 읽어 `learn`을 계산하고 데이터를 다시 만듦), 그리고 119개를 고정값으로 확인하는 테스트들.

위험: 연습할 단어가 줄어듭니다. 119를 고정한 테스트가 깨집니다. 학생 화면이 바뀌므로 별도 운영자 승인과 브라우저 검증이 끝나기 전에는 배포하지 않습니다.

## 7. 나중에 Supabase로 옮길 때

이 기록을 데이터베이스로 옮기는 설계는 `docs/design/PICTURE_REVIEW_STORAGE_2026-10-13.md`에 있고, 아직 실행하지 않은 초안 `supabase_v3_52_picture_review_DRAFT.sql`이 있습니다. 초안의 action 값은 `exclude`이고 이 파일은 `reject`이므로, 옮길 때 `reject`와 `exclude`를 서로 바꾸는 변환이 필요합니다.
