# PAUL PHONICS 선생님 캐릭터 — 출처(NOTICE)

`phonics-teacher-stand.webp`, `phonics-teacher-sit.webp`(각 384×512 투명 WebP)의
출처 기록이다. LICENSE.txt와 함께 읽는다.

- 같은 캐릭터, 같은 원본: Paul Town에서 실제 사용하는 기존 Paul 캐릭터와 동일한
  생성 원본 파일을 쓴다. 생성 도구/모델/지시자/승인 기록은
  `src/assets/town/character/NOTICE.md`를 그대로 따른다(생성 모델/버전은 운영자가
  기록해두지 않아 특정할 수 없음 — 임의로 지어내지 않는다).
- 원본 파일(1024×1536 RGBA PNG, 배경 투명):

| 출력 파일 | 원본 소스 파일명 | 원본 sha256 |
|---|---|---|
| `phonics-teacher-stand.webp` | `ChatGPT Image Sep 24, 2026, 08_23_24 PM.png` | `56f4082a45d2010383f1cb7a49d6058438c68742a508c67c0bf8684841f77f0f` |
| `phonics-teacher-sit.webp` | `ChatGPT Image Sep 24, 2026, 08_25_51 PM.png` | `e8d801666406de4f1d0285fbb997302072a90280ac92f1c3c3c25ff9cc398f71` |

- 파생: 2026-10-13, `scripts/phonics/deriveTeacherArt.py`. 원본의 sha256이 위 값과
  같은지 검증한 뒤(다르면 중단), 잉크 바운딩박스(alpha > 8)를 찾아 비율을 유지한
  균일 스케일(LANCZOS)로 384×512 투명 캔버스에 맞추고, 가로 중심 정렬 + 하단
  행에 발 접지(Town 스프라이트와 같은 규칙)로 배치한다. 결과 크기: stand는 그림
  180×512, sit은 240×512(캔버스는 둘 다 384×512). WebP(alpha, quality 90,
  method 6). 리페인트/색 변경/잘라내기 없음(픽셀 값은 원본 리샘플 결과 그대로).
  Town의 최대 크기(192×256)는 3배 밀도 폰에서 작아, 늘리지 않고 같은 원본에서
  더 크게 내보냈다.
- 사용처: PAUL PHONICS 학습 화면. 2026-10-13 운영자 결정("Paul Town에서 실제
  사용하는 기존 폴 선생님 캐릭터를 재사용")으로 승인.

## 확인 필요

원본 아트워크의 의상에 제3자 브랜드 표식이 보인다(Town 캐릭터 스펙 자체가 의상
브랜드를 명시한다). 캐릭터를 더 넓게 노출할 때 이를 유지할지는 운영자의 미결
결정이다. 이 내보내기는 아트워크를 변경하지 않는다.
