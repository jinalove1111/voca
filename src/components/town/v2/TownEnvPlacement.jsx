// src/components/town/v2/TownEnvPlacement.jsx — Paul Town V2 ENV_PLACEMENTS
// 항목 하나를 절대 위치 + 변환된 <TownEnvImage>로 그리는 공유 프레젠테이션
// 컴포넌트(2026-09-18, 작업 지시서 STEP 5).
//
// worldScenery.js의 ENV_PLACEMENTS(잔디 패치/강/길/울타리·생울타리/클러스터,
// 전부 같은 { assetKey, group, depthLayer, xPct, yPct, wPct, hPct,
// rotationDeg, mirror, anchor, feather } 셰이프)를 소비하는 레이어가
// TownGroundLayer/TownWaterLayer/TownPathLayer(이번 세션) + 후속
// TownSceneryLayer까지 3개 이상으로 늘어나, 앵커/회전/미러/피더 변환
// 산식을 한 곳에서만 구현한다(CLAUDE.md 규칙 3·16 정신 — 같은 계산을
// 여러 파일에 복제하지 않는다). 좌표/변환 산식 원천은 여전히 하네스
// (docs/design/town/mockup/paul-town-recompose.html)의 `placePx()`다 —
// 재도출 없이 그대로 포팅한다:
//   1) translate(tx, ty) — anchor별 고정값('center'→-50%,-50%;
//      'bottom-left'→0%,-100%; 'bottom-center'(기본)→-50%,-100%;
//      'top-left'→0%,0%, 현재 ENV_PLACEMENTS 어떤 항목도 안 씀이지만
//      BATCH1_FILES 앵커 어휘 전체를 지원해 둔다)
//   2) rotationDeg가 있으면 rotate(deg) 추가
//   3) mirror가 true면 scaleX(-1) 추가(반드시 rotate 다음 — 타일 자신의
//      로컬 좌표계에서 미러링해야 좌회전 커브 타일이 올바르게 뒤집힌다)
// feather:true인 항목(직선 경로/강 타일의 50% 겹침 이음매)은 하네스의
// `.pathTile`/`.riverTile` CSS 클래스(동일한 mask-image 값)를 인라인
// style로 그대로 적용한다 — 반드시 wrapper(변환이 걸리는 요소)에 걸어야
// 마스크가 타일과 함께 회전한다(하네스 헤더 주석 "seam mask ... must
// rotate WITH the tile so it lives on the wrapper, not the <img>").
//
// z-index는 개별 항목마다 worldRender.worldZIndex(entry.depthLayer,
// entry.yPct, entry.id)로 매긴다 — 이 컴포넌트를 감싸는 레이어 컨테이너
// (TownGroundLayer 등)는 자체 z-index를 두지 않는다(새 스태킹 컨텍스트를
// 만들지 않아야, y-랭킹 레이어(scenery/objects/foregroundVegetation)가
// 레이어 경계를 넘어 서로 올바르게 끼어들 수 있다 — depthOrder.js 헤더
// 참고). 이 파일 자체는 순수 프레젠테이션이라 ENV_PLACEMENTS/GROUND 같은
// 데이터를 스스로 import하지 않는다(호출부가 entry를 그대로 넘긴다).
import { worldZIndex } from '../../../utils/town/worldRender'
import TownEnvImage from './TownEnvImage'

const ANCHOR_TRANSFORM = {
  center: 'translate(-50%, -50%)',
  'bottom-left': 'translate(0%, -100%)',
  'bottom-center': 'translate(-50%, -100%)',
  'top-left': 'translate(0%, 0%)',
}

// 하네스 .pathTile/.riverTile과 동일한 값(2026-09-17 하네스 <style> 블록
// 그대로) — 타일 자신의 세로축 기준 위/아래 22%를 페더링해 50% 겹침
// 이웃과 이음매 없이 크로스페이드된다.
const FEATHER_MASK = 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)'

/**
 * @param {object} props
 * @param {object} props.entry — ENV_PLACEMENTS 항목 하나(frozen).
 * @param {string} [props.imgClassName] — 내부 <TownEnvImage> className(기본 object-contain).
 * @param {string} [props.animationClassName] — 2026-09-20 추가(강 반짝임/
 *   초목 흔들림 ambient 파일럿) — 내부 <TownEnvImage>(래퍼 div가 아니라)
 *   에만 병합되는 선택적 애니메이션 클래스(motion-safe:animate-* 관례).
 *   반드시 <TownEnvImage>에 걸어야 한다 — 이 래퍼 div의 style.transform은
 *   위에서 anchor(bottom-center 등)로 이미 정해진 위치 유지용 transform을
 *   갖고 있어, 같은 엘리먼트에 transform 애니메이션을 더하면 애니메이션이
 *   그 값을 완전히 대체해(브라우저는 진행 중인 애니메이션의 transform이
 *   인라인 스타일보다 항상 우선한다) 타일이 엉뚱한 자리로 튄다. 이미지
 *   자신은 그 anchor transform을 갖지 않으므로 독립적으로 안전하다.
 * @param {object} [props.animationStyle] — 위와 짝을 이루는 선택적 인라인
 *   style(예: animationDuration/animationDelay/animationPlayState) — 역시
 *   <TownEnvImage>에만 적용된다.
 */
export default function TownEnvPlacement({
  entry, imgClassName = 'w-full h-full object-contain', animationClassName = '', animationStyle,
}) {
  if (!entry) return null
  const {
    id, assetKey, depthLayer, xPct, yPct, wPct, hPct, rotationDeg, mirror, anchor, feather,
  } = entry

  let transform = ANCHOR_TRANSFORM[anchor] || ANCHOR_TRANSFORM['bottom-center']
  if (rotationDeg) transform += ` rotate(${rotationDeg}deg)`
  if (mirror) transform += ' scaleX(-1)'

  const style = {
    left: `${xPct}%`,
    top: `${yPct}%`,
    width: `${wPct}%`,
    height: hPct != null ? `${hPct}%` : 'auto',
    transform,
    zIndex: worldZIndex(depthLayer, yPct, id),
  }
  if (feather) {
    style.WebkitMaskImage = FEATHER_MASK
    style.maskImage = FEATHER_MASK
  }

  const combinedImgClassName = animationClassName ? `${imgClassName} ${animationClassName}` : imgClassName

  return (
    <div className="absolute" style={style}>
      <TownEnvImage assetKey={assetKey} className={combinedImgClassName} style={animationStyle} />
    </div>
  )
}
