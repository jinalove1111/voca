# 그림 상황 미션 설계 — Easy "There is / There are" 공원 미션 (시범 1단원)

작성: 2026-10-10 (오후 운영자 요청). 상태: 설계 초안. 교사 검수 전. 콘텐츠 원안은 `park_scene.js`(콘텐츠 담당 초안)이고 이 문서는 그것을 화면·데이터·검증 관점으로 정리한다.
표기: **[확인]** = 저장소에서 관찰된 사실, **[제안]** = 이 문서의 가정, **[미확인]** = 운영자만 답할 수 있음, **[리드 기입]** = 구현·검증 후 리드가 채움.

## 0. 기획 의도와 범위

**한 줄 의도**: 글 카드만 넘기던 문법을 "폴타운 공원을 보고, 꾸미고, 그것을 말하고 쓰는" 그림 상황 미션으로 바꿔 한 단원 안에서 보기·읽기·듣기·말하기·쓰기가 같은 문장을 다루게 한다.

| 항목 | 내용 |
|---|---|
| 시범 범위 | Easy `g-easy-05` "There is / There are" **1단원만**. 사용 가능한 품질까지 먼저 만든다 |
| 34단원 | 유지. 단원 수·id·과정 구성을 바꾸지 않는다 |
| 다른 단원 | 나중에 **데이터(`scene` 필드)만 추가**해 확장한다. 컴포넌트 수정 없이 붙는 것이 목표 |
| 기존 덱 | `scene`이 없는 단원은 지금의 카드 덱(GRAMMAR_CURRICULUM §12)을 그대로 쓴다. `scene`이 있는 단원만 미션 화면 |
| 하지 않는 것 | 새 XP, 새 모자 단계, DB 컬럼·테이블 추가, 점수·등급 표시, 새 보상 종류 |
| 테스트 계정 | Cookie, Paul, Jinaa는 QA 테스트 계정이다. 캐릭터 이름 Cookie(강아지)와 계정 이름은 별개다 |

## 1. 학습 흐름 9단계

한 화면에는 과제 하나만 둔다. 그림과 문장은 모두 실제 UI(버튼·텍스트)이고, 이미지 안에 글자를 굽지 않는다.

| # | 단계 | 학생 행동 | 화면 요소 | 답 확인 전 숨김 규칙 | 다음 잠금 규칙 | testid prefix | 정확한 id |
|---|---|---|---|---|---|---|---|
| 1 | 발견 (`discover`) | 공원 그림의 강아지를 누른다 | 공원 장면(강아지 1), 안내문, 누른 뒤 말풍선 `There is a dog.` + 한국어 + 🔊 | 누르기 전에는 영어 문장 숨김. 누르면 문장 표시와 TTS 1회 | 강아지를 한 번 눌러야 열림 | `scene-discover*` | 카드 `scene-card-discover`, 강아지 `scene-obj-dog-0`(누르기), 말풍선 `scene-caption`, 🔊 `scene-caption-listen`. 안내 문구는 `gd-next-hint` |
| 2 | 비교 (`compare`) | 왼쪽(1마리)과 오른쪽(3마리) 그림과 문장을 견준다 | 두 장면 나란히(360px 폭에서는 위아래), 문장 2개, 설명 2줄 | 없음(설명 단계) | 항상 열림 | `scene-compare*` | 카드 `scene-card-compare`, 칸 `scene-compare-0/1`, 문장 `scene-caption-0/1`, 🔊 `scene-listen-0/1` |
| 3 | 선택 (`choose`) ×3 | 그림을 보고 빈칸에 `is`/`are` 고른다 | 장면 1개, 빈칸 문장, 보기 2개 | 정답 번호·이유는 고르기 전 비노출 | 보기를 고르면 열림. 틀리면 [다시 풀기] | `scene-choose*` | 카드 `scene-card-choose`, 틀 `scene-frame`, 보기 `scene-opt-0/1`, 확인 `scene-check`, 결과 `scene-result`(`data-ok`), 이유 `scene-why`, 다시 풀기 `scene-retry` |
| 4 | 만들기 (`build`) | 나무 2그루를 공원 칸(4칸)에 놓는다. 끌어다 놓기, 또는 나무를 누른 뒤 칸을 누르기 | 나무 도구, 칸 4개, 빈칸 문장 `There are ___ trees.`, [확인] | 정답 문장은 [확인] 전 비노출. 판정은 **놓인 나무 수**로 한다 | [확인]을 누르면 열림. 2그루가 아니면 틀림 표시와 [다시 하기] | `scene-build*` | 카드 `scene-card-build`, 도구 `scene-tray-tree`, 칸 `scene-spot-0~3`, 개수 `scene-placed-count`, 다시 놓기 `scene-clear`, 틀 `scene-frame`, 숫자 보기 `scene-opt-j`, `scene-check`/`scene-result`/`scene-why`/`scene-retry`. 그림 `park-scene`의 `data-counts` |
| 5 | 읽기 (`read`) | 문장 3개를 알맞은 그림 3개와 잇는다(문장 고르고 그림 누르기) | 문장 버튼, 그림 버튼, 연결 상태 | 정답 연결은 [확인] 전 비노출 | [확인] 후 열림 | `scene-read*` | 카드 `scene-card-read`, 문장 `scene-sent-i`(정답 표시 `data-ok`), 그림 `scene-pic-j`, `scene-check`/`scene-result`/`scene-why`/`scene-retry` |
| 6 | 듣기 (`listen`) ×2 | 소리를 듣고 맞는 그림을 고른다 | 🔊 버튼, 그림 보기 3개 | **영어 문장은 확인 전 숨김**. 확인 뒤에 문장과 이유 표시 | 그림을 고르면 열림. 틀리면 다시 풀기 | `scene-listen*` | 카드 `scene-card-listen`, 재생 `scene-listen-play`, 그림 `scene-pic-j`, 확인 뒤에만 `scene-sentence`, `scene-check`/`scene-result`/`scene-why`/`scene-retry` |
| 7 | 말하기 (`speak`) | 내가 꾸민 공원을 보고 폴에게 한 문장으로 알린다 | 내 공원 그림, 상황 문구, 연습/시험 전환, 녹음 버튼(선택) | 연습: 모범 문장·모범 음성·힌트 표시. **시험: 영어 모범·음성·힌트를 [정답 보기] 전까지 숨김** | 연습은 [말해 봤어요]. 시험은 [말했어요] 후 [정답 보기]. 녹음은 필수 아님 | `scene-speak*` | 카드 `scene-card-speak`(연습·시험은 별개 카드, `mode`). 연습: `scene-model`, `scene-model-listen`, `scene-said`. 시험: `scene-reveal`(버튼 문구 "모범 답 보기"), 공개 뒤 `scene-model`, `scene-alternatives`. 녹음 `scene-record` 외 공용 녹음기 |
| 8 | 쓰기 (`write`) | 내 공원에 있는 것을 한 문장으로 쓴다 | 내 공원 그림, 입력칸, [내 공원과 비교] | 예시 문장은 비교 전 비노출 | 비교를 누르면 열림. 정답은 여러 개 허용 | `scene-write*` | 카드 `scene-card-write`, 입력 `scene-write-input`, 비교 `scene-write-compare`, 비교 뒤에만 `scene-write-example` |
| 9 | 마무리 (`finish`) | can-do 두 줄을 읽고 폴의 반응을 본다 | can-do 목록, 폴 이미지(`paulHappy` 등), 폴 한마디, 단원 목록 버튼 | 없음 | 마지막 화면이라 다음 없음 | `scene-finish*` | 카드 `scene-card-finish`, 본문 `scene-finish`, can-do `scene-cando-i`, 폴 말풍선 `scene-paul-bubble` |

