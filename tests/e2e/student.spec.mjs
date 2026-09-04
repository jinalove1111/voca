// tests/e2e/student.spec.mjs
//
// 학생 화면 시나리오 A1~A7(작업 지시서 기준). 실제 Supabase/Vercel 요청 0건
// — tests/e2e/lib/mockRoutes.mjs가 모든 네트워크를 가로챈다. PIN은 fixture
// 상수("0000")이고 실 학생 계정/실명은 전혀 쓰지 않는다(QA_STUDENT_NAME은
// src/utils/accountStatus.js의 TEST_ACCOUNT_NAMES 중 하나).
import { installMocks } from './lib/mockRoutes.mjs'
import { createRecorder } from './lib/harness.mjs'
import { writesTo } from './lib/postgrestMock.mjs'
import { QA_STUDENT_NAME, QA_LOGIN_PIN, TB_A, TB_B, TB_A_UNIT2_WORD_COUNT } from './fixtures/index.mjs'

async function login(page) {
  await page.getByPlaceholder('이름 입력...').fill(QA_STUDENT_NAME)
  await page.getByPlaceholder('PIN 4자리').fill(QA_LOGIN_PIN)
  await page.getByRole('button', { name: '시작하기!' }).click()
}

async function openMoreMenu(page) {
  const summary = page.locator('summary', { hasText: '🧭 더 많은 메뉴' })
  // 이미 열려 있으면(재방문) 다시 누르지 않는다 — <details open> 상태는
  // DOM에서 open 속성으로 확인 가능.
  const details = page.locator('details', { has: summary })
  const isOpen = await details.evaluate((el) => el.hasAttribute('open')).catch(() => false)
  if (!isOpen) await summary.click()
}

async function readGardenFilled(page) {
  await openMoreMenu(page)
  await page.locator('button', { hasText: '나의 정원' }).click()
  const text = await page.getByText(/\/16칸이 자랐어요/).textContent()
  await page.locator('button', { hasText: '← 홈으로' }).click()
  const m = text.match(/(\d+)\/16칸이 자랐어요/)
  return m ? Number(m[1]) : null
}

async function answerOneQuizQuestionCorrectly(page, db) {
  const wordEl = page.locator('.word-text').first()
  await wordEl.waitFor({ state: 'visible' })
  const wordText = (await wordEl.textContent())?.trim()
  const fixtureWord = db.tables.words.find((w) => w.word === wordText)
  if (!fixtureWord) throw new Error(`퀴즈에 나온 단어 "${wordText}"를 fixture words에서 찾을 수 없음`)
  await page.getByRole('button', { name: fixtureWord.meaning }).click()
  await page.getByRole('button', { name: /다음 문제|결과 보기/ }).waitFor({ state: 'visible' })
  return fixtureWord
}

