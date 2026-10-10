import { townAsset } from '../../assets/town'
import { PROPS, parkArtKey, parkSrc } from '../../utils/grammar/sceneProps'
import { PARK_ART } from '../../utils/grammar/parkArt'
import Stage from './Stage'

// 2026-10-10 Scene v2: 공원 그림은 범용 Stage의 park 배경 얇은 포장이다(Paul·Cookie 표시 기본값 유지). 그림 TODO assets 목록은 Stage.jsx 맨 위.
// 만들기 상자 아이콘: 공원이면 Stage와 같은 kit 그림(처음 한 개 = 서 있는 쿠키·나무 등), 아니면 Town 스프라이트
export const artUrl = (obj, bg = 'park') => { const k = bg === 'park' ? parkArtKey(obj, 0) : null; return k ? parkSrc(PARK_ART[k]) : PROPS[obj]?.asset ? townAsset(PROPS[obj].asset) : null }
export default function ParkScene(props) {
  return <Stage bg="park" {...props} />
}
