// Bundles src/hooks/useStudent.js for
// scripts/testWritingCompleteRealReactTiming.mjs — same wordLibrary stub
// wiring as scripts/buildRaceBundle.mjs (external:true so the test script
// and the bundle share the exact same module instance, TESTING.md §2
// convention), but DELIBERATELY does NOT stub `react` — that import is left
// external and resolves through Node's normal ESM resolution to the REAL
// `react` package in node_modules, so the bundled hook runs on the actual
// React 18.3 reconciler (via react-dom/client) instead of
// scripts/fakeReact.mjs's synchronous-always hooks shim. That shim is
// exactly the blind spot under investigation (see test file header) —
// bundling the real hook against the real React is the whole point.
// Output goes to the gitignored scripts/.tmp/ (build artifact, not source).
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const wordlibStub = path.resolve('scripts/wordLibraryRaceStub.mjs')

await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/useStudent.realReact.bundle.mjs',
  plugins: [{
    name: 'stubs',
    setup(build) {
      // external:true — see scripts/buildRaceBundle.mjs header comment for
      // why this is essential (shared module singleton for syncCalls/
      // fetchFullProgressDeferred across the bundle and the test script).
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: pathToFileURL(wordlibStub).href, external: true }))
      // `react` is intentionally left unhandled here (no onResolve override)
      // so esbuild marks it external by default (Node platform + no local
      // file match) and Node's loader resolves it to the real package.
    },
  }],
  external: ['react'],
})
console.log('bundled -> scripts/.tmp/useStudent.realReact.bundle.mjs (real react, not fakeReact)')