공통 규칙
- 이전/다음 이동 시 학생의 답(선택, 놓은 나무, 입력문, 연결)을 그대로 복원한다. 상태는 덱과 같은 단원별 ref 맵에 두고 저장소에는 쓰지 않는다.
- 답 확인 뒤 정답과 이유를 같은 화면에 보여 주고, 학생이 다음을 눌러야 넘어간다. 자동 이동은 없다.
- 틀리면 [다시 풀기]가 나오고, 그 화면의 답만 지운다.
- 단계를 옮기거나 다시 풀 때 재생 중인 음성을 멈춘다(`stopSpeaking`). 음성이 겹치지 않아야 한다.
- 머리에 단계 이름, `n / 9`, 진행 막대를 둔다. 점수·별은 표시하지 않는다.

## 2. 데이터 구조

### 2.1 `scene` 필드

단원 데이터에 `scene` 객체를 추가한다. 없으면 기존 덱을 쓴다.

| 필드 | 의미 |
|---|---|
| `id` | 장면 id. 시범은 `'park'`. 에셋 매핑 키 |
| `titleKo`, `bgKo` | 장면 이름, 배경 설명(에셋 요청서에 사용) |
| `characters` | 등장 캐릭터 목록. 시범은 `['paul','cookie']` |
| `objects` | 물건 사전 `{키: {en, enPlural, ko}}`. 시범은 dog, tree, bench, ball. **모든 단계가 이 키만 쓴다** |
| `steps[]` | 9단계 배열. 각 항목은 `kind`와 `stepKo` 포함 |
| `layout` | 그림 구성 `[{obj, n}]`. 해당 물건을 n개 그린다 |
| `tap` | 발견 단계에서 누를 물건과 나올 문장 |
| `left`/`right` | 비교 단계의 두 장면과 문장 |
| `items[]` | 선택·듣기의 문제 목록. 선택은 `frame`, `options`, `correct`, `whyKo` |
| `place`, `slots` | 만들기에서 놓을 물건과 수, 칸 수 |
| `acceptEn[]` | 만들기·쓰기에서 허용하는 정답 표기 |
| `pairs[]` | 읽기에서 문장과 그림의 짝 |
| `practice`/`exam` | 말하기 연습과 시험. `modelEn`, `alternatives[]`, `situationKo` |
| `useMyPark` | true면 말하기·쓰기가 학생이 만든 공원을 기준으로 함 |
| `canDoKo[]`, `paulKo`, `rewardNoteKo` | 마무리 can-do, 폴 한마디, 보상 안내 문구 |

### 2.2 그림 개수와 문장 규칙

`layoutSentence(layout)`는 순수 함수이고, 그림과 문장이 어긋나지 않게 하는 유일한 기준이다.

| 그림 | 문장 | 예 |
|---|---|---|
| 물건 1개 | `There is a <en>.` | `There is a bench.` |
| 물건 n개(n≥2) | `There are <숫자말> <enPlural>.` | `There are two trees.` / `There are three dogs.` |

- 숫자말: 2=two, 3=three. 1은 `a`. 그 이상은 시범 범위 밖이다.
- 영어는 8단어 이하.
- `a`는 자음 시작 물건(dog, tree, bench, ball)에만 쓴다. 모음 시작 물건(apple 등)을 넣는 단원은 `an` 규칙을 먼저 추가해야 한다.
- 만들기 정답은 `answerEn` 고정이 아니라 **놓인 나무 수로 `layoutSentence`를 계산**해 판정한다. 나무 1그루면 `There is a tree.`, 3그루면 `There are three trees.`로 문장·판정이 함께 바뀐다. 교사 확인 사항 (1)에 해당.

### 2.3 `useMyPark` 연결

| 단계 | 내 공원이 쓰이는 방식 |
|---|---|
| 만들기 | 학생이 놓은 나무 수가 "내 공원"의 일부가 된다 |
| 말하기 | 상황 문구와 그림이 내 공원. 모범은 내 공원 `layoutSentence`로 계산(기본 `There are two trees.`) |
| 쓰기 | 내 공원에 있는 것이면 모두 정답. 허용 집합은 내 공원의 `layoutSentence`들과 `alternatives` |

만들기를 건너뛰고 말하기·쓰기로 직접 가면(이전/다음 이동 포함) 기본 공원(나무 2, 벤치 1, 강아지 1, 공 2 [제안])을 쓴다. 이 기본값은 구현자가 데이터로 둔다.

### 2.4 `validateScene` 검증 규칙

정적 스위트에서 모든 `scene`에 대해 확인한다.

| # | 규칙 |
|---|---|
| 1 | `steps`는 9개이고 `kind` 순서가 discover, compare, choose, build, read, listen, speak, write, finish |
| 2 | 모든 `layout`의 `obj`가 `objects`에 있음. n은 1 이상의 정수 |
| 3 | 모든 영어 문장이 `layoutSentence` 규칙과 일치(문장의 단수/복수·숫자·물건 이름이 그림과 같음) |
| 4 | 선택: `options`에 `correct` 인덱스가 존재하고 `frame`에 `___`가 1개. 정답 보기를 채운 문장이 그림과 일치 |
| 5 | 듣기: 오답 그림은 수 **또는** 물건 한 가지만 정답과 다름(교사 확인 사항 3). 정답은 1개뿐 |
| 6 | 읽기: 문장과 그림이 1:1. 같은 그림이 두 문장에 쓰이지 않음 |
| 7 | 만들기: `place.n ≤ slots`. `acceptEn`은 `layoutSentence(place)`를 포함 |
| 8 | 쓰기·말하기 `alternatives`는 모두 어느 `objects`로 만들 수 있는 문장 |
| 9 | 시험용 `exam`에는 한국어 해설·영어 모범이 화면에 기본 노출되는 필드가 없음 |
| 10 | 영어 문장 단어 수 ≤ 8, 한국어에 전문용어 없음 |

## 3. 기능 연결 (요청 ③)

### 3.1 한 단원 안의 연결 (시범)

모든 단계가 같은 `objects` 키와 같은 문장 규칙을 쓴다. 목표 표현 `There is/are …`가 아래처럼 다섯 번 다른 모양으로 다시 만난다.

