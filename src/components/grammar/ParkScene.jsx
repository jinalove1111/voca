import { townAsset } from '../../assets/town'
import { PROPS } from '../../utils/grammar/sceneProps'
import Stage from './Stage'

// 2026-10-10 Scene v2: 공원 그림은 범용 Stage의 park 배경 얇은 포장이다(Paul·Cookie 표시 기본값 유지). 그림 TODO assets 목록은 Stage.jsx 맨 위.
export const artUrl = (obj) => (PROPS[obj]?.asset ? townAsset(PROPS[obj].asset) : null)
export default function ParkScene(props) {
  return <Stage bg="park" {...props} />
}
