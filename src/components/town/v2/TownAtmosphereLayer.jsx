// src/components/town/v2/TownAtmosphereLayer.jsx — Paul Town V2 대기
// (atmosphere) ambient 파일럿 레이어(2026-09-20).
//
// TownAmbientLayer.jsx(집 옆 화단/창문 불빛/담쟁이/새 — gardenPoints에
// 묶인 정원 성장 장식, 이미 다른 파일이 소유)와는 완전히 다른 관심사다 —
// 이 레이어는 경제/진행 데이터와 무관하게 씬 전체 위를 떠다니는 순수
// 배경 분위기(나비/나뭇잎/빛 알갱이) 몇 개만 그린다(파일당 단일 관심사
// 원칙 — 기존 TownAmbientLayer.jsx에 얹지 않는다).
//
// 위치/타이밍은 전부 결정론적 고정값이다(Math.random 없음) — E2E가
// data-atmosphere로 안정적으로 단언할 수 있어야 한다(과제 지시서
// "Deterministic positions... so tests can assert on them reliably").
// absolute + pointer-events-none + aria-hidden — 상호작용/접근성 트리에
// 전혀 개입하지 않는 순수 장식. motion-safe:로만 애니메이션되어
// prefers-reduced-motion에서는 정지된 상태로(고정 위치에 가만히) 보인다.
// document.hidden(탭 백그라운드)이면 useDocumentHidden으로 pause한다 —
// TownScene은 상점/보관함 시트가 열려도 언마운트되지 않으므로(오버레이
// 시트일 뿐) 이 pause가 유일하게 의미 있는 경우다.
//
// z-index는 depthOrder.js의 Y-랭킹 콘텐츠 밴드에 넣지 않는다(sceneZ.js
// ATMOSPHERE_Z 정의 참고 — 콘텐츠 전체보다 항상 위, paul/ui보다는 항상
// 아래로 고정된 씬 로컬 UI 상수) — 이 레이어의 래퍼 자신이 그 z를 직접
// 갖는다(TownScene.jsx 팝오버 바깥 탭 백드롭과 동일 관례, 개별 자식마다
// worldZIndex를 계산할 필요가 없는 "콘텐츠와 상호작용하지 않는 오버레이"
// 이므로).
import { useDocumentHidden } from '../../../hooks/useDocumentHidden'
import { ATMOSPHERE_Z } from './sceneZ'

const DRIFTERS = Object.freeze([
  Object.freeze({ id: 'butterfly-1', glyph: '🦋', leftPct: 18, topPct: 20, sizeRem: 1, durationS: 9, delayS: 0 }),
  Object.freeze({ id: 'butterfly-2', glyph: '🦋', leftPct: 63, topPct: 36, sizeRem: 0.85, durationS: 11, delayS: -3.5 }),
  Object.freeze({ id: 'leaf-1', glyph: '🍃', leftPct: 40, topPct: 52, sizeRem: 0.8, durationS: 13, delayS: -6.2 }),
  Object.freeze({ id: 'mote-1', glyph: '✨', leftPct: 78, topPct: 18, sizeRem: 0.65, durationS: 8, delayS: -1.8 }),
])

export default function TownAtmosphereLayer() {
  const hidden = useDocumentHidden()

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: ATMOSPHERE_Z }}
    >
      {DRIFTERS.map((d) => (
        <span
          key={d.id}
          data-atmosphere={d.id}
          className="absolute select-none motion-safe:animate-town-drift"
          style={{
            left: `${d.leftPct}%`,
            top: `${d.topPct}%`,
            fontSize: `${d.sizeRem}rem`,
            animationDuration: `${d.durationS}s`,
            animationDelay: `${d.delayS}s`,
            animationPlayState: hidden ? 'paused' : 'running',
          }}
        >
          {d.glyph}
        </span>
      ))}
    </div>
  )
}
