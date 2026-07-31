# Audio/TTS Volume — 기술 분석 및 권고 (분석 전용)

_작성: 2026-07-30. **코드 미변경 — 이 문서는 분석/권고만이다.** 문제: 학생이
어휘 연습 중 단어 오디오를 여러 번 반복 재생하고, 교사가 같은 목소리 반복을
거슬려 하며, 시스템 볼륨만으로는 TTS 볼륨을 충분히 낮출 수 없다._

핵심 코드: `src/utils/speech.js`(오디오/TTS 단일 모듈), 호출부
`src/components/WordDetail.jsx`, 설정 UI `src/App.jsx`. 회귀 게이트:
`npm run verify:audio-tts`(`tests/harness/runAudioTts.mjs`) +
`scripts/testTtsSingleton.mjs`.

---

## 요약 (한 문단)

단어 발음은 **3-tier**로 재생된다: ① 사전 생성 저장 MP3(Supabase Storage,
주 경로) → ② 기기 speechSynthesis → ③ 네트워크 TTS(Google). **세 경로 모두
볼륨이 `1`(최대)로 하드코딩**돼 있고(`speech.js:239`, `:414`), 앱에는
**볼륨 조절 수단이 전혀 없다** — 사용자 조절 가능한 것은 **속도(rate)뿐**
(`getSpeechRate`, per-device localStorage). 따라서 볼륨을 낮추는 유일한
레버가 OS 시스템 볼륨이고, 그건 성공효과음·리액션·타 앱까지 전부 같이
낮춘다("시스템 볼륨만으론 부족"의 정확한 원인). 게다가 저장 MP3는 단어당
**바이트 동일한 단일 목소리**라 재생할 때마다 완전히 똑같아 반복이 최대로
거슬린다. 그리고 발음 스텝은 이 MP3를 **자동 3회 연속 재생**한다
(`WordDetail.jsx:259`, `times:3`) + 수동 재생 버튼(`:232`).

---

## 1. TTS 오디오 볼륨이 제어되는 곳

| 경로 | 위치 | 현재 값 | 제어 API |
|---|---|---|---|
| 저장 MP3(주 경로) | `speech.js:239` `audio.volume = 1` | 1(최대) | `HTMLMediaElement.volume`(0~1) |
| 기기 speechSynthesis(tier 2) | `speech.js:414` `u.volume = 1` | 1(최대) | `SpeechSynthesisUtterance.volume`(0~1) |
| 네트워크 TTS(tier 3) | `playAudioUrl`→`:239` 경유 | 1(최대) | `HTMLMediaElement.volume` |
| 성공효과음 | `speech.js:48` | 0.75 | `HTMLMediaElement.volume` |
| Paul 리액션 음성 | `paulReactions.js:190` | 0.75 | `HTMLMediaElement.volume` |

- **단어/예문 오디오(학생이 반복하는 그 소리)는 전부 볼륨 1 하드코딩.**
  사용자·앱 레벨 조절 지점 없음. 조절 가능한 유일 파라미터는 **속도**
  (`RATE_KEY`, `App.jsx:125` RATE_OPTIONS 버튼, per-device localStorage).
- 즉 볼륨 축은 OS 시스템 볼륨 하나뿐 → 학생 오디오만 상대적으로 줄일
  수단이 없다.

## 2. speechSynthesis 볼륨을 독립적으로 제어할 수 있는가

**예 — 단, 주 경로가 아니다.** `SpeechSynthesisUtterance.volume`은 0.0~1.0
독립 속성이라 시스템 볼륨과 별개로 낮출 수 있다(현재 `:414`에서 1로 고정).
그러나 **주 재생 경로는 저장 MP3(tier 1)**이고, 그건 speechSynthesis가
아니라 `HTMLMediaElement.volume`(`:239`, 역시 0~1 독립 속성)로 제어된다.
- 데스크톱/Android: **두 속성 다 독립적으로 낮추면 즉시 반영**된다.
- **iOS: 둘 다 신뢰 불가**(§5). `HTMLMediaElement.volume`은 iOS에서 무시되고,
  iOS speechSynthesis 볼륨도 버전에 따라 무시된다.
- 결론: "speechSynthesis 볼륨 독립 제어 가능?" → 원론적으로 예지만, **이
  앱에서 실효를 보려면 tier 2가 아니라 tier 1(저장 MP3)의 볼륨을 낮춰야**
  하고, 그건 데스크톱/Android에서만 `.volume`로 통한다.

## 3. per-user/device 볼륨 슬라이더로 저장해야 하는가

