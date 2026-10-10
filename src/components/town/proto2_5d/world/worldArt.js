// 2026-10-10(244차) 하이브리드 월드 키트 아트 — worldMap.activeArts()(준비된 3개 구역 오브젝트 + 문)의 target만 정적 import한다.
// 준비 중 구역(SOON_OBJECTS)의 아트는 일부러 import하지 않는다(초기 요청에 끌려오지 않게). 목록은 testTownWorldScreen이 activeArts()와 대조한다.
// w/h = kit/manifest.json 1x 픽셀 크기(소비자는 h를 월드 단위로 환산해 가로세로비만 쓴다).
import manifest from '../../../../assets/town/kit/manifest.json'
import buildings_bus_stop from '../../../../assets/town/kit/buildings/bus-stop.webp'
import buildings_bus_stop_2x from '../../../../assets/town/kit/buildings/bus-stop@2x.webp'
import buildings_castle_gate from '../../../../assets/town/kit/buildings/castle-gate.webp'
import buildings_castle_gate_2x from '../../../../assets/town/kit/buildings/castle-gate@2x.webp'
import buildings_clock_tower from '../../../../assets/town/kit/buildings/clock-tower.webp'
import buildings_clock_tower_2x from '../../../../assets/town/kit/buildings/clock-tower@2x.webp'
import buildings_gazebo from '../../../../assets/town/kit/buildings/gazebo.webp'
import buildings_gazebo_2x from '../../../../assets/town/kit/buildings/gazebo@2x.webp'
import buildings_reading_pavilion from '../../../../assets/town/kit/buildings/reading-pavilion.webp'
import buildings_reading_pavilion_2x from '../../../../assets/town/kit/buildings/reading-pavilion@2x.webp'
import buildings_school from '../../../../assets/town/kit/buildings/school.webp'
import buildings_school_2x from '../../../../assets/town/kit/buildings/school@2x.webp'
import buildings_town_hall from '../../../../assets/town/kit/buildings/town-hall.webp'
import buildings_town_hall_2x from '../../../../assets/town/kit/buildings/town-hall@2x.webp'
import buildings_treehouse from '../../../../assets/town/kit/buildings/treehouse.webp'
import buildings_treehouse_2x from '../../../../assets/town/kit/buildings/treehouse@2x.webp'
import character_cookie_sit from '../../../../assets/town/kit/character/cookie-sit.webp'
import character_cookie_sit_2x from '../../../../assets/town/kit/character/cookie-sit@2x.webp'
import nature_hedge from '../../../../assets/town/kit/nature/hedge.webp'
import nature_hedge_2x from '../../../../assets/town/kit/nature/hedge@2x.webp'
import nature_tree from '../../../../assets/town/kit/nature/tree.webp'
import nature_tree_2x from '../../../../assets/town/kit/nature/tree@2x.webp'
import props_balloons from '../../../../assets/town/kit/props/balloons.webp'
import props_balloons_2x from '../../../../assets/town/kit/props/balloons@2x.webp'
import props_bench from '../../../../assets/town/kit/props/bench.webp'
import props_bench_2x from '../../../../assets/town/kit/props/bench@2x.webp'
import props_bike_rack from '../../../../assets/town/kit/props/bike-rack.webp'
import props_bike_rack_2x from '../../../../assets/town/kit/props/bike-rack@2x.webp'
import props_bird_bath from '../../../../assets/town/kit/props/bird-bath.webp'
import props_bird_bath_2x from '../../../../assets/town/kit/props/bird-bath@2x.webp'
import props_birdhouse from '../../../../assets/town/kit/props/birdhouse.webp'
import props_birdhouse_2x from '../../../../assets/town/kit/props/birdhouse@2x.webp'
import props_bollard from '../../../../assets/town/kit/props/bollard.webp'
import props_bollard_2x from '../../../../assets/town/kit/props/bollard@2x.webp'
import props_dog_house from '../../../../assets/town/kit/props/dog-house.webp'
import props_dog_house_2x from '../../../../assets/town/kit/props/dog-house@2x.webp'
import props_fence from '../../../../assets/town/kit/props/fence.webp'
import props_fence_2x from '../../../../assets/town/kit/props/fence@2x.webp'
import props_flower_urn from '../../../../assets/town/kit/props/flower-urn.webp'
import props_flower_urn_2x from '../../../../assets/town/kit/props/flower-urn@2x.webp'
import props_fountain from '../../../../assets/town/kit/props/fountain.webp'
import props_fountain_2x from '../../../../assets/town/kit/props/fountain@2x.webp'
import props_garden_gate from '../../../../assets/town/kit/props/garden-gate.webp'
import props_garden_gate_2x from '../../../../assets/town/kit/props/garden-gate@2x.webp'
import props_litter_bin from '../../../../assets/town/kit/props/litter-bin.webp'
import props_litter_bin_2x from '../../../../assets/town/kit/props/litter-bin@2x.webp'
import props_phone_box from '../../../../assets/town/kit/props/phone-box.webp'
import props_phone_box_2x from '../../../../assets/town/kit/props/phone-box@2x.webp'
import props_picnic_table from '../../../../assets/town/kit/props/picnic-table.webp'
import props_picnic_table_2x from '../../../../assets/town/kit/props/picnic-table@2x.webp'
import props_post_box from '../../../../assets/town/kit/props/post-box.webp'
import props_post_box_2x from '../../../../assets/town/kit/props/post-box@2x.webp'
import props_rose_arch from '../../../../assets/town/kit/props/rose-arch.webp'
import props_rose_arch_2x from '../../../../assets/town/kit/props/rose-arch@2x.webp'
import props_signpost from '../../../../assets/town/kit/props/signpost.webp'
import props_signpost_2x from '../../../../assets/town/kit/props/signpost@2x.webp'
import props_stepping_stones from '../../../../assets/town/kit/props/stepping-stones.webp'
import props_stepping_stones_2x from '../../../../assets/town/kit/props/stepping-stones@2x.webp'
import props_street_clock from '../../../../assets/town/kit/props/street-clock.webp'
import props_street_clock_2x from '../../../../assets/town/kit/props/street-clock@2x.webp'
import props_street_lamp from '../../../../assets/town/kit/props/street-lamp.webp'
import props_street_lamp_2x from '../../../../assets/town/kit/props/street-lamp@2x.webp'
import props_sundial from '../../../../assets/town/kit/props/sundial.webp'
import props_sundial_2x from '../../../../assets/town/kit/props/sundial@2x.webp'
import props_sunflower_pot from '../../../../assets/town/kit/props/sunflower-pot.webp'
import props_sunflower_pot_2x from '../../../../assets/town/kit/props/sunflower-pot@2x.webp'
import props_swing from '../../../../assets/town/kit/props/swing.webp'
import props_swing_2x from '../../../../assets/town/kit/props/swing@2x.webp'
import props_tent from '../../../../assets/town/kit/props/tent.webp'
import props_tent_2x from '../../../../assets/town/kit/props/tent@2x.webp'
import props_wall_fountain from '../../../../assets/town/kit/props/wall-fountain.webp'
import props_wall_fountain_2x from '../../../../assets/town/kit/props/wall-fountain@2x.webp'

