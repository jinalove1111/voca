# 폴 선생님(Project Paul 마스코트) 아이콘 자리

여기에 아래 파일명 그대로 **투명 배경 PNG**를 넣으면, 코드 수정 없이 앱 전체에 바로 반영됩니다
(`src/utils/paulReactions.js`가 이 경로들을 이미 참조하고 있고,
`PaulReaction.jsx`가 로드 실패 시에만 이모지로 대체 표시하기 때문).

## 필요한 파일 15개

| 파일명 | 쓰이는 상황 |
|---|---|
| `paul_happy.png` | 정답(랜덤) |
| `paul_best.png` | 정답(랜덤) |
| `paul_perfect.png` | 정답(랜덤) |
| `paul_great.png` | 정답(랜덤) |
| `paul_excellent.png` | 정답(랜덤) |
| `paul_levelup.png` | 레벨업/보스 단어 클리어 |
| `paul_thinking.png` | 쓰기 시험 1번째 오답 |
| `paul_almost.png` | 쓰기 시험 2번째 오답 |
| `paul_retry.png` | 쓰기 시험 3번째 오답('발음 듣기' 버튼 안내) |
| `paul_sad.png` | 쓰기 시험 4번째 오답(정답 공개) / 오답(랜덤) |
| `paul_cry.png` | 오답(랜덤) |
| `paul_welcome.png` | 인사/시작 |
| `paul_study.png` | 인사/시작 |
| `paul_cheer.png` | 인사/응원 |
| `paul_love.png` | 인사/응원 |

## 권장 사양

- 정사각형, 최소 256×256px 이상(더 크면 자동으로 축소돼서 화질 저하 없음)
- 배경은 반드시 투명 PNG (알파 채널 포함)
- 얼굴/모자/스타일은 공식 캐릭터 그대로 — 새 캐릭터를 만들지 않음

## 파일이 아직 없을 때

`PaulReaction.jsx`는 이미지 로드에 실패하면 자동으로 큰 이모지로 대체
표시합니다(예: `paul_thinking.png`가 없으면 🤔). 그래서 이 폴더가 비어
있어도 앱은 정상 동작합니다 — 실제 PNG가 준비되는 대로 여기 넣기만
하면 됩니다.
