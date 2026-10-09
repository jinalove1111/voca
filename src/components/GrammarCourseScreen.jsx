import { useEffect, useState } from 'react'
import { speak, stopSpeaking } from '../utils/speech'
import { BTN } from './SpeakingPracticeItem'
import { Choice } from './UnitScreen'
import { GRAMMAR_COURSES } from '../utils/grammar/grammarCourses'
import { unitsForCourse, grammarUnitById, courseCounts, reviewStatusOf, resolveChoice, SCHOOL_GRAMMAR_NOTE_KO } from '../utils/grammar/grammarUnits'

// 2026-10-10 문법 과정 화면(QA 전용): 과정 5개 → 단원 목록(학습 목표) → 단원 9단계. 점수·저장·DB 없음(화면 상태일 뿐).
// 선택 연습은 기존 Choice를 그대로 재사용하고, 준비 중 단원은 비활성으로 보여 빈 화면이 없다.
const CARD = 'bg-white rounded-3xl p-5 card-shadow space-y-3'
const ITEM = 'w-full min-h-[64px] px-4 py-3 rounded-3xl text-left btn-press card-shadow'
const TA = 'w-full min-h-[88px] px-4 py-3 rounded-2xl border-2 border-gray-200 focus:border-sky-400 outline-none text-lg font-bold text-gray-900 resize-y'
const H = 'text-sm font-black text-indigo-700'
const Listen = ({ testid, en }) => (
  <button data-testid={testid} aria-label="듣기" onClick={() => speak(en)} className={`${BTN} !px-3 bg-white card-shadow text-lg shrink-0`}>🔊</button>
)
const Result = ({ testid, ok, whyKo, onRetry }) => (
  <div className="space-y-1">
    <p data-testid={`${testid}-why`} className={`text-sm break-keep ${ok ? 'text-emerald-700' : 'text-gray-700'}`}>{ok ? '✅ 맞아요. ' : '다시 보세요. '}{whyKo}</p>
    {!ok && <button data-testid={`${testid}-retry`} onClick={onRetry} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>다시 풀기</button>}
  </div>
)

function BlankItem({ q, idx, onSolved }) {
  const [picked, setPicked] = useState(null)
  const ok = picked !== null && picked === q.correct
  return (
    <div data-testid={`gu-blank-${idx}`} data-answered={picked === null ? 'false' : 'true'} className="space-y-2">
      <p className="text-base font-black text-gray-900 break-keep">{idx + 1}. {q.promptKo}</p>
      <p className="text-lg font-black text-gray-900 break-words">{q.en}</p>
      <div className="flex flex-wrap gap-2">
        {q.options.map((o, i) => (
          <button key={o} data-testid={`gu-blank-${idx}-opt-${i}`} disabled={picked !== null} onClick={() => { setPicked(i); onSolved(i === q.correct) }}
            className={`${BTN} text-base ${picked === i ? (ok ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-gray-800') : 'bg-white card-shadow text-gray-700'}`}>{o}</button>
        ))}
      </div>
      {picked !== null && <Result testid={`gu-blank-${idx}`} ok={ok} whyKo={q.whyKo || ''} onRetry={() => { setPicked(null); onSolved(false) }} />}
    </div>
  )
}

