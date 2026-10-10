// 월드 데이터를 JSON으로 stdout에 덤프 — renderWorldPreview.py가 읽는다. 네트워크/저장소 0.
import * as W from '../../src/utils/town/proto2_5d/world/worldMap.js'
const { ZONES, SPAWN, OBJECTS, PLACES, PATHS, GATES, SOON_OBJECTS, WORLD_W, WORLD_H, PAUL_H } = W
process.stdout.write(JSON.stringify({ WORLD_W, WORLD_H, PAUL_H, ZONES, SPAWN, OBJECTS, PLACES, PATHS, GATES, SOON_OBJECTS, solids: W.solids() }))
