// tests/e2e/lib/studentHome.mjs
//
// 학생 홈(studentHomeMenu 플래그 ON, 기본값) 도입 이후 로그인 직후 첫 화면은
// 대시보드가 아니라 [data-testid="student-home"]이다. 기존 스펙은 "로그인 후
// 대시보드(교과서 선택 등)"를 전제하므로, 홈이 보이면 단어 카드를 눌러
// 대시보드로 들어가고, 플래그 OFF(홈 없음)면 아무것도 하지 않는다.
//
// 반환: 'dashboard'(이미 대시보드) | 'home→dashboard'(홈에서 진입) | false
// (timeout — 입실시험 등 다른 화면이 먼저 뜨거나 진입 실패). throw하지 않고
// console.warn만 남긴다 — 이후 호출부 단언이 진짜 실패를 드러낸다.
export async function enterVocaFromHome(page, { timeout = 15000 } = {}) {
  const home = page.locator('[data-testid="student-home"]')
  const dash = page.getByLabel('교과서 선택')
  const start = Date.now()
  let homeVisible = false
  while (Date.now() - start < timeout) {
    homeVisible = await home.isVisible().catch(() => false)
    if (homeVisible) break
    if (await dash.isVisible().catch(() => false)) return 'dashboard'
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  if (!homeVisible) {
    console.warn(`[enterVocaFromHome] ${timeout}ms 안에 학생 홈/대시보드 모두 보이지 않음`)
    return false
  }
  await page.locator('[data-testid="student-home-menu-voca"]').click()
  const ok = await dash.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
  if (!ok) { console.warn('[enterVocaFromHome] 단어 카드 클릭 후 대시보드("교과서 선택")가 나타나지 않음'); return false }
  return 'home→dashboard'
}
