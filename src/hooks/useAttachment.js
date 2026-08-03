// useAttachment(2026-07-22, 애착 시스템) — 파생 + 판정 + 반영 글루 훅.
//
// 역할: (1) useStudent record에서 deriveAttachmentStats 파생, (2) 반/유닛
// 단어 목록을 wordLibrary에서 구성, (3) 모자/밀스톤 판정을 돌려 새 이벤트를
// grantHats/addMilestones로 반영.
//
// 판정 타이밍 정정(Phase 2 M1(d), 2026-08-03) — 예전 주석은 "Dashboard가
// 화면 전환마다 리마운트되므로 학습 후 자연히 재판정된다"고 적혀 있었지만
// 실제와 다르다. 이 훅은 App.jsx 최상단에서 호출되고, App.jsx는 화면
// 전환(setScreen)마다 리마운트되지 않는다 — 같은 컴포넌트 안에서 조건부
// 렌더만 바뀌므로 이 훅도 세션 내내 마운트를 유지한다. 실제 판정은 아래
// effect의 ranRef 가드 때문에 studentId당 딱 1회만 돈다(로그인/복원 완료
// 직후) — 학습 세션 중간에 모자/밀스톤을 다시 계산하지 않고, 다음
// 로그인(또는 새로고침으로 App.jsx 자체가 다시 마운트될 때)까지는 그때
// 계산된 값을 그대로 쓴다.
//
// 판정은 전부 순수 함수(hatSystem/milestones) — 이 훅은 배선만 한다.
// 반영 API는 멱등(useStudent가 키 중복을 무시)이라 몇 번 불려도 안전.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deriveAttachmentStats, completedUnits } from '../utils/attachment/attachmentCore'
import { evaluateHatUnlocks, hatById } from '../utils/attachment/hatSystem'
import { detectNewMilestones } from '../utils/attachment/milestones'
import { getStudentClass, getClassUnits, getClassWords, getClassIdByName, wordSlug } from '../utils/wordLibrary'
import { trackEvent, EV } from '../utils/productEvents'

// getClassWords()가 돌려주는 단어 객체의 id는 words.id(UUID) — 애착 시스템의
// cleared/missions/spellingWrongToday/wordStatus 키는 전부 단어 텍스트
// 슬러그(mapWordRow의 id: wordSlug(cw.word), wordLibrary.js)다. 두 축이
// 다르면 completedUnits()의 clearedSet.has(w.id)가 항상 false가 되고
// masteryTierFor의 word.dbId 조회도 dbId 필드 자체가 없어 항상 비게 된다
// (2026-08-03 P0 — 유닛완주/졸업모자/박물관/책장/폴의 기억 전부 죽어
// 있었음, 라이브 증거: unit-complete 밀스톤 0건/hat_graduation 0명).
//
// 고치는 자리는 여기(이 훅) 하나뿐이어야 한다 — getClassWords() 자체는
// 절대 바꾸지 않는다(AdminScreen 등 다른 소비처가 UUID 축을 그대로
// 전제하고 쓴다). wordSlug는 기존 단일 원본(wordLibrary.js, 2026-08-02
// 단일화됨)을 그대로 재사용 — 새 슬러그 로직을 만들지 않는다.
function toAttachmentWord(raw) {
  return { ...raw, id: wordSlug(raw.word), dbId: raw.id }
}

// 반의 유닛별 단어 목록 — 유닛 완료/박물관/책장이 공유하는 형태.
// wordLibrary 캐시는 동기 조회라 여기서 바로 구성한다.
export function buildWordsByUnit(studentId) {
  const className = getStudentClass(studentId)
  if (!className) return { className: '', classId: null, wordsByUnit: [] }
  const units = getClassUnits(className)
  return {
    className,
    classId: getClassIdByName(className),
    wordsByUnit: units.map((u) => ({
      unitId: u.id,
      unitName: u.name,
      words: getClassWords(className, u.name).map(toAttachmentWord),
    })),
  }
}