function OrderItem({ q, idx, onSolved }) {
  const [used, setUsed] = useState([]) // 고른 단어 칩 인덱스(순서대로)
  const [checked, setChecked] = useState(null) // null | boolean
  const joined = used.map((i) => q.words[i]).join(' ')
  const reset = () => { setUsed([]); setChecked(null); onSolved(false) }
  return (
    <div data-testid={`gu-order-${idx}`} data-answered={checked === null ? 'false' : 'true'} className="space-y-2">
      <p className="text-base font-black text-gray-900 break-keep">{idx + 1}. {q.promptKo}</p>
      <div className="flex flex-wrap gap-2">
        {q.words.map((w, i) => (
          <button key={i} data-testid={`gu-order-${idx}-word-${i}`} disabled={used.includes(i) || checked !== null} onClick={() => setUsed((u) => [...u, i])} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>{w}</button>
        ))}
      </div>
      <p data-testid={`gu-order-${idx}-answer`} className="min-h-[44px] px-3 py-2 rounded-2xl bg-sky-50 border-2 border-sky-100 text-lg font-black text-gray-900 break-words">{joined}</p>
      {checked === null ? (
        <div className="flex gap-2">
          <button data-testid={`gu-order-${idx}-check`} disabled={!used.length} onClick={() => { const ok = q.answers.some((a) => a.join(' ') === joined); setChecked(ok); onSolved(ok) }} className={`${BTN} text-base bg-sky-500 text-white`}>확인</button>
          <button data-testid={`gu-order-${idx}-clear`} disabled={!used.length} onClick={() => setUsed([])} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>지우기</button>
        </div>
      ) : <Result testid={`gu-order-${idx}`} ok={checked} whyKo={q.whyKo || ''} onRetry={reset} />}
    </div>
  )
}

// 직접 쓴 문장은 맞고 틀림을 판정하지 않는다 — 예시와 나란히 볼 뿐
function WriteCompare({ testid, q, noteKo }) {
  const [text, setText] = useState('')
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-2">
      <textarea data-testid={`${testid}-input`} value={text} onChange={(e) => setText(e.target.value)} rows={2} autoComplete="off" autoCapitalize="sentences" spellCheck={false} className={TA} placeholder="여기에 써 보세요" />
      <button data-testid={`${testid}-reveal`} disabled={!text.trim()} onClick={() => setShown(true)} className={`${BTN} text-base bg-sky-500 text-white`}>예시와 비교</button>
      {shown && (
        <div data-testid={`${testid}-compare`} className="space-y-1 rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
          <p className="text-sm font-bold text-gray-600 break-keep">내가 쓴 문장</p>
          <p className="text-base font-black text-gray-900 break-words">{text}</p>
          <p className="text-sm font-bold text-gray-600 break-keep">예시</p>
          <p className="text-base font-black text-gray-900 break-words">{q.exampleEn}</p>
          <p className="text-sm text-gray-700 break-keep">{q.exampleKo}</p>
          <p className="text-sm text-amber-800 font-bold break-keep">예시는 하나의 답일 뿐이에요{noteKo ? ` — ${noteKo}` : ''}</p>
        </div>
      )}
    </div>
  )
}

