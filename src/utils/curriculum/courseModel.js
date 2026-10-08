import { COMM_GOALS } from './commGoals.js'

// 2026-10-08(224차) Paul English 통합 과정 — 공통 데이터 구조(순수 모듈). 기준: 운영자 설계안
// Paul_English_Integrated_Curriculum_v1.md(§2 과정, §3 Unit 구조·지원 단계, §11 학생 상태 필드, §12 Unit 필드).
// 기간·블록 범위는 설계안이 밝힌 대로 "운영 가안"이며 자동 진급·기간 보장과 무관하다. 영국 학년·CEFR·교재 권수를
// 자체 레벨에 자동 대응시키지 않는다(필드 자체가 없다).
export const COURSES = [
  { id: 'phonics', titleKo: '파닉스', monthsKo: '9~12개월(가안)', focusKo: '음소 인식·소리-철자·합성·분절·초기 해독', blocks: ['P1', 'P2', 'P3', 'P4', 'P5'] },
  { id: 'conversation', titleKo: '회화', monthsKo: '18개월(가안)', focusKo: '질문·대답·되묻기·요청·선택·경험 말하기', blocks: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] },
  { id: 'presentation', titleKo: '발표', monthsKo: '9개월(가안)', focusKo: '설명·이야기·비교·이유·청중 질문 응답', blocks: ['PR1', 'PR2', 'PR3'] },
  { id: 'readingGrammar', titleKo: '독해·문법', monthsKo: '12개월(가안)', focusKo: '내용 이해·추론·근거·요약, 문법의 의미와 사용', blocks: ['RG1', 'RG2', 'RG3', 'RG4'] },
  { id: 'middle', titleKo: '중등 연결', monthsKo: '입학 시점에 맞춤', focusKo: '교과 독해·듣기·서술형·문법·수행평가', blocks: ['MB'] },
]

// 회화 블록(설계안 §5) — 중심 기능·주제만. 문법 예시는 설계 순서이지 교재 단원이 아니다
export const CONVERSATION_BLOCKS = [
  { id: 'C1', monthsKo: '1~3개월', themeKo: '나·교실·소지품: 소개, 식별, 소유, 도움 요청', goalIds: ['greeting', 'requesting', 'asking-info'] },
  { id: 'C2', monthsKo: '4~6개월', themeKo: '친구·가족·취향·능력: 묻고 답하고 되묻기', goalIds: ['preferences', 'asking-info'] },
  { id: 'C3', monthsKo: '7~9개월', themeKo: '하루·시간·집·위치: 생활과 현재 행동 구분', goalIds: ['describing', 'asking-info'] },
  { id: 'C4', monthsKo: '10~12개월', themeKo: '간식·쇼핑·길·약속: 선택·가격·요청·제안', goalIds: ['shopping', 'suggesting', 'hosting'] },
  { id: 'C5', monthsKo: '13~15개월', themeKo: '경험·작은 문제: 과거 사건, 감정과 이유', goalIds: ['describing', 'apologising', 'helping'] },
  { id: 'C6', monthsKo: '16~18개월', themeKo: '계획·비교·문제 해결: 친구와 결정하기', goalIds: ['teamwork', 'suggesting', 'inviting'] },
]

// 227차: 말하기·쓰기 수행 수준 사다리(운영자 지시) — Unit이 요구하는 "실제로 하는 행동"의 크기. 학생의 영구 레벨이 아니라
// Unit의 목표 수행이며, 말하기와 쓰기는 따로 본다(한 학생이 말하기 '발전'·쓰기 '기초'일 수 있다). 교재 번호·나이로 단정하지 않는다.
export const PERFORMANCE_LEVELS = [
  { id: 'entry', titleKo: '입문', speakingKo: '단어·짧은 구 말하기', writingKo: '글자·단어 쓰기' },
  { id: 'basic', titleKo: '기초', speakingKo: '한 문장 말하기', writingKo: '문장 틀 완성·한 문장' },
  { id: 'developing', titleKo: '발전', speakingKo: '질문·응답 주고받기', writingKo: '자기 문장 2~3개' },
  { id: 'expanding', titleKo: '확장', speakingKo: '이유·과거 경험·계획 설명', writingKo: '연결된 짧은 글' },
  { id: 'presenting', titleKo: '발표', speakingKo: '내용 구성·요약·후속 질문 응답', writingKo: '발표 원고 작성' },
]
export const performanceById = (id) => PERFORMANCE_LEVELS.find((p) => p.id === id) || null
// 과정의 단계(블록) 목록 — 화면의 과정 → 단계 → Unit 선택에 쓴다. 단계에 Unit이 없으면 화면은 '미제작'으로 표시한다
export const blocksForCourse = (courseId) => (COURSES.find((c) => c.id === courseId) || { blocks: [] }).blocks
// 블록 한국어 라벨(짧게): 회화 C1 → '1단계'
export const blockLabelKo = (blockId) => { const m = /^[A-Z]+(\d+)$/.exec(blockId); return m ? `${m[1]}단계` : blockId }