export function useAttachment(studentId, studentData) {
  const { cleared, wordStatus, missions, history, streak, spellingReviewQueue, hatInventory, milestones, grantHats, addMilestones, restoreChecked } = studentData

  const stats = useMemo(
    () => deriveAttachmentStats({ cleared, wordStatus, missions, history, streak, spellingReviewQueue }),
    [cleared, wordStatus, missions, history, streak, spellingReviewQueue],
  )
  const lib = useMemo(() => buildWordsByUnit(studentId), [studentId])
  const unitsDone = useMemo(() => completedUnits(lib.wordsByUnit, stats.clearedSet), [lib, stats])
  const textbooksDone = useMemo(() => {
    // 교재 완주 = 반의 모든(1개 이상) 유닛 완주
    if (!lib.classId || lib.wordsByUnit.length === 0) return []
    const nonEmpty = lib.wordsByUnit.filter((u) => u.words.length > 0)
    if (nonEmpty.length === 0) return []
    const doneIds = new Set(unitsDone.map((u) => u.unitId))
    return nonEmpty.every((u) => doneIds.has(u.unitId))
      ? [{ classId: lib.classId, className: lib.className }]
      : []
  }, [lib, unitsDone])

  // 모자 수여식 큐(Paul Town v2.0, 2026-07-22) — 세션 로컬 state만
  // (영속 없음 — 새 레코드 필드 금지 규칙 그대로). "무한 재생 안 됨"은
  // 별도 '봤는지' 플래그가 아니라 구조로 보장된다: grantHats는 멱등이고
  // evaluateHatUnlocks의 newHats는 실제 획득 순간(인벤토리에 아직 없는데
  // 규칙 충족)에만 비지 않으므로, 큐는 그 순간에만 채워진다. 여러 개면
  // 한 번에 하나씩(dismissCeremony로 shift).
  const [ceremonyQueue, setCeremonyQueue] = useState([])

  // 판정 → 반영: 학생당·마운트당 1회(StrictMode 이중 실행은 반영 API의
  // 멱등성이 흡수). restoreChecked 전에는 판정하지 않는다 — 클라우드 복원
  // 전의 빈 record로 판정하면 "얻을 게 없다"는 결론이 나올 뿐 오지급은
  // 없지만(임계값이 전부 >0), App.jsx 로딩 게이트와 같은 원칙을 따른다.
  const ranRef = useRef(null)
  useEffect(() => {
    if (!studentId || !restoreChecked || ranRef.current === studentId) return
    ranRef.current = studentId
    const ctx = { completedUnits: unitsDone, completedTextbooks: textbooksDone }
    const ownedIds = hatInventory.map((h) => h.hatId)
    const newHats = evaluateHatUnlocks(stats, ctx, ownedIds)
    if (newHats.length > 0) {
      grantHats(newHats)
      trackEvent(studentId, EV.hatEarned) // 익명 관찰 — 획득 사실만(모자 종류/개인정보 없음)
      // 수여식 큐 적재 — 카탈로그 엔트리(색/이름/출처 라벨 포함)로 변환.
      // 표시 여부(hatCeremony 플래그)는 Dashboard가 게이트한다.
      // Phase 2 M1(e, 2026-08-03) — 예전엔 setCeremonyQueue(newHats...)가
      // 큐를 통째로 덮어썼다. 이 effect는 studentId당 1회만 돌지만(위
      // ranRef), 그 1회 안에서도 이번 판정으로 여러 모자를 동시에 얻을 수
      // 있고(예: 유닛 완주 모자 + 졸업 모자가 같은 순간 조건 충족), 이론상
      // 훗날 판정 지점이 늘어나 같은 세션에 두 번째 적재가 생겨도 대기
      // 중이던 수여식이 사라지지 않도록 append로 바꾼다. 지급 자체
      // (grantHats)는 이미 멱등이므로 여기서는 "표시 큐"만 다루고, 같은
      // hatId가 큐에 두 번 들어가는 것만 막는다(중복 표시 방지).
      setCeremonyQueue((q) => {
        const seen = new Set(q.map((h) => h.id))
        const additions = newHats.map((e) => hatById(e.hatId)).filter((h) => h && !seen.has(h.id))
        return additions.length > 0 ? [...q, ...additions] : q
      })
    }
    const newHatMeta = newHats.map((e) => {
      const h = hatById(e.hatId)
      return { hatId: e.hatId, name: h?.name || e.hatId, emoji: h?.emoji || '🎩' }
    })
    const existingMilestoneIds = milestones.map((m) => m.id)
    const events = detectNewMilestones(stats, { ...ctx, newHats: newHatMeta }, existingMilestoneIds)
    if (events.length > 0) addMilestones(events)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, restoreChecked])

  // 폴의 기억용 슬러그→표시 단어 맵(실단어 언급의 진실성 원천)
  const wordTextById = useMemo(() => {
    const m = new Map()
    for (const u of lib.wordsByUnit) for (const w of u.words) if (!m.has(w.id)) m.set(w.id, w.word)
    return m
  }, [lib])

  // 수여식 — 큐의 첫 모자 하나만 노출, 닫으면 다음 모자로(한 번에 하나씩).
  const pendingCeremonyHat = ceremonyQueue[0] || null
  const dismissCeremony = useCallback(() => setCeremonyQueue((q) => q.slice(1)), [])

  return { stats, lib, unitsDone, textbooksDone, wordTextById, pendingCeremonyHat, dismissCeremony }
}