| 문법 목표 표현 | 말하기 시험 | 쓰기 허용 집합 | 읽기 | 듣기 |
|---|---|---|---|---|
| `There is a …` (1개) | 내 공원 벤치·강아지 1개를 한 문장으로 | `There is a dog.` / `There is a bench.` | 문장 `There is a bench.` ↔ 벤치 1 | `There is a ball.` → 공 1 그림 |
| `There are two/three …s` (여러 개) | 내 공원 나무 2그루: `There are two trees.` | `There are two trees.` (`2` 표기도 허용) / `There are two balls.` / `There are three dogs.` | `There are two trees.` ↔ 나무 2, `There are three dogs.` ↔ 강아지 3 | `There are two trees.` → 나무 2 그림 |
| is/are 구분 이유 | 모범 음성은 [정답 보기] 뒤 | 쓰기 안내문이 선택 `whyKo`와 같은 규칙 | 짝이 모두 같은 규칙 | `whyKo`가 선택과 같은 규칙 |

### 3.2 다른 단원으로 확장할 때의 규칙

`scene`을 쓰는 단원의 데이터는 아래 항목을 반드시 선언한다. 비면 `validateScene`이 실패한다.

| 선언 항목 | 의미 |
|---|---|
| `theme` | 단원 상황(예: 공원) |
| `targetExpressions[]` | 목표 표현(문법 예문) |
| `structures[]` | 문장 구조(주어·동사·나머지) |
| `keyVocab[]` | 핵심 어휘(단어장 단원과 겹치는 것을 표시) |
| `skillLinks` | `{vocab, grammar, speaking, writing, reading, listening}` 각각 같은 단원의 해당 활동 id 또는 `null`(없으면 "준비 중" 명시) |

- 문법에서 배운 표현은 말하기·쓰기에서 **직접 쓰게** 하고, 읽기·듣기에서 **다시 만나게** 한다.
- 시범은 문법 단원 안에 읽기·듣기·말하기·쓰기 단계가 모두 들어 있다. 다른 단원은 기존 Voca/Speaking/Writing 활동으로 연결하는 `skillLinks`만 먼저 채우고, 새 활동은 만들지 않는다.
- 레벨 구성(Easy/Intermediate/Advanced/Middle/High)은 그대로 유지한다.
- 상황 소재: 어린 학습자(Easy)는 구체적인 그림과 짧은 문장(공원, 교실, 집). Middle/High는 학교생활·대화·뉴스 상황으로 확장한다. **Middle/High 장면은 이번 범위 밖이고 만들지 않았다.**

## 4. 세계관·디자인 규칙

| 항목 | 규칙 |
|---|---|
| 세계관 | 폴타운 공원. 폴과 쿠키(강아지)가 나온다 |
| 캐릭터 | 폴은 기존 `src/assets/paul/` PNG. 쿠키는 전용 그림이 없으므로 강아지 `animals/puppy`를 대역으로 쓴다 |
| 카드·버튼 | 덱의 `CARD` 상수(`bg-white rounded-3xl p-5 card-shadow`)와 같은 버튼 스타일을 재사용한다. 새 색·모서리 규칙을 만들지 않는다 |
| 크기 | 버튼 높이 최소 44px. 장면 그림은 최대 폭 360px, 가로 비율 고정. 같은 종류 물건은 같은 크기로 그린다 |
| 한 화면 한 과제 | 안내문 → 그림 → 입력/선택 → 확인 순서. 장식은 과제를 가리지 않는다 |
| 클릭 반응 | 눌린 물건을 강조(테두리·살짝 커짐), 아래에 자막(영어+한국어), 그 문장을 TTS 1회. 다른 물건을 누르면 이전 음성을 멈춘다 |
| 폴 반응 | 마무리에서 폴 이미지 + 짧은 한마디(`paulKo`). 오답에서는 `paulThinking`/`paulAlmost` 등 기존 이미지 + 이유 한 줄. 반응은 한 줄을 넘기지 않는다 |
| 진행 표시 | 머리에 단계 이름과 `n / 9`, 막대. 숫자는 횟수일 뿐 점수가 아니다 |
| 장식 제한 | 한 장면에 그림 요소는 과제에 쓰이는 물건 + 폴/쿠키 + 배경 1장까지. 움직이는 장식·소리·떠다니는 위젯을 추가하지 않는다. 배경은 단색 그라데이션(하늘·잔디) SVG |
| 작은 폰 | 360×640에서 가로 스크롤 없음. 다음/이전 버튼이 떠 있는 위젯에 가려지지 않음(덱의 하단 여백 규칙 재사용) |
| 접근성 | 모든 조작은 키보드(Tab, Enter/Space)로 가능. 끌어다 놓기는 "누른 뒤 놓을 곳 누르기"가 같은 결과를 낸다. 물건 버튼에 `aria-label`(예: "강아지 1마리") |

## 5. 에셋

### 5.1 지금 쓰는 실제 파일 [확인]

| 용도 | 파일 | 키/export |
|---|---|---|
| 나무 | `src/assets/town/nature/tree.webp` | `townAsset('nature/tree')` |
| 벤치 | `src/assets/town/decorations/bench.webp` | `townAsset('decorations/bench')` |
| 강아지, 쿠키 대역 | `src/assets/town/animals/puppy.webp` | `townAsset('animals/puppy')` |
| 폴 | `src/assets/paul/paul_happy.png` 외 | `paulHappy`, `paulThinking`, `paulAlmost`, `paulHello` 등 |

### 5.2 없는 것 (임시 SVG로 대체) [확인]

| 필요 | 현재 처리 |
|---|---|
| 공 | 임시 SVG 원 |
| 공원 배경(하늘·잔디) | 임시 SVG 그라데이션 |
| 쿠키 전용 그림 | `animals/puppy` 대역 |

### 5.3 운영자에게 요청할 파일 [제안]

| 파일 | 개수 | 내용 | 형식·크기 제안 |
|---|---|---|---|
| 쿠키 | 2 | 서 있는 포즈, 기쁜(꼬리 흔드는) 포즈 | 투명 배경 PNG 또는 WebP, 2x 해상도(표시 폭의 2배), 100KB 이하 |
| 공 | 1 | 공원 공 한 개(색은 단색) | 위와 같음 |
| 공원 배경 | 1 | 하늘 + 잔디 가로 장면. 글자 없음, 가운데는 비워 둠 | WebP, 폭 720px 이상, 100KB 이하 |
| 꽃(선택) | 0~1 | 장식. 없어도 미션은 완성됨 | 위와 같음 |

- 이미지에 영어·한국어 글자를 굽지 않는다(문장은 항상 UI 텍스트).
- 파일이 들어오면 `scene.id`에 해당하는 에셋 매핑만 바꾸고 컴포넌트는 고치지 않는다.
- 배포 후 없는 에셋은 임시 SVG로 폴백한다.

## 6. 보상·기록

