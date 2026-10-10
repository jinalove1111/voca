// 문법 마을 아트 URL 해석기 — 오직 마을 화면 청크만 import한다(main/StudentHome 금지). URL만 반환(인라인 없음).
import manifest from '../../assets/town/kit/manifest.json'

const urls = import.meta.glob('../../assets/town/kit/**/*.webp', { eager: true, import: 'default', query: '?url' })
const url = (key) => urls[`../../assets/town/kit/${key}.webp`]

// target('buildings/cafe') → { src, src2x, w, h }  (w/h = 1x 픽셀 크기). 없거나 skipped면 null.
export const villageArt = (target) => {
  const m = manifest.targets[target]
  const src = url(target)
  const src2x = url(`${target}@2x`)
  if (!m || m.skipped || !src || !src2x) return null
  return { src, src2x, w: m.w, h: m.h }
}