// Unit 교육 프로필(운영자 지시 8항목) — 선택 필드지만 있으면 전부 한국어 배열이어야 한다. validateUnit이 함께 검사한다
export const UNIT_PROFILE_KEYS = ['prerequisitesKo', 'canDoKo', 'languageKo', 'activitiesKo', 'teacherCheckKo', 'supportKo', 'extensionKo', 'recycleKo']

// 지원 단계(설계안 §3) — 영어 수준이 아니라 같은 목표에 주는 도움 정도. 수준(level)과 별도 필드로 둔다
export const SUPPORT_STAGES = [
  { id: 'with-model', titleKo: '모범과 함께', descKo: '모범 문장·뜻·음성을 보고 들으며 해요' },
  { id: 'with-cues', titleKo: '단서로', descKo: '단어 몇 개나 그림 단서만 보고 해요' },
  { id: 'alone', titleKo: '혼자', descKo: '모범 없이 혼자 해요' },
  { id: 'new-situation', titleKo: '새 상황에서', descKo: '물건·장소·상대가 바뀐 상황에서 해요' },
]
// 영역별 지원 필요를 따로 둔다(말하기 vs 읽기·쓰기)
export const SUPPORT_AREAS = ['speaking', 'literacy']

// 학생 활동 기록 상태(설계안 §12) — 앱이 스스로 켤 수 있는 것은 completed·selfChecked뿐.
// teacherObserved·demonstratedIndependent는 교사 확인/관찰로만(이번 구현은 기기 임시 저장·기록 없음), reviewNeeded는 교사/학생이 표시.
export const RECORD_FLAGS = ['completed', 'selfChecked', 'teacherObserved', 'demonstratedIndependent', 'reviewNeeded']
export const APP_SETTABLE_FLAGS = ['completed', 'selfChecked']

// Unit 활동 종류(설계안 §3 순서)
export const ACTIVITY_KINDS = ['vocab', 'listening', 'reading', 'speaking', 'grammar', 'writing', 'review']

// Unit 데이터 계약 검사(테스트·추가 콘텐츠 검수용). 문제가 있으면 메시지 배열을 돌려준다(빈 배열 = 통과)
export function validateUnit(u) {
  const errs = []
  const need = (cond, msg) => { if (!cond) errs.push(msg) }
  need(u && typeof u.id === 'string' && /^[a-z0-9-]+$/.test(u.id), 'id')
  need(COURSES.some((c) => c.id === u.course && c.blocks.includes(u.block)), 'course/block')
  need(COMM_GOALS.some((g) => g.id === u.goalId), 'goalId')
  need([1, 2, 3].includes(u.level), 'level')
  need(typeof u.titleKo === 'string' && u.titleKo.length <= 16 && !/[A-Za-z]/.test(u.titleKo), 'titleKo')
  need(typeof u.situationKo === 'string' && u.situationKo.length <= 60 && !/[A-Za-z]/.test(u.situationKo), 'situationKo')
  need(Array.isArray(u.vocab) && u.vocab.length >= 4 && u.vocab.every((v) => v.en && v.ko), 'vocab')
  need(u.listening && Array.isArray(u.listening.turns) && u.listening.turns.length >= 4 && u.listening.turns.every((t) => ['Paul', 'Mia'].includes(t.speaker) && t.en), 'listening.turns')
  const okIdx = (c) => (Array.isArray(c) ? c.length > 0 && c.every((i) => i >= 0 && i < 3) : c >= 0 && c < 3)
  need(u.listening && u.listening.questions.length >= 2 && u.listening.questions.every((q) => q.options.length === 3 && okIdx(q.correct) && q.promptKo && q.whyKo), 'listening.questions')
  need(u.reading && typeof u.reading.text === 'string' && u.reading.text.split(/\s+/).length <= 80, 'reading.text')
  need(u.reading && u.reading.items.length >= 3 && u.reading.items.every((q) => q.promptKo && q.evidence && u.reading.text.includes(q.evidence) && (q.type === 'tf' ? typeof q.answer === 'boolean' : q.options.length === 3 && okIdx(q.correct))), 'reading.items')
  need(u.grammar && u.grammar.noticing.length >= 2 && u.grammar.items.length >= 3 && u.grammar.items.every((q) => q.options.length === 3 && okIdx(q.correct) && q.whyKo), 'grammar')
  need(u.speaking && u.speaking.steps.length === 3, 'speaking.steps')
  need(Array.isArray(u.review) && u.review.length >= 2 && u.review.every((r) => r.situationKo && r.situationKo.length <= 40 && !/[A-Za-z]/.test(r.situationKo) && r.model && Array.isArray(r.alternatives)), 'review')
  need(Array.isArray(u.sources) && u.sources.length > 0, 'sources')
  // 227차: 수행 수준(말하기·쓰기 따로)과 교육 프로필 — 있으면 유효해야 한다
  if (u.performance !== undefined) need(u.performance && performanceById(u.performance.speaking) && performanceById(u.performance.writing), 'performance')
  if (u.profile !== undefined) need(u.profile && UNIT_PROFILE_KEYS.every((k) => Array.isArray(u.profile[k]) && u.profile[k].length > 0 && u.profile[k].every((s) => typeof s === 'string')), 'profile')
  return errs
}
