// Bundler for src/utils/speech.js — produces the SPEECH_BUNDLE
// scripts/testTtsSingleton.mjs expects. Mirrors buildProgressBundle.mjs's
// existing pattern (esbuild, only paulReactions stubbed — it pulls in PNG
// asset imports esbuild can't load without a loader, and is irrelevant to
// the claimTtsCall guard under test). No logic duplication: the real
// src/utils/speech.js source is bundled unmodified.
//
// Promoted from an ad-hoc scripts/.tmp/buildSpeechBundle.mjs written during
// the 2026-07-18 QA sweep (handoff.md) into this permanent, tracked
// location so `npm run verify:audio-tts` doesn't depend on a gitignored
// scratch file.
import esbuild from 'esbuild'

const stub = (contents) => ({ contents, loader: 'js' })

await esbuild.build({
  entryPoints: ['src/utils/speech.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: 'scripts/.tmp/speech.bundle.mjs',
  logLevel: 'info',
  plugins: [{
    name: 'stub-paul-reactions',
    setup(build) {
      build.onResolve({ filter: /paulReactions$/ }, () => ({ path: 'paulReactions-stub', namespace: 'stub' }))
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => stub(`export const stopReactionSound = () => {}`))
    },
  }],
})
console.log('bundled -> scripts/.tmp/speech.bundle.mjs')
