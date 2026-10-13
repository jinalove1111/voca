# PAUL PHONICS 첫 화면 그림 — 출처(NOTICE)

`phonics-home-full.webp`, `phonics-home-sign.webp`, `phonics-home-teacher.webp`,
`phonics-home-card-phonics.webp`, `phonics-home-card-speak.webp`, `phonics-home-card-play.webp` —
운영자가 승인한 한 장의 그림에서 잘라낸 파생 파일의 출처 기록이다. LICENSE.txt와 함께 읽는다.

- 원본 파일: `a25b0d9d-4f13-4dd0-ac71-82f35f8b3d1f.png` (1672×941, 24비트 RGB, 투명도 없음)
  - sha256: `9556d23b1b04dc937770a6fd07dd9072982421dee6cde39f1ab165a9423d9221`
- 공급/승인: 운영자가 2026-10-13에 PAUL PHONICS 첫 화면 디자인으로 공급하고 승인했다.
  주문서에는 파일명이 `a_bright_colorful_cartoon_3d_styled_education_ap.png`로 적혀 있었으나,
  실제로 공급된 파일은 위의 `a25b0d9d-...png`이다(두 이름 모두 기록한다).
- 제작 방법: 운영자가 기록해두지 않았다. 사용한 도구/모델은 알 수 없으며 지어내지 않는다.
- 파생: 2026-10-13, `scripts/phonics/deriveHomeArt.py`. 원본의 sha256이 위 값과 같은지 검증한 뒤
  (다르면 중단) 아래 사각형을 **원본 픽셀 그대로(배율 1.0) 잘라내고** WebP(quality 90, method 6)로
  변환한다. 크기 조정·리샘플·리페인트·색 변경·보정 없음. 스크립트를 다시 실행해도 바이트가 같다.

| 출력 파일 | 원본 사각형 (x0, y0, x1, y1) | 크기 |
|---|---|---|
| `phonics-home-full.webp` | (0, 0, 1672, 941) | 1672×941 |
| `phonics-home-sign.webp` | (700, 38, 1645, 335) | 945×297 |
| `phonics-home-teacher.webp` | (0, 0, 708, 941) | 708×941 |
| `phonics-home-card-phonics.webp` | (704, 352, 990, 692) | 286×340 |
| `phonics-home-card-speak.webp` | (996, 345, 1298, 696) | 302×351 |
| `phonics-home-card-play.webp` | (1306, 340, 1630, 700) | 324×360 |

- 원본은 운영자가 저장소 밖에 보관하며, 이 작업은 원본을 수정·이동·덮어쓰지 않는다.
- 사용처: PAUL PHONICS 첫 화면(`PictureWordPractice.jsx`의 `PhonicsHome`). 넓은 화면은 전체 그림 위에
  투명 버튼을, 좁은 화면은 조각(sign/teacher/card 3장)을 다시 배치해 쓴다.

## 확인 필요

- 원본이 가로 1672px이라, 이보다 많은 기기 픽셀이 필요한 화면(큰 화면이나 고밀도 화면)에서는
  브라우저가 그림을 확대해야 한다. 이를 피하려면 더 큰 원본이 필요하다.
- 그림의 오른쪽 위 모서리에 작고 흐린 표식이 있다. 이는 공급된 그림의 일부이며 그대로 두었다
  (간판 조각에도 일부 포함된다).