| 항목 | 규칙 |
|---|---|
| 보상 | 기존 규칙(`REWARD_SOURCE_RULES`)만 쓴다. **새 보상 종류, XP, 모자 단계, DB 컬럼·테이블 없음** |
| 중복 지급 방지 | 마무리 화면에서 반복해서 들어와도 보상 요청은 기존 `dedupKey` 규칙에 맡긴다. 새 지급 코드를 만들지 않는다. 기존 문법 덱이 현재 보상을 요청하지 않으면 시범도 요청하지 않는다 [구현 시 코드 확인 필요] |
| 분석 | 필요하면 `trackEvent`(분석 전용, (이벤트, 학생, 날짜)당 세션 1회 dedupe)로 `scene_finish` 같은 이벤트만 남긴다. 보상·진행에 쓰지 않는다 [제안] |
| 저장 | 놓은 나무, 입력문, 선택은 저장하지 않는다(화면 상태만). 학생 식별은 `students.id` UUID이며 이름으로 매칭하지 않는다 |
| 표시 | "새 포인트는 없어요"를 마무리에 한 줄로 안내(`rewardNoteKo`) |

## 7. 학원 과정 연결

CURRICULUM_STAGES §10.1·§11 기준으로 사실만 적는다.

| 사실 | 구분 |
|---|---|
| Grammar의 다섯 과정(Easy, Intermediate, Advanced, Middle School, High School)은 **앱의 숙련도·학교 트랙**이다. 학원의 반 이름이 아니다 | [확인] |
| 학원 반 이름으로 관찰된 것은 Phonics, Conversation(1·2·4), Presentation(1·3·6), Pre-middle school, MS advanced, MS 중1~3뿐이다 | [확인] |
| Reading, Grammar, News Class라는 이름의 반은 코드·SQL·문서에서 관찰되지 않았다 | [확인] |
| Easy "There is / There are"가 어느 학원 반에 해당하는지 | [미확인] |
| 앱의 6과정(Phonics/Conversation/Presentation/Reading/Middle School/News Class)에서 Grammar는 과정이 아니라 각 과정 Unit 안의 연결이다 | [확인] (§10.1) |
| 이 단원을 6과정 중 어디의 "문형 관찰" 활동에 놓을지 | [제안] Conversation 쪽이 문형 관찰 위치가 되나, 어느 레벨(C1~C6)인지는 미정 |

- 이름이 비슷하다고 같은 것으로 단정하지 않는다(예: 앱의 C1~C6은 학원 Conversation 1~6이 아니다).
- 운영자에게 물을 것: 학원 어느 반 학생이 이 단원을 배우는가(반 이름 또는 번호). 확인 전에는 화면에 학원 반 이름을 표시하지 않는다.

## 8. 근거

`scene_refs.md`를 그대로 옮긴다. 검증 방법: 각 DOI의 Crossref API 서지 정보를 조회했다. 초록 본문은 1·4번만 요약본으로 확인했고 2·3번은 가져오지 못했다.

| # | 제목 | 저자 | 연도 | 학술지·권(호)·쪽 | DOI | 상태 | 초록에 적힌 핵심 결과 | 제품 판단 | 한계 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | TBLT implementation and evaluation: A meta-analysis | Bryfonski, L.; McKay, T. H. | 2019 (온라인 2017) | Language Teaching Research, 23(5), 603-632 | 10.1177/1362168817744389 | VERIFIED (Crossref) | 실제 교실의 장기 과제 중심 프로그램 52편 메타분석에서 다양한 학습 결과에 강한 긍정 효과(d = 0.93) | 낱낱의 연습보다 "꾸민 뒤 설명하기" 같은 과제를 중심 활동으로 삼는 근거로 쓸 수 있다 | 단기 과제 하나가 아니라 장기 프로그램 전체. 어린 학습자에 한정되지 않음. 결과·비교집단이 다양. 문법·그림에 특정되지 않음 |
| 2 | Computer-mediated glosses in second language reading comprehension and vocabulary learning: A meta-analysis | Abraham, L. B. | 2008 | Computer Assisted Language Learning, 21(3), 199-226 | 10.1080/09588220802090246 | VERIFIED (서지만). **초록 미확보** — 초록에서 결과를 인용하지 않음 | 인용하지 않음. 2차 자료(Boulton 2016, EUROCALL) 표에 어휘 d = 1.40(6편), 읽기 이해 d = 0.73(11편)이 있으나 원문 대조 안 됨 | 그림·멀티미디어 주석이 단어 뜻에 도움이 될 수 있다는 가장 가까운 L2 근거 | 주석 달린 읽기 환경, 대부분 나이 많은 학습자, 어휘·이해만(문법 아님). 초록 확인 안 됨 |
| 3 | Verbal redundancy in multimedia learning environments: A meta-analysis | Adesope, O. O.; Nesbit, J. C. | 2012 | Journal of Educational Psychology, 104(1), 250-263 | 10.1037/a0026147 | VERIFIED (서지만). **초록 미확보** | 초록에서 인용하지 않음. 검색 요약에 "음성+글이 음성만보다 낫고 선행지식이 낮은 학습자에게 이득"이라 되어 있으나 미검증 | 초보자에게 짧은 화면 글과 음성을 함께 주는 설계의 근거. 그림 자체가 아니라 글/음성에 대한 것 | 대부분 대학 단계 참가자. 일반 학습이지 L2 아님. 그림(멀티미디어) 원리를 직접 검증하지 않음. **Mayer의 멀티미디어 원리 자체는 1차 자료로 확인하지 못했다** |
| 4 | The critical importance of retrieval for learning | Karpicke, J. D.; Roediger, H. L. III | 2008 | Science, 319(5865), 966-968 | 10.1126/science.1152408 | VERIFIED (Crossref) | 외국어 어휘에서 학습 뒤 반복 공부는 지연 회상을 높이지 못했고, 반복 시험은 큰 이득을 냈다 | "보기 전에 말하거나 떠올리기"가 다시 읽기·다시 보기보다 낫다는 근거 | L2 문법도 아동도 아님. 스와힐리어-영어 40쌍, 대학생, 1주 지연, 피드백 없음. 어휘 회상만 |
| 5 | Effects of retrieval formats on second language vocabulary learning | Nakata, T. | 2016 (DOI 연도 2015) | International Review of Applied Linguistics in Language Teaching, 54(3), 257-289 | 10.1515/iral-2015-0022 | VERIFIED (Crossref) | 철자 같은 산출 지식에는 회상 형식이, 철자가 필요 없으면 재인 형식도 괜찮았다 | L2에서 회상은 산출에 도움이 되지만 산출이 목표가 아니면 재인으로 충분하다는 주의 | 영어권 대학생 64명, 스와힐리어-영어 카드, 어휘만. 아동·문법 아님. 학술지 이름이 이후 ITL로 바뀐 것은 확인 안 됨 |
| 6 | Li (2010) corrective feedback meta-analysis | Li, S. | 2010 | (다시 조회 안 함) | n/a | 리드가 이미 검증함. 다시 조회 안 함 | n/a | n/a | n/a |
| 7 | Lyster and Saito (2010) oral corrective feedback in classroom SLA | Lyster, R.; Saito, K. | 2010 | (다시 조회 안 함) | n/a | 리드가 이미 검증함. 다시 조회 안 함 | n/a | n/a | n/a |

