# 폴 선생님(Project Paul 마스코트) 아이콘 자리

여기에 아래 파일명 그대로 **투명 배경 PNG**를 넣으면, 코드 수정 없이 앱 전체에 바로 반영됩니다
(`src/utils/paulReactions.js`가 이 경로들을 이미 참조하고 있고,
`PaulReaction.jsx`가 로드 실패 시에만 이모지로 대체 표시하기 때문).

## 필요한 파일 28개 (기획안의 Success/Retry/Etc 폴더 구성 그대로)

### Success (정답/레벨업/축하)

| 파일명 | 쓰이는 상황 |
|---|---|
| `paul_happy.png` | 정답(랜덤) |
| `paul_best.png` | 정답(랜덤) |
| `paul_perfect.png` | 정답(랜덤) |
| `paul_great.png` | 정답(랜덤) |
| `paul_excellent.png` | 정답(랜덤) |
| `paul_levelup.png` | 레벨업/보스 단어 클리어(고정 지정) |
| `paul_celebrate.png` | 미션 완료 계열(랜덤) |
| `paul_star.png` | 정답(랜덤) |

### Retry (오답이지만 혼내지 않음)

| 파일명 | 쓰이는 상황 |
|---|---|
| `paul_thinking.png` | 쓰기 시험 1번째 오답(고정 지정) |
| `paul_almost.png` | 쓰기 시험 2번째 오답(고정 지정) |
| `paul_retry.png` | 쓰기 시험 3번째 오답 — '발음 듣기' 버튼 안내(고정 지정) |
| `paul_cheerup.png` | 격려 계열(랜덤) |
| `paul_its_ok.png` | 실패 인정 계열(랜덤) |
| `paul_sad.png` | 쓰기 시험 4번째 오답 — 정답 공개(고정 지정) |
| `paul_cry.png` | 실패 인정 계열(랜덤) |
| `paul_sorry.png` | 실패 인정 계열(랜덤) |
| `paul_one_more.png` | 격려 계열(랜덤) |
| `paul_fight.png` | 격려 계열(랜덤) |

### Etc (인사/모드 안내/특별한 날)

| 파일명 | 쓰이는 상황 |
|---|---|
| `paul_hello.png` | 인사 |
| `paul_lets_learn.png` | 학습 시작 |
| `paul_study.png` | 공부 중 |
| `paul_love.png` | 응원 |
| `paul_good_job.png` | 미션 완료 계열 |
| `paul_birthday.png` | 생일 등 특별한 날 |
| `paul_reading.png` | 듣기 모드 |
| `paul_writing.png` | 쓰기 모드 |
| `paul_speaking.png` | 말하기 모드 |
| `paul_mission.png` | 미션 완료 계열 |

## 사용 방법 (개발자용)

```jsx
import PaulReaction from './components/PaulReaction'

// 방법 1: 폴더/카테고리 또는 정확한 id를 type으로 바로 지정 — 마운트 시 자동 랜덤
<PaulReaction type="success" />   {/* success 폴더 8개 중 랜덤 */}
<PaulReaction type="retry" />     {/* retry 폴더 10개 중 랜덤 */}
<PaulReaction type="thinking" />  {/* 정확히 paul_thinking 고정 */}
<PaulReaction type="levelup" />   {/* 정확히 paul_levelup 고정 */}
<PaulReaction type="fail" />      {/* retry 폴더 중 실패 인정 계열(its_ok/sad/cry/sorry)만 */}
<PaulReaction type="encourage" /> {/* retry 폴더 중 격려 계열만 */}
<PaulReaction type="complete" />  {/* 미션완료 계열(celebrate/good_job/mission) */}

// 방법 2: 직접 뽑아서 상태로 들고 있기(정답/오답이 나온 그 순간에만 한 번 뽑고,
// 리렌더링돼도 안 바뀌어야 하는 기존 화면들 — 퀴즈/쓰기/레벨업미션 등)
import { pickReaction } from './utils/paulReactions'
const reaction = pickReaction('success')
<PaulReaction reaction={reaction} />
```

같은 캐릭터·같은 메시지가 연속으로 반복되지 않도록 이미지와 메시지 모두
각자 독립적으로 "직전과 다른 것" 규칙을 따릅니다.

## 권장 사양

- 정사각형, 최소 256×256px 이상(더 크면 자동으로 축소돼서 화질 저하 없음)
- 배경은 반드시 투명 PNG (알파 채널 포함)
- 얼굴/모자/스타일은 공식 캐릭터 그대로 — 새 캐릭터를 만들지 않음

## 파일이 아직 없을 때

`PaulReaction.jsx`는 이미지 로드에 실패하면 자동으로 큰 이모지로 대체
표시합니다(예: `paul_thinking.png`가 없으면 🤔). 그래서 이 폴더가 비어
있어도 앱은 정상 동작합니다 — 실제 PNG가 준비되는 대로 여기 넣기만
하면 됩니다.
