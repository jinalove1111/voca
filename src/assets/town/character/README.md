# Paul 캐릭터 스프라이트 — 드롭 위치

여기에 아래 8개 PNG를 그대로 넣는다(파일명 정확히 일치, 새 이름 발명 금지 —
`src/utils/town/proto2_5d/paulSpriteManifest.js`의 `PAUL_SPRITE_FILES` 참고):

- `paul-idle-front.png`
- `paul-walk-front-a.png`
- `paul-walk-front-b.png`
- `paul-walk-back-a.png`
- `paul-walk-back-b.png`
- `paul-walk-side-a.png`
- `paul-walk-side-b.png`
- `paul-sit.png`

## 캐릭터 스펙(8개 항목, `docs/design/town/PAUL_TOWN_CHARACTER_SPRITE_SPEC_2026-09-24.md` 기준)

1. Paul 얼굴·파란 눈
2. 약간 통통한 상체와 배
3. 얇은 다리
4. 금색 Paul 문장이 있는 실크해트(짙은 남색)
5. 네이비 몽클레어 반팔 티셔츠·반바지
6. 검정·회색 Air Max 95
7. 투명 배경 PNG(배경 없음, 알파 채널 필수)
8. 모든 프레임 동일 캔버스 크기 + 발 접지선(캔버스 하단 정렬) + 중심축(가로 중심 정렬) 일치

## 8장이 도착한 뒤

```
node scripts/spriteIngestPaul.mjs --check
```

전항목 PASS면:

```
node scripts/spriteIngestPaul.mjs --write
```

## 커밋 전 필수

`LICENSE.txt` + `NOTICE.md`(생성 도구/모델/날짜/프롬프트 해시/승인자/승인일
기록, 스펙 §8)를 이 디렉터리에 **최종본과 함께** 작성하지 않으면 커밋하지
않는다. 저장소의 기존 154개 자산은 전부 출처 UNKNOWN인 기존 부채이고,
캐릭터 자산은 이 부채를 반복하지 않는다.