const SRC = {
  'buildings/bus-stop': [buildings_bus_stop, buildings_bus_stop_2x],
  'buildings/castle-gate': [buildings_castle_gate, buildings_castle_gate_2x],
  'buildings/clock-tower': [buildings_clock_tower, buildings_clock_tower_2x],
  'buildings/gazebo': [buildings_gazebo, buildings_gazebo_2x],
  'buildings/reading-pavilion': [buildings_reading_pavilion, buildings_reading_pavilion_2x],
  'buildings/school': [buildings_school, buildings_school_2x],
  'buildings/town-hall': [buildings_town_hall, buildings_town_hall_2x],
  'buildings/treehouse': [buildings_treehouse, buildings_treehouse_2x],
  'character/cookie-sit': [character_cookie_sit, character_cookie_sit_2x],
  'nature/hedge': [nature_hedge, nature_hedge_2x],
  'nature/tree': [nature_tree, nature_tree_2x],
  'props/balloons': [props_balloons, props_balloons_2x],
  'props/bench': [props_bench, props_bench_2x],
  'props/bike-rack': [props_bike_rack, props_bike_rack_2x],
  'props/bird-bath': [props_bird_bath, props_bird_bath_2x],
  'props/birdhouse': [props_birdhouse, props_birdhouse_2x],
  'props/bollard': [props_bollard, props_bollard_2x],
  'props/dog-house': [props_dog_house, props_dog_house_2x],
  'props/fence': [props_fence, props_fence_2x],
  'props/flower-urn': [props_flower_urn, props_flower_urn_2x],
  'props/fountain': [props_fountain, props_fountain_2x],
  'props/garden-gate': [props_garden_gate, props_garden_gate_2x],
  'props/litter-bin': [props_litter_bin, props_litter_bin_2x],
  'props/phone-box': [props_phone_box, props_phone_box_2x],
  'props/picnic-table': [props_picnic_table, props_picnic_table_2x],
  'props/post-box': [props_post_box, props_post_box_2x],
  'props/rose-arch': [props_rose_arch, props_rose_arch_2x],
  'props/signpost': [props_signpost, props_signpost_2x],
  'props/stepping-stones': [props_stepping_stones, props_stepping_stones_2x],
  'props/street-clock': [props_street_clock, props_street_clock_2x],
  'props/street-lamp': [props_street_lamp, props_street_lamp_2x],
  'props/sundial': [props_sundial, props_sundial_2x],
  'props/sunflower-pot': [props_sunflower_pot, props_sunflower_pot_2x],
  'props/swing': [props_swing, props_swing_2x],
  'props/tent': [props_tent, props_tent_2x],
  'props/wall-fountain': [props_wall_fountain, props_wall_fountain_2x],
}

export const WORLD_ART_TARGETS = Object.freeze(Object.keys(SRC))

// target -> { src, src2x, w, h } | null (목록 밖/skipped)
export const worldArt = (target) => {
  const m = manifest.targets[target]
  const u = SRC[target]
  if (!m || m.skipped || !u) return null
  return { src: u[0], src2x: u[1], w: m.w, h: m.h }
}
