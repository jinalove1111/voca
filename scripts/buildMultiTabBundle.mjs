// Bundles src/hooks/useStudent.js for scripts/testMultiTabRace.mjs.
// Output goes to the gitignored scripts/.tmp/ (build artifact, not source).
// Mirrors buildRaceBundle.mjs exactly, just pointed at the multi-tab stub so
// this scenario's syncCalls/pendingStrictReads array is isolated from the
// existing race-test bundle (two different bundle files = two independent
// module graphs, no shared state bleed between test files).
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const wordlibStub = path.resolve('scripts/wordLibraryMultiTabStub.mjs')
const reactStub = path.resolve('scripts/fakeReactModule.mjs')

await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/useStudent.multitab.bundle.mjs',
  plugins: [{
    name: 'stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: pathToFileURL(wordlibStub).href, external: true }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(reactStub).href, external: true }))
    },
  }],
})
console.log('bundled -> scripts/.tmp/useStudent.multitab.bundle.mjs')
