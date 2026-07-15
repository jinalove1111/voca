// Bundles src/hooks/useStudent.js for scripts/testProgress.mjs — mirrors
// buildRaceBundle.mjs's existing pattern (external stubs for react/
// wordLibrary so plain Node can run the real useStudent.js source
// unmodified, no logic duplication, no live Supabase/browser needed since
// testProgress.mjs only exercises the pure record/history functions).
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const wordlibStub = path.resolve('scripts/wordLibraryStub.mjs')
const reactStub = path.resolve('scripts/fakeReactModule.mjs')

await esbuild.build({
  entryPoints: ['src/hooks/useStudent.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/useStudent.progress.bundle.mjs',
  plugins: [{
    name: 'stubs',
    setup(build) {
      build.onResolve({ filter: /utils[\\/]wordLibrary$/ }, () => ({ path: pathToFileURL(wordlibStub).href, external: true }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: pathToFileURL(reactStub).href, external: true }))
    },
  }],
})
console.log('bundled -> scripts/.tmp/useStudent.progress.bundle.mjs')