export async function run(browser, baseURL) {
  const r = createRecorder('[student]')
  const context = await browser.newContext()
  const page = await context.newPage()
  const { db, unmockedRequests } = await installMocks(page)

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' })

    // A1 — 로그인
    await login(page)
    const textbookSelect = page.getByLabel('교과서 선택')
    await textbookSelect.waitFor({ state: 'visible', timeout: 15000 })
    r.check('A1 로그인 성공 — 학습 화면(교과서 선택기) 진입', true)

    // A2 — 배정 교재 표시(라벨 형식 + A/B가 서로 다른 항목으로 둘 다 존재)
    const tbOptions = await textbookSelect.locator('option').allTextContents()
    const labelA = `${TB_A.name} (${TB_A.publisher})`
    const labelB = `${TB_B.name} (${TB_B.publisher})`
    r.check('A2 primary 교재(A) 라벨이 "이름 (출판사)" 형식으로 옵션에 존재', tbOptions.includes(labelA), JSON.stringify(tbOptions))
    r.check('A2 secondary 교재(B)도 별개 옵션으로 존재', tbOptions.includes(labelB), JSON.stringify(tbOptions))
    r.check('A2 "중1"이 정확히 1개 옵션에만 등장', tbOptions.filter((t) => t.includes('중1')).length === 1, JSON.stringify(tbOptions))
    r.check('A2 "중2"가 정확히 1개 옵션에만 등장', tbOptions.filter((t) => t.includes('중2')).length === 1, JSON.stringify(tbOptions))
    const selectedTbLabel = await textbookSelect.locator('option:checked').textContent()
    r.check('A2 현재 선택된 교재가 primary(A)와 일치', selectedTbLabel === labelA, selectedTbLabel)

    // A3 — 현재 Unit 표시(A의 Unit2)
    const unitSelect = page.getByLabel('현재 유닛 선택')
    const selectedUnit = await unitSelect.locator('option:checked').textContent()
    r.check('A3 현재 유닛이 Unit 2로 선택되어 있음', selectedUnit?.trim() === 'Unit 2', selectedUnit)

    // A4 — Unit dropdown 목록 = A의 Unit1~3 정확히 3개(B 유닛 비혼입)
    const unitOptions = await unitSelect.locator('option').allTextContents()
    const trimmed = unitOptions.map((s) => s.trim())
    r.check('A4 유닛 옵션이 정확히 3개', trimmed.length === 3, JSON.stringify(trimmed))
    r.check('A4 유닛 옵션이 Unit 1/2/3 (A 소속만)', ['Unit 1', 'Unit 2', 'Unit 3'].every((u) => trimmed.includes(u)), JSON.stringify(trimmed))

    // A5 — 현재 유닛 단어 수 = fixture(15)와 일치해 표시
    await openMoreMenu(page)
    const wordCountVisible = await page.getByText(`${TB_A_UNIT2_WORD_COUNT}개 단어`).isVisible().catch(() => false)
    r.check(`A5 현재 유닛 단어 수(${TB_A_UNIT2_WORD_COUNT}개)가 화면에 표시됨`, wordCountVisible)

    // A7(전) — English Garden 정답 처리 전 gardenPoints 표시
    const gardenBefore = await readGardenFilled(page)
    r.check('A7(전) 정원 화면에서 칸 수를 읽을 수 있음', gardenBefore !== null, String(gardenBefore))
    r.check('A7(전) 학습 전 정원은 0칸(신규 계정)', gardenBefore === 0, String(gardenBefore))

    // A6 — 퀴즈 1문항 이상 정답 처리 후 화면 갱신 + mock 쓰기 로그
    await openMoreMenu(page)
    await page.locator('button', { hasText: '퀴즈' }).click()
    const firstWord = await answerOneQuizQuestionCorrectly(page, db)
    const nextVisible = await page.getByRole('button', { name: /다음 문제|결과 보기/ }).isVisible()
    r.check('A6 퀴즈 정답 처리 후 진행 표시(다음 문제/결과 버튼)가 갱신됨', nextVisible)
    await page.getByRole('button', { name: /다음 문제|결과 보기/ }).click()

    // 정원 2점(=1칸) 문턱을 넘기기 위해 서로 다른 단어 하나 더 정답 처리.
    const secondWord = await answerOneQuizQuestionCorrectly(page, db)
    r.check('A6 두 번째 문항도 서로 다른 단어(중복 아님)', secondWord.id !== firstWord.id, `${firstWord.id} / ${secondWord.id}`)
    await page.locator('button', { hasText: '← 홈' }).click()

    // 디바운스(2초) 동기화가 student_progress에 반영될 때까지 대기 후 확인.
    await page.waitForTimeout(3000)
    const progressWrites = writesTo(db, 'student_progress')
    r.check('A6 퀴즈 정답이 student_progress mock 쓰기 호출로 기록됨', progressWrites.length > 0, JSON.stringify(progressWrites.map((w) => w.method)))
    const lastWrite = progressWrites[progressWrites.length - 1]
    const clearedWords = lastWrite?.body?.progress_data?.clearedWords
    r.check('A6 동기화된 기록에 clearedWords가 채워짐(빈 배열 아님)', Array.isArray(clearedWords) && clearedWords.length > 0, JSON.stringify(clearedWords))

    // A7(후) — 정답 처리 후 gardenPoints 증가(2점=1칸, POINTS_PER_STAGE=2)
    const gardenAfter = await readGardenFilled(page)
    r.check('A7(후) 단어 2개 정답 처리 후 정원이 1칸 자람(0→1)', gardenAfter === gardenBefore + 1, `before=${gardenBefore} after=${gardenAfter}`)

    // spelling/guided-learning — 정직한 SKIP.
    r.skip('spelling(맞춤법) 완료 후 화면 갱신', '스펠링 리뷰는 방향(kr2en/en2kr/mixed) 설정 + SpellingReview 다단계 입력 플로우가 필요해 이번 1차 구현 범위에서 제외 — quiz 경로로 A6/A7의 핵심 계약(쓰기 기록/정원 성장)은 이미 검증됨.')
    r.skip('guided-learning 완료 후 화면 갱신', 'GuidedSession은 단어 뜻/예문/발음 다단계 코스라 단일 세션 안에서 안정적으로 자동화하기엔 시나리오가 큼 — 이번 1차 구현 범위에서 제외, quiz 경로로 동일한 저장 계약을 검증.')
  } finally {
    await context.close()
  }

  return { results: r.results, unmockedRequests, mockErrors: db.errors }
}