**per-DEVICE(localStorage) 권고 — per-user 동기화는 부적절.**
- 근거: 이 불만은 **환경적**(교실 기기/스피커가 큼)이지 학생별 학습
  선호가 아니다. 통제 주체도 교실 기기를 쥔 **교사**다. 학생이 기기를
  바꿔가며 쓰거나 한 교실을 공유하는 상황에선 per-device가 맞다.
- **기존 선례와 정확히 동형**: 속도(rate)가 이미 per-device localStorage
  (`getSpeechRate`/`setSpeechRate`, `RATE_KEY`)로 저장된다. 볼륨도
  `getSpeechVolume`/`setSpeechVolume`(`paulEasyVoca_speechVolume`, 기본 1.0)로
  같은 패턴을 따르면 된다. UI도 `App.jsx`의 속도 버튼(`:125~137`) 옆에
  나란히 두면 자연스럽다.
- **기본값 1.0 = 현재 동작** → 도입해도 회귀 0(순수 가산적 곱).

## 4. 반복 재생에 spacing / variation / teacher-mode mute가 필요한가

- **Spacing**: 이미 있다 — `playAudioUrl`의 반복은 `setTimeout(…, 400)`
  (`:246`), `playRepeating`은 `gapMs=400`(`:356`). 다만 거슬림의 원인은
  "한 번의 재생 내 반복 간격"이 아니라 (a) 발음 스텝의 **자동 3회**
  (`WordDetail.jsx:259` `times:3`) + (b) 학생이 재생 버튼(`:232`)을 여러 번
  누르는 것이다. 학생 수동 재생 간격은 제어 대상이 아니다. → spacing은
  이미 충분, **새로 필요 없음**. (다만 `times:3` 자동 반복 횟수는 학습설계/
  제품 판단 여지 있음 — §better.)
- **Variation**: 저장 MP3는 단어당 단일 파일이라 **매 재생 바이트 동일** →
  반복이 최대로 거슬린다. 진짜 variation은 (i) 목소리 변형 여러 벌 사전
  생성(스토리지 비용) 또는 (ii) live TTS pitch/rate 랜덤화(비용/복잡도)
  필요 → **베타 후, 사실상 신규 기능**이므로 지금 만들지 않음.
- **Teacher-mode mute**: 별도 teacher 모드는 없다. 가장 가벼운 형태 =
  §3의 per-device 볼륨을 0까지 내리는 것(=음소거) 또는 mute 토글. **단
  하드 뮤트는 발음 학습(듣고→따라 말하기) 자체를 깨뜨릴 위험**이 있어
  (§risk), "완전 뮤트"보다 "볼륨 다운"을 기본 레버로 권고.

## 5. 모바일 동작 (가장 중요한 제약)

| 플랫폼 | `HTMLMediaElement.volume`(저장 MP3) | `Utterance.volume`(speechSynthesis) |
|---|---|---|
| 데스크톱 | ✅ 반영 | ✅ 반영 |
| Android Chrome | ✅ 반영 | ✅ 반영 |
| **iOS Safari/WebView** | ❌ **무시(하드웨어 버튼만)** | ⚠️ 버전별 불안정 |

- **iOS 핵심 제약**: iOS는 `<audio>`/`<video>`의 `.volume` 프로그램 설정을
  **무시**한다(Apple 정책 — 하드웨어 볼륨 버튼만). 따라서 `audio.volume =
  0.5`가 **iPhone/iPad에서 저장 MP3에 아무 효과 없음**. → 단순 볼륨 곱
  quick fix는 **Android/데스크톱에서만 통하고 iOS에선 무효**.
- iOS에서 프로그램적 볼륨을 걸려면 **Web Audio API(AudioContext →
  decodeAudioData → GainNode → destination)** 경로로 재생해야 한다(GainNode는
  iOS에서 동작). 이건 저장-MP3 재생 경로(`new Audio(url)`)의 **재작성**이라
  베타 후 과제(§better, §risk).
- 참고: 이 모듈은 이미 다수 모바일 특이사항을 처리 중 — AudioContext 언락
  (`unlockAudio`, 사용자 제스처 필요), voices 비동기 로드(`voiceschanged`),
  `primeSpeech`, Android cancel 버그(`safeCancelSpeech`), iOS 백그라운드
  후 speechSynthesis 재개(`:137`). **회귀 민감 구역**(과거 echo/StrictMode/
  언락 버그 이력이 주석에 상세) — 어떤 변경도 harness + 실기기 테스트 필수.

---

## 권고 — 우선순위별

