// Bundles scripts/testPaulReactions.mjs itself (not just the src it tests) —
// mirrors the exact command testPaulReactions.mjs's own header comment
// documents. src/utils/paulReactions.js does static PNG imports (CTO design:
// individual PNG asset per reaction), which plain Node ESM can't resolve —
// esbuild's --loader:.png=dataurl turns each into a data-URI string at
// bundle time so the real paulReactions.js logic runs unmodified in Node.
import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['scripts/testPaulReactions.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  loader: { '.png': 'dataurl' },
  outfile: 'scripts/.tmp/testPaulReactions.bundle.mjs',
})
console.log('bundled -> scripts/.tmp/testPaulReactions.bundle.mjs')