const ReviewBadge = ({ unit, testid }) => { const r = reviewStatusOf(unit); return (
  <span data-testid={testid} data-review={r} className={`ml-2 text-xs px-2 py-0.5 rounded-full ${r === 'reviewed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r === 'reviewed' ? '검수 완료' : '검수 전'}</span>) }

function GrammarUnitView({ unit, units, from, onBasics, onBack }) {
  const [solved, setSolved] = useState({})
  const [round, setRound] = useState(0) // 전체 다시 풀기 — 연습 항목을 새로 마운트
  const [spoken, setSpoken] = useState(false)
  const mark = (key) => (ok) => setSolved((s) => ({ ...s, [key]: !!ok }))
  const choice = resolveChoice(unit, units)
  const p = unit.practice || {}
  const blank = p.blank || [], order = p.order || [], build = p.build || []
  const total = choice.length + blank.length + order.length
  const n = Object.values(solved).filter(Boolean).length
  const basics = unit.basicsUnitId ? grammarUnitById(unit.basicsUnitId) : null
  const use = unit.use
  const back = () => { stopSpeaking(); onBack() }
  if (unit.status !== 'ready') {
    return (
      <div data-testid="grammar-unit" data-unit={unit.id} data-status="preparing" className="space-y-4">
        {from
          ? <button data-testid="gu-basics-back" onClick={back} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>← 돌아가기</button>
          : <button data-testid="gu-back" onClick={back} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>← 단원 목록</button>}
        <h2 className="text-lg font-black text-gray-900 break-keep">{unit.order}. {unit.titleKo}</h2>
        <div data-testid="gu-goal" className={CARD}><p className={H}>학습 목표</p><p className="text-base font-black text-gray-900 break-keep">{unit.goalKo}</p></div>
        <p data-testid="gu-preparing" className={`${CARD} text-base font-black text-gray-500 break-keep`}>이 단원은 준비 중이에요</p>
      </div>
    )
  }
  return (
    <div data-testid="grammar-unit" data-unit={unit.id} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {from
          ? <button data-testid="gu-basics-back" onClick={back} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>← 돌아가기</button>
          : <button data-testid="gu-back" onClick={back} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>← 단원 목록</button>}
        {basics && (
          <button data-testid="gu-basics-link" onClick={() => { stopSpeaking(); onBasics(basics.id) }} className={`${BTN} text-base bg-indigo-100 text-indigo-800`}>
            기초 설명 보기 → {basics.titleKo}{basics.status !== 'ready' ? ' (준비 중)' : ''}
          </button>)}
      </div>
      <h2 className="text-lg font-black text-gray-900 break-keep">{unit.order}. {unit.titleKo}<ReviewBadge unit={unit} testid="gu-review-status" /></h2>

      <div data-testid="gu-goal" className={CARD}><p className={H}>1. 학습 목표</p><p className="text-base font-black text-gray-900 break-keep">{unit.goalKo}</p></div>

      <div data-testid="gu-examples" className={CARD}>
        <p className={H}>2. 상황·예문</p>
        {(unit.examples || []).map((e, i) => (
          <div key={i} data-testid={`gu-example-${i}`} className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><p className="text-lg font-black text-gray-900 break-words">{e.en}</p><p className="text-sm text-gray-600 break-keep">{e.ko}</p></div>
            <Listen testid={`gu-example-${i}-listen`} en={e.en} />
          </div>))}
      </div>

      <div data-testid="gu-explain" className={CARD}>
        <p className={H}>3. 쉬운 설명</p>
        {(unit.explainKo || []).map((t, i) => <p key={i} className="text-base text-gray-800 break-keep">{t}</p>)}
      </div>

      <div data-testid="gu-structure" className={CARD}>
        <p className={H}>4. 문장 구조</p>
        {(unit.structure || []).map((r, i) => (
          <div key={i} data-testid={`gu-structure-${i}`} className="space-y-1">
            <div className="flex flex-wrap items-start gap-2">
              <span className="px-2 py-1 rounded-xl bg-sky-100 text-sky-800 font-black break-words"><b className="text-xs mr-1">S</b>{r.s}</span>
              <span className="px-2 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-black break-words"><b className="text-xs mr-1">V</b>{r.v}</span>
              {r.rest && <span className="px-2 py-1 rounded-xl bg-amber-100 text-amber-800 font-black break-words"><b className="text-xs mr-1">+</b>{r.rest}</span>}
            </div>
            {r.ko && <p className="text-sm text-gray-600 break-keep">{r.ko}</p>}
          </div>))}
        <p className="text-xs text-gray-500 break-keep">S = 주어 · V = 동사 · + = 나머지</p>
      </div>

      {unit.compare && (
        <div data-testid="gu-compare" className={CARD}>
          <p className={H}>5. 긍정·부정·의문 비교</p>
          {[['aff', '긍정'], ['neg', '부정'], ['q', '의문']].map(([k, label]) => unit.compare[k] && (
            <div key={k} data-testid={`gu-compare-${k}`} className="flex items-start gap-2">
              <span className="shrink-0 w-12 text-sm font-black text-indigo-700">{label}</span>
              <div className="min-w-0"><p className="text-base font-black text-gray-900 break-words">{unit.compare[k].en}</p><p className="text-sm text-gray-600 break-keep">{unit.compare[k].ko}</p></div>
            </div>))}
        </div>)}

      <div data-testid="gu-errors" className={CARD}>
        <p className={H}>6. 흔한 오류</p>
        {(unit.errors || []).map((e, i) => (
          <div key={i} data-testid={`gu-error-${i}`} className="space-y-0.5">
            <p className="text-base font-black text-gray-400 line-through break-words">{e.wrong}</p>
            <p className="text-base font-black text-emerald-700 break-words">{e.right}</p>
            <p className="text-sm text-gray-700 break-keep">{e.whyKo}</p>
          </div>))}
      </div>

      <div data-testid="gu-practice" key={round} className={CARD}>
        <p className={H}>7. 단계별 연습</p>
        <p data-testid="gu-practice-status" className="text-sm font-black text-gray-700">풀이 {n}/{total}</p>
        {total > 0 && n >= total && <p data-testid="gu-practice-done" className="text-base font-black text-emerald-700 break-keep">연습 다 했어요</p>}
        {choice.length > 0 && (
          <div data-testid="gu-step-choice" className="space-y-3"><p className="text-sm font-black text-gray-500">① 선택</p>
            {choice.map((q, i) => <Choice key={i} q={q} idx={i} testid="gu-choice" onPick={mark(`c${i}`)} />)}</div>)}
        {blank.length > 0 && (
          <div data-testid="gu-step-blank" className="space-y-3"><p className="text-sm font-black text-gray-500">② 빈칸</p>
            {blank.map((q, i) => <BlankItem key={i} q={q} idx={i} onSolved={mark(`b${i}`)} />)}</div>)}
        {order.length > 0 && (
          <div data-testid="gu-step-order" className="space-y-3"><p className="text-sm font-black text-gray-500">③ 순서 배열</p>
            {order.map((q, i) => <OrderItem key={i} q={q} idx={i} onSolved={mark(`o${i}`)} />)}</div>)}
        {build.length > 0 && (
          <div data-testid="gu-step-build" className="space-y-3"><p className="text-sm font-black text-gray-500">④ 문장 만들기</p>
            {build.map((q, i) => (
              <div key={i} data-testid={`gu-build-${i}`} className="space-y-2">
                <p className="text-base font-black text-gray-900 break-keep">{i + 1}. {q.promptKo}</p>
                <WriteCompare testid={`gu-build-${i}`} q={q} noteKo={q.acceptNoteKo} />
              </div>))}</div>)}
      </div>

      <div data-testid="gu-use" className={CARD}>
        <p className={H}>8. 직접 사용 {use?.kind === 'speaking' ? '(말하기)' : '(쓰기)'}</p>
        {use && <p className="text-base font-black text-gray-900 break-keep">{use.promptKo}</p>}
        {use?.kind === 'speaking' && (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><p className="text-lg font-black text-gray-900 break-words">{use.exampleEn}</p><p className="text-sm text-gray-600 break-keep">{use.exampleKo}</p></div>
              <Listen testid="gu-use-listen" en={use.exampleEn} />
            </div>
            <button data-testid="gu-use-done" onClick={() => setSpoken(true)} className={`${BTN} text-base bg-sky-500 text-white`}>말해 봤어요</button>
            {spoken && <p data-testid="gu-use-done-note" className="text-sm font-bold text-emerald-700 break-keep">✅ 잘했어요. 내 말이 예시와 달라도 괜찮아요.</p>}
          </>)}
        {use?.kind === 'writing' && <WriteCompare testid="gu-use" q={use} />}
      </div>

      <div data-testid="gu-feedback" className={CARD}>
        <p className={H}>9. 오답 피드백 · 다시 풀기</p>
        <p className="text-sm text-gray-700 break-keep">틀린 문제는 이유를 읽고 그 문제의 '다시 풀기'를 눌러요. 처음부터 다시 하고 싶으면 아래 버튼을 눌러요.</p>
        <button data-testid="gu-reset-all" onClick={() => { setSolved({}); setRound((r) => r + 1) }} className={`${BTN} text-base bg-white card-shadow text-gray-700`}>연습 전체 다시 풀기</button>
      </div>
    </div>
  )
}

export default function GrammarCourseScreen({ units, onBack }) {
  const [courseId, setCourseId] = useState(null)
  const [unitId, setUnitId] = useState(null)
  const [fromId, setFromId] = useState(null) // 기초 설명으로 건너온 경우 돌아갈 단원
  useEffect(() => () => stopSpeaking(), [])
  const course = GRAMMAR_COURSES.find((c) => c.id === courseId) || null
  const unit = grammarUnitById(unitId)
  const list = courseId ? unitsForCourse(courseId) : []
  return (
    <div data-testid="grammar-courses" data-view={unit ? 'unit' : course ? 'units' : 'courses'} className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto space-y-4 overflow-x-hidden">
        <div className="flex items-center gap-2 pt-2">
          <button data-testid="grammar-courses-home" onClick={() => { stopSpeaking(); onBack() }} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 홈</button>
          <h1 className="text-xl font-black text-indigo-700">문법 과정</h1>
        </div>
        {unit && (
          <GrammarUnitView key={unit.id} unit={unit} units={units} from={fromId}
            onBasics={(id) => { setFromId(unit.id); setUnitId(id) }}
            onBack={() => { if (fromId) { setUnitId(fromId); setFromId(null) } else setUnitId(null) }} />)}
        {!unit && !course && (
          <>
            <p className="text-base font-black text-gray-800">어떤 과정을 할까요?</p>
            {GRAMMAR_COURSES.map((c) => { const { ready, reviewed, total } = courseCounts(c.id); return (
              <button key={c.id} data-testid={`grammar-course-${c.id}`} onClick={() => setCourseId(c.id)} className={`${ITEM} text-white bg-gradient-to-br from-indigo-500 to-violet-700`}>
                <span className="block text-xl font-black">{c.titleEn}</span>
                <span className="block text-xs font-bold opacity-90 break-keep">{c.titleKo} · {c.descKo}</span>
                <span className="block text-xs font-bold opacity-90"><span className="mr-1 px-2 py-0.5 rounded-full bg-white/30">{c.kind === 'school' ? '학교 문법 (제안)' : '숙련도'}</span>ready {ready}/{total} · 검수 {reviewed}</span>
              </button>) })}
          </>)}
        {!unit && course && (
          <div data-testid="grammar-units" data-course={course.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-600">
              <button data-testid="grammar-units-back" onClick={() => setCourseId(null)} className="min-h-[44px] px-2 font-black text-gray-600 btn-press">← 과정</button>
              <span data-testid="grammar-units-crumb">{course.titleEn} · {course.titleKo}</span>
            </div>
            <p className="text-sm text-gray-600 break-keep">{course.descKo}</p>
            {course.kind === 'school' && <p data-testid="grammar-school-note" className="text-xs font-bold text-amber-800 bg-amber-50 rounded-2xl px-3 py-2 break-keep">{SCHOOL_GRAMMAR_NOTE_KO}</p>}
            {list.map((u) => { const ready = u.status === 'ready'; return (
              <button key={u.id} data-testid={`grammar-unit-${u.id}`} disabled={!ready} aria-disabled={!ready} onClick={() => { setFromId(null); setUnitId(u.id) }}
                className={`${ITEM} ${ready ? 'text-white bg-gradient-to-br from-teal-400 to-emerald-600' : 'bg-white text-gray-400'}`}>
                <span className="block text-lg font-black break-keep">{u.order}. {u.titleKo}{!ready && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">준비 중</span>}{ready && <ReviewBadge unit={u} testid={`grammar-unit-${u.id}-review`} />}</span>
                <span className="block text-xs font-bold opacity-90 break-keep">{u.goalKo}</span>
              </button>) })}
          </div>)}
      </div>
    </div>
  )
}
