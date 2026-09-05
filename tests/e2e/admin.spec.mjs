// tests/e2e/admin.spec.mjs
//
// 관리자 화면 시나리오 B1~B6(작업 지시서 기준). student.spec.mjs와 동일한
// mock 원칙 — installMocks()가 이 페이지의 모든 네트워크를 가로채고,
// 실제 Supabase/Vercel 요청 0건을 unmockedRequests로 보증한다.
//
// 실제 UI 구조는 작업 지시서가 상정한 "TextbookAssignmentPanel 드롭다운에
// 유닛 수 포함" 가정과 정확히 일치하지 않는다(코드 확인 결과, 유닛 수는
// "반 관리" 탭의 반 카드에, UUID로 구분되는 교과서 select는 "학생 관리"
// 탭의 "📚 교재 관리" 패널에 있다) — 두 화면을 조합해 같은 의도(B4 유닛 수
// 노출 / B5 UUID로 별개 판정 / B6 유사명 비혼입)를 검증한다.
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { ADMIN_PIN, QA_STUDENT_NAME, TB_A, TB_B, TB_C, TB_D } from './fixtures/index.mjs'

async function loginAdmin(page) {
  // 앱은 initWordLibrary(전체 캐시 로드)가 끝나야 로그인 화면(StudentSelect)을
  // 렌더한다 — verify:all 전체 실행 직후처럼 머신이 바쁠 때 30초 기본
  // 타임아웃으로는 부족했던 flake를 실측(2026-09-05)해서, 진입 화면을
  // 명시적으로 넉넉히 기다린 뒤 클릭한다.
  await page.locator('button', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 90000 })
  await page.locator('button', { hasText: '⚙️ 관리자' }).click()
  await page.getByPlaceholder('비밀번호').fill(ADMIN_PIN)
  await page.locator('button', { hasText: '로그인' }).click()
}

function studentsTabBtn(page) { return page.locator('button', { hasText: '👦 학생 관리' }).first() }

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function findClassCard(page, className) {
  // hasText(부분 문자열)로 카드 컨테이너를 직접 찾으면 오탐한다 — 다른
  // 카드를 펼쳤을 때 그 안의 "🔗 교재 연결" select 옵션 목록에 다른 반
  // 이름이 그대로 들어있어(예: "중1 동아 윤정미" 카드를 펼치면 그 안의
  // "연결할 교재 선택" select에 "중2 동아 윤정미"가 옵션으로 존재) 두 카드가
  // 동시에 매치되는 실제 케이스를 실측했다. 카드 헤더
  // <p className="font-black text-gray-800">{className}</p> 를 정확히
  // 일치시켜 찾고, 거기서 카드 컨테이너로 거슬러 올라간다.
  const header = page.locator('p.font-black.text-gray-800')
    .filter({ hasText: new RegExp(`^${escapeRegex(className)}$`) }).first()
  return header.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " card-shadow ")][1]')
}

