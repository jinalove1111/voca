// The only place that discovers teacher recording files (256차): file name -> bundled URL. src/assets/phonics/clips/ does not exist yet, so this is {} today.
// Plain Node (the static tests) has no import.meta.glob: the try/catch turns that into "no files". Never create placeholder audio here.
let urls = {}
try {
  urls = import.meta.glob('../../assets/phonics/clips/*', { eager: true, query: '?url', import: 'default' })
} catch { /* no glob outside Vite = no files */ }
export const CLIP_URLS = Object.fromEntries(Object.entries(urls).map(([p, u]) => [p.split('/').pop(), u]))