- **찾지 못함**: 요청된 "Yun 2011" CALL 메타분석. 검색에서는 Yun의 하이퍼텍스트 주석 학위논문(연도·학술지본 미확인)과 Mohsen & Balakumar의 2011 ReCALL 서술적 리뷰(메타분석 아님, 조회 안 함)만 나왔고 둘 다 검증됨으로 올리지 않았다.
- 새로 확인한 출처는 5건이고 이미 검증된 2건은 목록에만 있다.

**제품 판단과 근거의 구분**
- 위 표의 "제품 판단" 열은 이 문서의 해석이지 논문의 주장이 아니다.
- **이 앱, 이 연령, 그림 문법 과제, "공원 꾸민 뒤 설명하기" 설계를 직접 검증한 연구는 없다.**
- 대부분 성인·대학생, 어휘 중심이라 어린 EFL 문법으로의 전이는 가정이다.
- 이 근거는 설계 선택의 일반적 지지로만 쓰고, 이 앱이 문법 실력을 올린다는 주장으로 쓰지 않는다.

## 9. 검증 계획

| # | 항목 | 확인 방법 | 결과 |
|---|---|---|---|
| 1 | 360×640 레이아웃 | 9단계 모두 가로 스크롤 없음, 다음/이전 버튼이 하단 위젯에 가려지지 않음, 버튼 44px 이상 | 서버 렌더 확인(모든 장면 카드 렌더)만. **브라우저 미실행(RAM <3GB)**. `[grammar-scene]` 스크린샷과 `[grammar]` g 360×640 3건(컴팩트 헤더 `c47b1e10` 포함) 대기 |
| 2 | 데스크톱(1280) 레이아웃 | 장면 최대 폭 360px 유지, 카드 가운데 정렬 | 브라우저 미실행(RAM <3GB). 1280 스크린샷 대기 |
| 3 | 답안 유지 | 선택·놓은 나무·연결·입력문이 이전/다음 왕복 뒤 그대로 | 정적: 답은 덱의 단원별 ref 맵(카드 id 키) 구조 확인. 동작은 브라우저 미실행(RAM). 시나리오는 `grammarScene.spec` 작성됨 |
| 4 | 다시 풀기 | 틀린 화면에서 [다시 풀기] 후 답이 지워지고 자동 이동 없음 | 정적: 다음 열림 조건이 `sceneCanAdvance`(확인·공개·비교 뒤)뿐. 동작은 브라우저 미실행(RAM) |
| 5 | 정답 노출 시점 | 듣기 영어 문장, 말하기 시험의 영어·모범 음성·힌트, 만들기·쓰기 정답이 확인 전에는 DOM에 없거나 숨김 | 서버 렌더 스모크: 확인·공개 전 영어 문장·모범 답 없음 확인(구현자). 코드상 `scene-sentence`·모범 답·`scene-write-example`은 조건부 렌더. 브라우저 DOM 단언은 미실행(RAM) |
| 6 | 그림 개수 = 문장 | 정적 스위트로 모든 `layoutSentence`와 화면 그림 수 일치. 나무 1·2·3그루 놓기 판정 | **정적 PASS**: `testGrammarCourses`의 `layoutSentence` 핀과 `buildFrame` 0/1/2/3 핀. 화면에서 놓기 동작은 브라우저 미실행(RAM) |
| 7 | 키보드 | Tab 순서, Enter/Space로 보기·칸·물건 조작, 끌기 없이 만들기 완료 | 정적: 물건 `role="button"`·`tabIndex`·`aria-label`, 칸도 같음. 키보드 동작은 브라우저 미실행(RAM) |
| 8 | 중복 보상 방지 | 마무리 반복 진입·새로고침에도 보상 요청이 기존 규칙으로 1회 | 구현 결정: 보상 요청 없음. 마무리는 분석 `trackEvent` 하나만(날짜당 dedup, 보상 종류·XP 없음). 브라우저 미실행 |
| 9 | 음성 중복 방지 | 물건 연속 클릭·단계 이동·다시 풀기 시 이전 음성 중단, 동시 재생 없음 | 브라우저 미실행(RAM). 스펙에 `speaksExactly`(발화 횟수·내용) 단언 작성됨 |
| 10 | `validateScene` | §2.4의 10개 규칙 정적 스위트 통과 | **정적 PASS**: `testGrammarCourses`(+15 장면 핀 포함), `testPilotUnit`, `testQaGate` 17/0, `testLazyChunkGuards` 95/95, `testBundleBudget` 32/32, `testRegistryCoverage`, `testStudentPathContracts` ALL PASS. 더미 env 빌드 경고 0 |
| 11 | 기존 덱 회귀 | `scene` 없는 33단원은 덱 그대로. `[grammar]`, `[unit]`, `[student-home]`, `[hats]` 재실행 | 정적 PASS(다른 33단원 덱 불변 핀). `[grammar]` h는 장면 단원을 건너뛰도록 수정됨. 회귀 5종 브라우저 재실행은 미실행(RAM) |

## 10. 변경 파일 / 남은 작업

| 항목 | 내용 |
|---|---|
| 변경 파일 | 커밋 `bd62cc15`: `src/utils/grammar/sceneMission.js`(validateScene·layoutSentence·countsMatch·sceneCards·buildFrame), `src/components/grammar/ParkScene.jsx`, `src/components/grammar/SceneCards.jsx`, `grammarDeck` 장면 경로(g-easy-05 덱 15장 = 목표 + 장면 13 + 요약), `GrammarCourseScreen` 연결, `App` studentId 전달(마무리 분석 이벤트), g-easy-05 단어 +10, 정적 스위트 핀. `e4e8edc6`: 만들기 카드 실시간 심기 안내(1..n-1그루) + 스펙 d 재작성. `58767b3f`: `tests/e2e/grammarScene.spec.mjs`(a~l), `grammar.spec` h 장면 단원 건너뜀. `18afbb35`: 이 문서 + CURRICULUM §13 포인터 |
| 남은 작업 | (1) RAM ≥3GB에서 브라우저 검증: `[grammar-scene]` a~l(360×640·1280 스크린샷 포함), `[grammar]` g 360×640 3건, 회귀 `[unit]`·`[hats]`·`[speaking]`·`[writing]`·`[student-home]`. (2) 운영자 에셋: 공원 배경, Cookie 전용 그림 2포즈, 공, 꽃(PNG/WebP 투명, 100KB 이하, 2×). 지금은 임시 SVG·강아지 대역. (3) 다른 단원에 `scene` 데이터만 추가해 확장. (4) 구현 결정 기록: 마무리는 보상 요청 없이 분석 이벤트 하나, 시험 공개 버튼 문구는 "모범 답 보기". 문서 쪽 미해결 항목: 교사 검수, 쿠키·공·배경 실제 그림(§5.3), 학원 반 대응(§7), 기본 공원 값(§2.3), 보상 요청 여부(§6), Middle/High 장면, 다른 Easy 단원 `scene` |

## 11. Scene v2 — 34단원 확장 (240차, 2026-10-10 13:10~14:00, 기준 `03d40a05`)

