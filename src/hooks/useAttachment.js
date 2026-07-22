// useAttachment(2026-07-22, 애착 시스템) — 파생 + 판정 + 반영 글루 훅.
//
// 역할: (1) useStudent record에서 deriveAttachmentStats 파생, (2) 반/유닛
// 단어 목록을 wordLibrary에서 구성, (3) 마운트 시 1회 모자/밀스톤 판정을
// 돌려 새 이벤트를 grantHats/addMilestones로 반영. Dashboard가 화면 전환
// 때마다 리마운트되므로 학습 세션이 끝나고 돌아올 때마다 자연히 재판정
// 된다(별도 폴링/구독 없음).
//
// 판정은 전부 순수 함수(hatSystem/milestones) — 이 훅은 배선만 한다.
// 반영 API는 멱등(useStudent가 키 중복을 무시)이라 몇 번 불려도 안전.
import { useEffect, useMemo, useRef } from 'react'
import { deriveAttachmentStats, completedUnits } from '../utils/attachment/attachmentCore'
import { evaluateHatUnlocks, hatById } from '../utils/attachment/hatSystem'
import { detectNewMilestones } from '../utils/attachment/milestones'
import { getStudentClass, getClassUnits, getClassWords, getClassIdByName } from '../utils/wordLibrary'

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
      words: getClassWords(className, u.name),
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
    if (newHats.length > 0) grantHats(newHats)
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

  return { stats, lib, unitsDone, textbooksDone, wordTextById }
}
