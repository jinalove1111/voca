// Bundles src/hooks/useStudent.js for scripts/testRestoreSyncRace.mjs.
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
  outfile: 'scripts/.tmp/useStudent.race.bundle.mjs',
  plugins: [{
    name: 'stubs',
    setup(build) {
      // external:true is essential — without it esbuild INLINES the stub's
      // source into the bundle, giving the bundle its own private copy of
      // syncCalls/fetchFullProgressDeferred, disconnected from the
      // instance testRestoreSyncRace.mjs imports directly. Marking
      // external keeps it a real `import` statement, so Node's ESM loader
      // resolves both to the same cached module instance.
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: pathToFileURL(wordlibStub).href, external: true }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(reactStub).href, external: true }))
    },
  }],
})
console.log('bundled -> scripts/.tmp/useStudent.race.bundle.mjs')