### 🟢 Quick fix (베타 전, 저위험)

**per-device 볼륨 곱 도입** — 속도(rate)와 정확히 같은 패턴:
1. `speech.js`에 `getSpeechVolume`/`setSpeechVolume`(`paulEasyVoca_
   speechVolume`, 기본 1.0) 추가.
2. `:239` `audio.volume = getSpeechVolume()`, `:414` `u.volume =
   getSpeechVolume()`로 교체(기본 1.0 → 회귀 0).
3. `App.jsx` 속도 버튼(`:125~137`) 옆에 작은 볼륨 스텝퍼/슬라이더(예:
   100/70/40%). 라벨에 iOS 한계 안내.
- **효과**: Android/데스크톱(교실 태블릿 다수)에서 즉시 학생 오디오만
  독립적으로 낮춤. 성공효과음/리액션(0.75)과 별개로 단어 오디오 조절.
- **한계**: iOS 저장-MP3엔 무효(§5) → iOS는 당분간 하드웨어 버튼. UI에서
  iOS는 비활성/안내하거나, iOS만 tier 2(speechSynthesis) 볼륨이라도 낮추는
  부분 완화.
- **더 빠른 대안(무-UI 임시)**: 단어 오디오 기본 볼륨을 `1`→`0.7`
  전역 하향(성공효과음 0.75와 정합). 한 줄 변경이지만 전원 일괄이고 여전히
  iOS 무효 — 슬라이더보다 blunt. 스톱갭으로만.
- **검증**: `verify:audio-tts` + `testTtsSingleton` + Android/iOS 실기기.

### 🟡 Better solution (베타 후)

1. **iOS 정확 볼륨 = Web Audio GainNode 경로**: 저장 MP3를 AudioContext로
   디코드→GainNode→destination 재생으로 전환해 슬라이더가 iOS에서도 동작.
   단일 재생 보장(`claimTtsCall` 싱글턴)·3-tier 폴백·언락 로직을 반드시
   보존. (중간 난이도, 회귀 위험 있음.)
2. **목소리 variation**(반복 거슬림 직접 완화): 단어당 변형 목소리 몇 벌
   사전 생성 로테이션, 또는 live TTS pitch/rate 소폭 랜덤화. 스토리지/비용
   trade-off 결정 필요.
3. **정식 per-device teacher/classroom 모드**: 스코프 명확한 저볼륨/뮤트
   토글 + 재활성. 발음 학습 루프를 깨지 않도록 설계(§risk).
4. **`times:3` 자동 반복 재고**(`WordDetail.jsx:259`): 학습설계상 2회로
   줄이거나 설정화 — 볼륨과 별개로 "같은 소리 반복량" 자체를 줄이는 축.

### 🔴 Risks

- **iOS `.volume` 무효 → "슬라이더가 안 먹는다" 혼란**: iOS에서 조용히
  무반응이면 교사/학생이 고장으로 오인. 반드시 iOS 게이팅/라벨 또는 Web
  Audio 경로로 해결.
- **과도한 뮤트가 발음 학습을 깨뜨림**: 듣고 따라 말하기가 핵심 학습 루프라
  완전 뮤트는 학습 무력화. 하한(>0) 유지 또는 뮤트 스코프 신중 설계
  (학습설계 리스크).
- **speech.js는 회귀 hot-zone**: 과거 echo/StrictMode 이중호출/모바일 언락
  버그 이력. 싱글턴 stop-guard·3-tier 폴백·언락 로직을 건드리면 재발 위험 →
  harness + 실기기 필수, 최소 침습.
- **Web Audio 경로 복잡도**: iOS AudioContext 제스처 언락, 디코드 지연,
  기존 stop/claim 가드와의 상호작용 — 비자명.
- **per-device localStorage**: 캐시 삭제/시크릿 모드에서 리셋 → 기본값
  복귀(수용 가능).
- **tier 3 네트워크 TTS**(`translate.googleapis.com`): 비공식 엔드포인트
  의존(볼륨과 무관하나 오디오 스택 자체의 기존 취약점 — 참고).

---

## 50명 베타와의 관계

교실 다수 학생 동시 사용 = 이 불만의 실제 맥락. **Quick fix(per-device
볼륨)는 Android 교실 태블릿에 즉효**이나 iOS엔 무효라, iOS 교실이면 베타
전엔 하드웨어 볼륨 + `times:3`→2 하향 정도로 완화하고 Web Audio 정식 해법은
베타 후로 두는 것이 현실적. **이 문서는 분석/권고이며, 어떤 코드도
변경하지 않았다.**
