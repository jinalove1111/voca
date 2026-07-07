# Paul Character Assets

이 폴더의 PNG 파일들은 Project Paul 앱에서 사용할 폴 선생님 캐릭터 에셋입니다.

## 사용 방법

1. 프로젝트 안에 `public/assets/paul/` 또는 `src/assets/paul/` 폴더를 만듭니다.
2. 이 PNG 파일들을 모두 복사합니다.
3. `PaulReaction` 컴포넌트에서 아래 파일명을 사용합니다.

## 추천 매핑

### Success
- paul_happy.png
- paul_best.png
- paul_perfect.png
- paul_great.png
- paul_excellent.png
- paul_levelup.png

### Retry / Wrong
- paul_thinking.png
- paul_almost.png
- paul_sad.png
- paul_cry.png
- paul_sorry.png
- paul_one_more.png

### Etc
- paul_hello.png
- paul_lets_learn.png
- paul_study.png
- paul_reading.png
- paul_love.png
- paul_brand.png

## Claude 적용 지시 핵심

이모지 placeholder 대신 위 PNG를 사용하세요.
이미지 경로 예시: `/assets/paul/paul_happy.png`

## 실제 적용 현황 (자동 기록 — Claude가 앱에 붙인 위치)

18개 파일 중 17개(`paul_brand.png` 제외)가 실제로 확인됨 — `src/utils/
paulReactions.js`가 이 18개를 정확히 참조하고, `paul_brand.png`만 아직
없어서 그 자리만 emoji(🐾)로 보임(파일 추가 시 자동 전환).

| 파일 | 적용 화면 |
|---|---|
| paul_happy/best/perfect/great/excellent/levelup | 퀴즈·쓰기·레벨업미션·미니게임·단어학습 정답 시 랜덤(레벨업만 보스 단어 클리어에 고정) |
| paul_thinking/almost/one_more | 쓰기 시험 오답 1~3단계(순서대로 고정) + 퀴즈·레벨업미션·미니게임·단어학습 오답 시 랜덤 |
| paul_sad/cry/sorry | 쓰기 시험 오답 4단계(정답 공개, sad 고정) + 위 화면들의 오답 랜덤 풀 |
| paul_hello | 홈 화면 추천 배너("학습 시작") |
| paul_lets_learn | 단어 공부 목록 화면 상단 |
| paul_study | 단어학습 발음연습(1단계) 카드 |
| paul_reading | 단어학습 예문(2단계) 카드 |
| paul_love | 레벨업 미션 목록 상단 배너 |
| paul_brand | 로그인 화면(StudentSelect) — 파일 없어 현재 🐾로 표시 |
| (success 계열 재사용) | 미션 완료(선물상자 오픈 화면, GiftReveal) |

효과음은 `success.wav` 하나만 존재 — 정답/레벨업은 이 소리를 쓰고,
오답은 무음(혼내는 느낌을 주지 않기 위한 기존 설계 원칙). 오답 전용
효과음이 필요하면 파일을 추가로 넣어주세요(`src/utils/paulReactions.js`
의 각 항목 `sound` 필드에 경로만 채우면 됨).
