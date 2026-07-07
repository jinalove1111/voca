// Project Paul 공식 브랜드 캐릭터 — 단일 Asset Library.
//
// 여기서만 실제 PNG 파일을 import한다. 다른 곳(PaulReaction, paulReactions.js
// 등)은 전부 이 파일의 named export만 가져다 쓴다 — 그래야 파일 위치나
// 이름이 바뀌어도 고칠 곳이 이 파일 하나뿐이고, Reading/Grammar/Speaking/
// Diary 등 앞으로 나올 다른 앱에서도 이 폴더(src/assets/paul/)와 이 index.js
// 하나만 통째로 재사용할 수 있다.
//
// 정적 import이므로(Vite가 빌드 타임에 해시된 URL로 치환) 여기 없는 이름은
// 나머지 코드에서 절대 참조할 수 없다 — 즉 "이미지가 없으면 그냥 조용히
// 실패"가 아니라 "애초에 그 캐릭터 자체가 시스템에 존재하지 않는" 상태가
// 되도록 강제된다. 아직 없는 캐릭터(celebrate/star/retry/cheerup/its_ok/
// fight/writing/speaking/good_job/brand/birthday/super/astronaut/detective/
// magician/professor/sports/artist/chef/musician/ninja)는 실제 개별 PNG가
// 추가되는 대로 이 파일에 한 줄씩만 추가하면 됨.
export { default as paulHappy } from './paul_happy.png'
export { default as paulBest } from './paul_best.png'
export { default as paulPerfect } from './paul_perfect.png'
export { default as paulGreat } from './paul_great.png'
export { default as paulExcellent } from './paul_excellent.png'
export { default as paulLevelup } from './paul_levelup.png'

export { default as paulThinking } from './paul_thinking.png'
export { default as paulAlmost } from './paul_almost.png'
export { default as paulSad } from './paul_sad.png'
export { default as paulCry } from './paul_cry.png'
export { default as paulSorry } from './paul_sorry.png'
export { default as paulOneMore } from './paul_one_more.png'

export { default as paulHello } from './paul_hello.png'
export { default as paulLetsLearn } from './paul_lets_learn.png'
export { default as paulStudy } from './paul_study.png'
export { default as paulReading } from './paul_reading.png'
export { default as paulLove } from './paul_love.png'