_§0~§10은 239차 시범(g-easy-05) 기록이고 그대로 둔다. 이 절부터는 기존 34단원 전부로 확장한 내용이다. 새 단원은 만들지 않았다._

**운영자 요청 요약**: 그림·상황 활동을 There is/are 시범에서 기존 34단원 전체로 확장. 그림은 단원 문법 뜻에 맞을 것. 과정별 차등(Easy = 구체적·누르기·고르기·놓기 / Intermediate·Advanced = 여러 장면 비교·대화·문장 만들기 / Middle·High = 학교생활·메시지·뉴스·시간표 + 짧은 글 설명). 한 장씩 덱과 공통 장면·비교·배치·타임라인·대화 컴포넌트를 재사용. 정답·문장은 그림에 굽지 않고 UI로. 개수·위치·시간 관계는 코드가 제어. 기존 문항·정답·피드백·진행 유지. 정답 노출·다의 해석 문항 점검. 임시 대체 가능 그림 + 필요 파일 목록. 34행 표. 임시 이미지 / 실제 에셋 / 브라우저 검증 분리 표기. 현재 브랜치·Preview, merge·배포·DB 없음.

### 11.1 데이터 스키마 v2 (동결본)

- 단원 `scene` = `{ id, mode, titleKo, bgKo, bg, characters, objects, steps }`. `mode: 'full'`은 시범 g-easy-05뿐(9단계, 덱 15장, 변경 없음). 나머지 33단원은 `mode: 'add'`.
- 배경 `bg`: park / home / school / street / plain. 등장 물건은 `scene.objects`에 선언하고 키는 `sceneProps.js`의 `PROPS`에서만 고른다.
- 배치 항목 `{ obj, n, size, at, ref, dist, action, neg, labelKo }`: 위치(`in`·`on`·`under`·`next to`·`behind`·`in front of`)는 `at`+`ref`로 쓰고 좌표는 코드(`layoutItems`)가 정한다. `dist` near/far, `size` s/m/l(크기비 1.5배 이상으로 보이게), `action`은 동작 배지(36종 + `like`), `neg: true`는 동작 배지 위 빨간 가위표(못 해요·안 좋아해요). `labelKo`는 이름·역할 같은 한국어 꼬리표뿐이다.
- 보기(view): `scene`(무대 1개) / `timeline`(2~4칸, 한국어 칸 이름, `focus`) / `dialogue`(말풍선 1~4줄, 실제 글자).
- 단계(step): `discover`·`compare`(설명 카드), `choose`·`build`(위치 모드: 물건을 ref 주변 칸에 놓기)·`read`·`listen`(활동 카드). `speak`·`write`·`finish`는 full 모드(시범) 전용이다.
- 과정별 영어 단어 상한: easy 7 / int·adv 9 / mid·high 12. 어휘 규칙: 장면 안 모든 영어는 FUNCTION_WORDS + NAME_WORDS + 단원 단어 + 장면 물건 이름으로만 구성. 부족한 단어는 단원별 `wordsAdd`로 추가한다.

### 11.2 파일 구성

| 파일 | 역할 |
|---|---|
| `src/utils/grammar/sceneProps.js` | 순수 데이터 레지스트리: 캐릭터·동물·물건(실제 Town 스프라이트 `asset` 또는 임시), 동작 배지 37종, `RELATIONS`, `BACKGROUNDS` |
| `src/utils/grammar/sceneMission.js` | `validateScene` v2(full/add 모드, 과정별 단어 상한, 어휘 규칙, 대화 `en`이 정답이 아닐 것, 듣기 보기 그림 쌍별 상이), `layoutItems` 기하(전치사·near/far·크기·같은 자리 분산), `relationSpots`·`positionFrame`(위치 만들기), `displayOrder`(add 모드 보기 순서 결정적 섞기) |
| `src/utils/grammar/scenes/{easy,int,adv,mid,high}.js` | 과정별 33단원 장면 데이터(`wordsAdd` 포함) |
| `src/utils/grammar/grammarUnits.js` | 장면 부착 + `wordsAdd` 병합 |
| `src/utils/grammar/grammarDeck.js` | add 모드 삽입 규칙(11.3) |
| `src/components/grammar/Stage.jsx` | 범용 인라인 SVG 무대: Town 스프라이트가 있으면 사용, 없으면 임시 SVG 도형. 동작 배지, `neg` 가위표, `in`일 때 윗면이 열린 통, 타임라인 칸(강조), 대화 말풍선(실제 글자), 모든 미니 무대 아래 한국어 범례(실제 글자) |
| `src/components/grammar/ParkScene.jsx` | `bg='park'` 얇은 래퍼(시범 testid 유지) |
| `src/components/grammar/SceneCards.jsx` | view별 카드 + 위치 만들기 |
| `scripts/testGrammarCourses.mjs` | 핀: 34/34 장면, `validateScene` 0 오류 ×34, `validateGrammarUnit` 0 오류 ×34, 기하, 덱 순서 |
| `tests/e2e/grammarScenes.spec.mjs` | `[grammar-scenes]` 일반 순회 스펙(`scripts/testBrowserE2E.mjs`에 등록). `[grammar]`도 add 모드 장면 카드를 순회 |
| `scripts/testBundleBudget.mjs` | 총 코드 예산 1.8 → 2.0 MB (11.4) |

커밋: `3b3c409e`(33단원 장면 데이터) · `6a8a5bb8`(v2 프레임워크) · `2b7643d6`(테스트).

### 11.3 덱 삽입 규칙 (add 모드)

목표 → 예시 → 설명… → 구조 → **[그림 설명 카드: 발견·비교]** → 비교 → 오류… → **[그림 활동 카드: 선택·만들기·읽기·듣기]** → 선택 → 빈칸 → 순서 → 만들기 → 활용 → 요약.
- 기존 카드·id·정답·피드백은 바뀌지 않는다. 장면 카드 id = `scene-<kind>-<i>`. `isPractice`는 장면 선택·듣기·만들기·읽기를 센다.
- 시범 g-easy-05는 mode 'full' 그대로: 15장, id·testid 동일.
- 다른 영역 연결: 읽기(그림 짝)·듣기(문장 듣기 버튼 또는 그림 고르기)는 장면 카드가 맡고, 말하기·쓰기는 기존 만들기·활용 카드가 같은 단원 단어를 쓴다(새 말하기·쓰기 장면 카드는 add 모드에 없다).

### 11.4 번들

`GrammarCourseScreen` lazy 청크 254.3 KB raw / 70.7 KB gzip(시범 시점 147.1 / 42.1 KB). 메인 청크 gzip 단언은 불변. 총 코드 예산은 장면 데이터 증가로 1.8 → 2.0 MB로 올렸다(`testBundleBudget` PASS).

### 11.5 클릭 경로

홈 [📘 문법 Grammar] → 과정 선택 → 단원 → 구조 카드 다음에 **그림 설명 카드**(발견·비교) → 오류 카드 다음에 **그림 활동 카드**(선택·배치·읽기·듣기) → 기존 연습 → 요약. 시범(Easy 5) 경로는 변경 없음.

