// 2026-10-10 공원 미션 실제 그림(art kit). 문법 쪽에서 kit 파일을 import하는 곳은 이 파일 하나뿐이다(testGrammarCourses 핀).
// 파일 위치: kit 폴더 안 index는 testTownKitAssets의 "orphan file" 가드가 거부하므로 src/utils/grammar에 둔다.
// 이미지는 URL 문자열 import이고, Stage가 park 배경·해당 물건이 무대에 있을 때만 <image href>로 그린다 — 그 전에는 브라우저가 받지 않는다.
// w/h는 src/assets/town/kit/manifest.json의 1x 크기(핀으로 일치 확인).
import backdrop from '../../assets/town/kit/backgrounds/park-backdrop.webp'
import backdrop2x from '../../assets/town/kit/backgrounds/park-backdrop@2x.webp'
import cookieStand from '../../assets/town/kit/character/cookie-stand.webp'
import cookieStand2x from '../../assets/town/kit/character/cookie-stand@2x.webp'
import cookieSit from '../../assets/town/kit/character/cookie-sit.webp'
import cookieSit2x from '../../assets/town/kit/character/cookie-sit@2x.webp'
import tree from '../../assets/town/kit/nature/tree.webp'
import tree2x from '../../assets/town/kit/nature/tree@2x.webp'
import bench from '../../assets/town/kit/props/bench.webp'
import bench2x from '../../assets/town/kit/props/bench@2x.webp'
import flower from '../../assets/town/kit/props/sunflower-pot.webp'
import flower2x from '../../assets/town/kit/props/sunflower-pot@2x.webp'

const mk = (src, src2x, w, h) => ({ src, src2x, w, h })
export const PARK_ART = {
  backdrop: mk(backdrop, backdrop2x, 768, 512),
  'cookie-stand': mk(cookieStand, cookieStand2x, 213, 256),
  'cookie-sit': mk(cookieSit, cookieSit2x, 179, 256),
  tree: mk(tree, tree2x, 256, 256),
  bench: mk(bench, bench2x, 256, 244),
  flower: mk(flower, flower2x, 175, 256),
}

// 순수 도우미(parkArtKey·parkSrc·PARK_DIMS)는 sceneProps.js에 있다 — 이 파일은 .webp import라 node 테스트가 읽을 수 없어 소스 파싱으로만 검사한다.
