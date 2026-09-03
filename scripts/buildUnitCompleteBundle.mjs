// scripts/buildUnitCompleteBundle.mjs — bundles src/hooks/useStudent.js for
// scripts/testUnitCompleteReward.mjs and scripts/testMasteryReward.mjs (P4/P5
// client, 2026-09-03, docs/REWARD_LOOP_AUDIT_2026-09-03.md §14). Same
// technique as scripts/buildRaceBundle.mjs (CLAUDE.md 규칙 3 — 새 번들
// 기법 발명이 아니라 이미 검증된 기법 재사용): wordLibrary/react는 외부
// 스텁으로 치환한다.
//
// config/features.js는 stub하지 않고도 그냥 정상적으로 인라인 번들된다
// (localStorage만 쓰는 순수 모듈이라 별도 스텁이 필요 없음) — 테스트는
// globalThis.localStorage에 flag JSON을 미리 심어 두는 방식으로 제어한다
// (features.js의 loadFeaturesFromStorage가 모듈 최초 로드 시 그 값을
// 읽어가므로, 번들을 import하기 "전에" localStorage를 세팅해야 한다).
//
// Output goes to the gitignored scripts/.tmp/ (build artifact, not source).
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const wordlibStub = path.resolve('scripts/wordLibraryRaceStub.mjs')
const reactStub = path.resolve('scripts/fakeReactModule.mjs')

await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/useStudent.p4p5.bundle.mjs',
  plugins: [{
    name: 'stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: pathToFileURL(wordlibStub).href, external: true }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(reactStub).href, external: true }))
    },
  }],
})
console.log('bundled -> scripts/.tmp/useStudent.p4p5.bundle.mjs')