## 12. 34단원 상태 표 (240차, 생성표 그대로)

_열 정의: 에셋 = 그 단원에서 쓰는 소품 수, 실제 = 폴타운 스프라이트·Paul PNG, 임시 = 임시 SVG 도형. "검증" 열은 정적 검증만이다. 브라우저 검증은 어느 단원도 하지 않았다._

| 단원 | 제목 | 시각 설명 | 그림 활동 | 장면 형식 | 다른 영역 연결 | 에셋 | 검증 |
|---|---|---|---|---|---|---|---|
| g-easy-01 | 부탁하기 Can I …? | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-easy-02 | 어디 있어? Where's | 발견(누르기) + 비교 | 선택 4, 위치 배치 | dialogue·scene | 읽기·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 5 | 정적 PASS · 브라우저 미실행 |
| g-easy-03 | 나는 …이야 am·is·are | 발견(누르기) + 비교 | 선택 4, 읽기 짝 4 | scene·dialogue | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 1 | 정적 PASS · 브라우저 미실행 |
| g-easy-04 | 할 수 있어요 can | 발견(누르기) + 비교 | 선택 4, 듣기 3 | scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 1 | 정적 PASS · 브라우저 미실행 |
| g-easy-05 | …이 있어요 There is | 발견(누르기) + 비교 | 선택 3, 개수 배치, 읽기 짝 3, 듣기 2 | scene | 읽기·듣기·말하기 연습/시험·쓰기 모두 장면 안 | 실제 3 / 임시 1 | 정적 PASS · 브라우저 미실행 |
| g-easy-06 | 좋아해요 I like | 발견(누르기) + 비교 | 선택 3, 읽기 짝 4 | scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-easy-07 | …해요? Do you …? | 발견(누르기) + 비교 | 선택 4, 듣기 2 | dialogue | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 2 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-easy-08 | 이것·저것 This is | 발견(누르기) + 비교 | 선택 5, 읽기 짝 4 | scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 2 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-int-01 | Is it …? 대답·되묻기 | 비교 | 선택 3, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-int-02 | 엄마는 …해요 | 발견(누르기) + 비교 | 선택 4, 읽기 짝 3 | scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 6 | 정적 PASS · 브라우저 미실행 |
| g-int-03 | 무엇을 좋아해? | 발견(누르기) + 비교 | 선택 2, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-int-04 | Can you …? 묻기 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-int-05 | 지금 …하고 있어요 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 4 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 6 | 정적 PASS · 브라우저 미실행 |
| g-int-06 | 위치 말 늘리기 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 4 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 3 / 임시 2 | 정적 PASS · 브라우저 미실행 |
| g-int-07 | 어제 있었던 일 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | timeline | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 3 / 임시 2 | 정적 PASS · 브라우저 미실행 |
| g-int-08 | Would you like …? | 발견(누르기) + 비교 | 선택 4, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-adv-01 | 계획 말하기 going to | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | dialogue·timeline | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 1 | 정적 PASS · 브라우저 미실행 |
| g-adv-02 | 비교하기 | 발견(누르기) + 비교 | 선택 3, 듣기 2 | scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 3 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-adv-03 | because·so 잇기 | 발견(누르기) + 비교 | 선택 4, 읽기 짝 3 | dialogue·timeline | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-adv-04 | when·if 잇기 | 발견(누르기) + 비교 | 선택 3, 듣기 2 | dialogue·timeline·scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 2 / 임시 5 | 정적 PASS · 브라우저 미실행 |
| g-adv-05 | should·have to | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-adv-06 | 해 본 적 있어요 | 발견(누르기) + 비교 | 선택 3, 듣기 2 | timeline·dialogue·scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 2 / 임시 2 | 정적 PASS · 브라우저 미실행 |
| g-mid-01 | 시제 정리 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | timeline·scene·dialogue | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 2 | 정적 PASS · 브라우저 미실행 |
| g-mid-02 | 조동사 can·may·must | 발견(누르기) + 비교 | 선택 3, 듣기 3 | dialogue·scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 0 / 임시 7 | 정적 PASS · 브라우저 미실행 |
| g-mid-03 | 수동태 기초 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 5 | 정적 PASS · 브라우저 미실행 |
| g-mid-04 | 관계대명사 who·which | 발견(누르기) + 비교 | 선택 4, 읽기 짝 3 | dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 1 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-mid-05 | 분사로 꾸미기 | 발견(누르기) + 비교 | 선택 4, 읽기 짝 3 | scene·dialogue | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 2 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-mid-06 | 조건문 if | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | timeline | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(말하기)가 같은 단원 단어 사용 | 실제 2 / 임시 4 | 정적 PASS · 브라우저 미실행 |
| g-high-01 | 완료 시제 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | timeline·dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(쓰기)가 같은 단원 단어 사용 | 실제 2 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-high-02 | 수동태 심화 | 발견(누르기) + 비교 | 선택 3, 읽기 짝 3 | timeline·dialogue·scene | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(쓰기)가 같은 단원 단어 사용 | 실제 0 / 임시 6 | 정적 PASS · 브라우저 미실행 |
| g-high-03 | 관계사 심화 | 발견(누르기) + 비교 | 선택 4, 듣기 2 | dialogue·scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(쓰기)가 같은 단원 단어 사용 | 실제 2 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-high-04 | 가정법 | 발견(누르기) + 비교 | 선택 3, 듣기 1 | dialogue·scene·timeline | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(쓰기)가 같은 단원 단어 사용 | 실제 2 / 임시 3 | 정적 PASS · 브라우저 미실행 |
| g-high-05 | 간접화법 | 발견(누르기) + 비교 | 선택 4, 읽기 짝 3 | dialogue | 읽기(그림 짝)·듣기(문장 듣기 버튼) + 기존 만들기·활용 카드(쓰기)가 같은 단원 단어 사용 | 실제 1 / 임시 1 | 정적 PASS · 브라우저 미실행 |
| g-high-06 | 분사구문 | 발견(누르기) + 비교 | 선택 3, 듣기 2 | timeline·scene | 읽기·듣기(그림 고르기) + 기존 만들기·활용 카드(쓰기)가 같은 단원 단어 사용 | 실제 2 / 임시 2 | 정적 PASS · 브라우저 미실행 |

**임시 소품 31종(사용 중)**: apple, bag, ball, bed, bike, board, book, box, cake, car, chair, clock, dad, desk, door, homework, key, kid, medal, mia, milk, mom, money, pencil, phone, pizza, teacher, tom, tv, umbrella, window
**실제 스프라이트 소품 7종**: bench, cat, dog, house, paul, school, tree

**상태 3분리 (혼동 금지)**

| 구분 | 현황 |
|---|---|
| 임시 이미지 적용 | 34/34 단원(일부는 실제 Town 스프라이트 포함) |
| 실제(최종) 에셋 적용 | 0/34 단원. 소품 단위로는 7종(bench·cat·dog·house·paul·school·tree)만 실제, 사용 중인 31종은 임시 SVG |
| 브라우저 검증 | 0/34 단원 (이번 라운드 e2e 전혀 미실행) |
| 교사 검수 | 0/34 |