export async function run(browser, baseURL) {
  const r = createRecorder('[admin]')
  const context = await browser.newContext()
  const page = await context.newPage()
  const { db, unmockedRequests, ttsFallbackRequests } = await installMocks(page)
  page.on('dialog', (d) => d.accept())

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

    // B1 — 관리자 로그인
    await loginAdmin(page)
    await page.locator('h1', { hasText: '⚙️ 관리자' }).waitFor({ state: 'visible', timeout: 15000 })
    r.check('B1 관리자 로그인 성공 — 관리자 화면 진입', true)

    // ── B4/B6 — "반 관리" 탭: 교과서 컨테이너 4종이 별개 카드, 라벨에 유닛 수 ──
    for (const tb of [TB_A, TB_B, TB_C, TB_D]) {
      const card = await findClassCard(page, tb.name)
      const visible = await card.isVisible().catch(() => false)
      r.check(`B4 "${tb.name}" 반 카드가 별개 항목으로 존재`, visible)
    }

    // B4 — 각 카드 라벨에 유닛 수 포함 (fixture: A/B=3개 유닛, C/D=1개 유닛)
    const cardA = await findClassCard(page, TB_A.name)
    const cardAText = await cardA.textContent()
    r.check('B4 "중1 천재 이상기" 카드에 유닛 수(3개 유닛) 표시', /3개\s*유닛/.test(cardAText || ''), cardAText)
    const cardC = await findClassCard(page, TB_C.name)
    const cardCText = await cardC.textContent()
    r.check('B4 "중1 동아 윤정미" 카드에 유닛 수(1개 유닛) 표시', /1개\s*유닛/.test(cardCText || ''), cardCText)

    // B6 — "중1 동아 윤정미"를 펼쳐도 "중2 동아 윤정미"의 유닛이 섞이지 않음
    // (fixture상 두 교재 모두 "Unit 1" 하나뿐이라, 진짜 검증은 "보기"를 눌러도
    // 카드가 여전히 정확히 이 교재 이름으로 식별되고 다른 교재 단어 수와
    // 섞이지 않는지다 — 아래 word count로 교차 확인).
    const viewBtnC = cardC.locator('button', { hasText: '보기' })
    await viewBtnC.click()
    const cardCOpenText = await cardC.textContent()
    r.check('B6 "중1 동아 윤정미" 펼침 화면에 자기 유닛(Unit 1)만 표시', /Unit 1/.test(cardCOpenText || '') && !/Unit 2/.test(cardCOpenText || ''), cardCOpenText)
    const wordsC = TB_C.unitWordCounts[0]
    r.check(`B6 "중1 동아 윤정미" Unit 1 단어 수(${wordsC}개)가 표시됨`, new RegExp(`${wordsC}개\\s*단어`).test(cardCOpenText || ''), cardCOpenText)
    // 카드를 직접 접지 않는다 — "보기" 버튼은 열리면 "닫기"로 텍스트가
    // 바뀌므로 재검색 없이 재클릭하면 타임아웃난다. viewClass는 전역
    // state 하나(AdminScreen.jsx)라 아래에서 D를 열면 C는 자동으로 닫힌다.
    const cardD = await findClassCard(page, TB_D.name)
    const viewBtnD = cardD.locator('button', { hasText: '보기' })
    await viewBtnD.click()
    const cardDOpenText = await cardD.textContent()
    r.check('B6 "중2 동아 윤정미" 펼침 화면도 자기 유닛만(다른 교재 유닛명과 안 섞임)', /Unit 1/.test(cardDOpenText || ''), cardDOpenText)
    // 진짜 회귀 검증 — 카드 헤더/유닛명은 같은 이름("Unit 1")이라 텍스트만
    // 봐서는 안 섞였는지 알 수 없다. 실제 단어 목록(fixture word id, C/D가
    // 서로 다른 접두사로 생성됨)이 자기 카드에만 나타나는지로 판정한다.
    // ("🔗 교재 연결" select 옵션에는 상대 교재 "이름"이 나타나는 게
    // 정상이므로 이름 문자열이 아니라 단어 id로 교차 오염을 판정한다.)
    r.check('B6 카드 C에 자기 단어만(D의 단어 id가 섞이지 않음)', cardCOpenText?.includes(TB_C.id + '-w1-1') && !cardCOpenText?.includes(TB_D.id + '-w1-1'), JSON.stringify({ cardCOpenText }))
    r.check('B6 카드 D에 자기 단어만(C의 단어 id가 섞이지 않음)', cardDOpenText?.includes(TB_D.id + '-w1-1') && !cardDOpenText?.includes(TB_C.id + '-w1-1'), JSON.stringify({ cardDOpenText }))

    // ── B2/B3/B5 — "학생 관리" 탭 ──────────────────────────────────────
    await studentsTabBtn(page).click()
    const testToggle = page.locator('label', { hasText: '🧪 테스트 계정 보기' }).locator('input[type="checkbox"]')
    await testToggle.waitFor({ state: 'visible', timeout: 10000 })
    await testToggle.check()
    await page.getByPlaceholder('🔍 학생 이름 · 반 · 교재 · 출판사 검색').fill(QA_STUDENT_NAME)

    // B2 — QA 학생 카드가 보이고 이름 표시(실명 없음 — fixture 자체가 합성)
    const studentCard = page.locator('p.font-black.text-gray-800.break-keep', { hasText: QA_STUDENT_NAME })
    const studentVisible = await studentCard.first().isVisible().catch(() => false)
    r.check('B2 QA 학생 카드가 검색 결과에 표시됨', studentVisible)
    r.check('B2 카드에 학생 이름(fixture 합성 계정명)이 표시됨', (await studentCard.first().textContent())?.trim() === QA_STUDENT_NAME)

    // B3 — 배정 교재 목록: A/B 둘 다 표시, primary 표시는 A에만("(현재)")
    await page.locator('button', { hasText: '📚 교재 관리' }).first().click()
    const summaryLocator = page.locator('p', { hasText: '배정 교과서:' }).first()
    await summaryLocator.locator('..').getByText(TB_B.name).waitFor({ state: 'visible', timeout: 10000 })
    const summaryText = await summaryLocator.textContent()
    r.check('B3 primary 교재(A)가 배정 목록에 있고 "(현재)" 표시', new RegExp(`${TB_A.name}\\(현재\\)`).test(summaryText || ''), summaryText)
    r.check('B3 secondary 교재(B)도 배정 목록에 있음("(현재)" 없이)', summaryText?.includes(TB_B.name) && !new RegExp(`${TB_B.name}\\(현재\\)`).test(summaryText || ''), summaryText)
    r.check('B3 유사명 함정 교재(C/D)는 이 학생 배정 목록에 없음', !summaryText?.includes(TB_C.name) && !summaryText?.includes(TB_D.name), summaryText)

    // B5 — 이미 배정된 A/B를 뺀 "배정할 교과서 선택" select에는 C/D만 남고,
    // 값(=UUID)이 서로 다르다(문자열 라벨이 아니라 value 속성으로 판정).
    const addSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '배정할 교과서 선택' }) })
    const addOptions = await addSelect.locator('option').all()
    const optionPairs = []
    for (const opt of addOptions) {
      const value = await opt.getAttribute('value')
      const text = (await opt.textContent())?.trim()
      if (value) optionPairs.push({ value, text })
    }
    r.check('B5 addable 교과서 select에 정확히 2개(C/D)만 남음(A/B는 이미 배정됨)', optionPairs.length === 2, JSON.stringify(optionPairs))
    // 라벨은 src/utils/textbookLabel.js의 textbookOptionLabel — "이름 (출판사)
    // · 유닛 N개"(2026-09-03, 이름만 같고 학년 다른 두 교재 오선택 방지 목적).
    // 값(=UUID)으로 판정하되, 라벨도 그 근거 형식을 그대로 실측 확인한다.
    const optC = optionPairs.find((o) => o.text === `${TB_C.name} (${TB_C.publisher}) · 유닛 ${TB_C.unitWordCounts.length}개`)
    const optD = optionPairs.find((o) => o.text === `${TB_D.name} (${TB_D.publisher}) · 유닛 ${TB_D.unitWordCounts.length}개`)
    r.check('B5 "중1 동아 윤정미" 옵션의 value가 fixture UUID와 정확히 일치', optC?.value === TB_C.id, JSON.stringify(optC))
    r.check('B5 "중2 동아 윤정미" 옵션의 value가 fixture UUID와 정확히 일치', optD?.value === TB_D.id, JSON.stringify(optD))
    r.check('B5 두 옵션의 value(UUID)가 서로 다름(라벨 유사성과 무관하게 구분됨)', !!optC && !!optD && optC.value !== optD.value, JSON.stringify({ optC, optD }))
  } catch (err) {
    // 진단 — 예외 시점의 화면 텍스트/mock 오류를 에러 메시지에 실어 러너가
    // 그대로 출력하게 한다(페이지는 finally에서 닫히므로 여기서만 읽을 수 있다).
    const bodyText = await page.locator('body').innerText().catch(() => '(body 읽기 실패)')
    err.message += `\n  [진단] mockErrors=${JSON.stringify(db.errors.slice(0, 3))}\n  [진단] body(앞 400자)=${JSON.stringify(bodyText.slice(0, 400))}`
    throw err
  } finally {
    await context.close()
  }

  return { results: r.results, unmockedRequests, mockErrors: db.errors, ttsFallbackRequests }
}