## 13. 필요한 에셋 파일 목록 (240차)

공통 규격: PNG 또는 WebP 투명 배경, 2×, 파일당 100 KB 이하, 글자를 굽지 않는다(영어·한글 모두). 교체 방법: `sceneProps.js`의 해당 `PROPS` 항목에 `asset`을 추가하거나(동작 배지는 글리프 맵 교체) 하면 되고 **단원 데이터는 바꾸지 않는다**. 아래 파일 이름 = PROPS 키 + 확장자(`Stage.jsx` 상단 `TODO assets` 주석과 같은 규칙).

**A. 지금 쓰는 임시 소품 31종 (우선순위 높음)**
- 캐릭터(7): mia, tom, mom, dad, teacher, kid, (Paul은 기존 PNG라 불필요)
- 물건(24): apple, bag, ball, bed, bike, board, book, box, cake, car, chair, clock, desk, door, homework, key, medal, milk, money, pencil, phone, pizza, tv, umbrella, window

**B. 레지스트리에 있으나 아직 단원에서 안 쓰는 임시 소품 20종 (필요해질 때)**
- 캐릭터(2): grandma, driver
- 동물(2): bird, fish
- 물건(16): cup, bus, table, hat, letter, egg, map, guitar, kite, computer, ticket, gift, shoes, jacket, newspaper, trophy

**C. 동작 배지 37종 (현재 이모지 임시)**: `ACTIONS` 전체 — run walk read eat drink sleep play sing swim cook study write draw clean sit jump dance talk ride wash open close watch listen cry laugh wait think buy call drive paint fix help carry wave like. 사용 중인 배지부터 교체하면 된다.

**D. 배경 5장**: park(하늘·잔디·길), home(거실 벽·바닥·창문), school(칠판·교실 바닥), street(건물·인도·도로), plain(부드러운 그라데이션). 지금은 임시 SVG 도형.

**E. Cookie 전용 그림**: 지금은 Town 강아지(puppy) 스프라이트가 Cookie 대역이다. 전용 강아지 그림 2포즈(239차 요청 그대로)를 받으면 교체한다.

실제 스프라이트가 이미 있어 추가 에셋이 필요 없는 소품: tree, bench, flower, lamp, postbox, fountain, house, school, cafe, shop, bridge, tower, dog, cat, owl, paul.

## 14. 검수에서 고친 것과 남은 한계 (240차)

### 14.1 검수 방식

데이터 작성(과정별 에이전트 5명 + 프레임워크 구현자 1명 병렬) 뒤, 엄격한 교사 관점의 독립 검수 3건(Easy / Intermediate·Advanced / Middle·High)이 실제 결함을 찾았고 데이터 또는 렌더러에서 고쳤다. 수정 뒤 검증기 34/34 재실행 통과. 이 검수는 AI 검수이며 **교사 검수가 아니다(0/34)**.

### 14.2 고친 것

| 유형 | 예 | 조치 |
|---|---|---|
| 답이 둘 이상으로 해석됨 | behind vs next to가 비슷하게 그려짐, "have played" 오답 보기가 여전히 참, easy-03 읽기 그림이 서로 구분 불가, easy-02 "in the chair"도 자연스러움, int-03 "What are you like?"도 문법적, high-05 보기 중 둘이 문법적 | 렌더러에서 behind·in·크기 겹침·같은 자리 기하 수정, 보기와 그림을 데이터에서 교체 |
| 답이 질문 문구·꼬리표로 새어 나감 | int-01·04·08(promptKo가 사실을 말함), easy-04·06(can't·don't like가 라벨에만 있음), adv-05의 `to`가 `have`를 알려 줌 | promptKo를 사실 진술 없는 문구로, 사실은 대화 줄·칸 이름으로, 부정은 `neg` 빨간 가위표로 이동 |
| 잘못된 규칙 진술 | easy-03 "한 명 = am/is, 여럿 = are", mid-01 "현재 = 지금 하는 중", high-04 "현실은 not" | 설명 문장 교체 |
| 범위 밖 내용 | easy-08의 these/those | this/that만 남기고 제거 |
| 읽기 어려운 라벨 | 미니 그림 안 작은 라벨 | 모든 미니 무대 아래 한국어 범례(실제 글자) 추가. 답을 정하는 사실은 칸 이름·대화 줄에 둠 |
| 보기가 늘 같은 위치 | 정답이 0번에 몰림 | `displayOrder`로 결정적 섞기(선택 카드) |
| 기타 | mid-01 읽기 그림 동일, mid-02 듣기가 명사 찾기, mid-03/05/06 그림 보강, high-06 두 사건이 동시로 보임 | 그림·대사 보강 |

### 14.3 알려진 한계 (남김)

- **adv-04**: 그림만으로는 when과 if를 가를 수 없다. 문항은 동사 형태를 묻는다.
- **adv-05**: should와 have to의 구분은 한국어 줄의 '꼭'에 기댄다.
- **mid·high 일부 틀**: 틀 안의 명사로도 풀 수 있다. 그림은 돕지만 결정하지는 않는다.
- **반복 문장**: 설명 카드와 활동 카드에 같은 문장이 반복되는 곳이 있다.
- **날씨·상태 소품 없음**: 비는 우산 + 한국어 라벨로 표시한다.
- **Cookie**: 여전히 Town 강아지 대역.
- **교사 검수**: 0/34.
- **브라우저 검증**: 0/34. 레이아웃·탭·끌기·음성·360×640 동작은 확인하지 않았다.

### 14.4 검증 (240차)

- **정적 PASS**: 더미 env 빌드 경고 0. `testGrammarCourses` ALL PASS(장면 단원 34/34, `validateScene` 0 오류 ×34, `validateGrammarUnit` 0 오류 ×34). `testQaGate` 17/0. `testBundleBudget` PASS(2.0 MB 상한). `testLazyChunkGuards` 95/95. `testPilotUnit`·`testRegistryCoverage`·`testStudentPathContracts` ALL PASS. 3개 스펙 `node --check` 통과.
- **서버 렌더 스모크(구현자)**: 34단원 장면 카드 232장이 throw 없이 렌더. 확인 전 듣기 영어 없음, NaN/undefined 없음, `neg` 가위표 7장, 통 앞벽 6장, 타임라인 카드에 범례 있음.
- **브라우저: 미실행**. 사유: 여유 RAM 2.04 GB로 3 GB 규칙 미만(메모리는 운영자의 다른 앱이 점유, 남은 테스트 프로세스 아님).
- **대기**: RAM ≥3GB에서 `[grammar-scenes]`(34단원 360×640 + 5단원 1280, 스크린샷 `scenes-<id>-explain/practice.png`), `[grammar-scene]`, `[grammar]`, 회귀. 이어서 스크린샷 전부를 눈으로 보고 그림 명확성 확인 → 34단원 교사 검수 → 운영자 에셋.
