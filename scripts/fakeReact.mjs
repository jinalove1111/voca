// Minimal hooks runtime — just enough to execute useStudent.js's actual
// hook body (useState/useEffect/useRef/useCallback) outside a real DOM,
// with a manually-steppable fake clock so async/timing races can be
// deterministically reproduced. Not a general React replacement — built
// only to verify the 2026-07-10 restore-vs-sync race fix against the real
// bundled hook code (not a hand-copied mirror of the logic).
function depsEqual(a, b) {
  if (a === undefined || b === undefined) return false // undefined deps = always re-run
  if (a.length !== b.length) return false
  return a.every((v, i) => Object.is(v, b[i]))
}

export function createFakeClock() {
  let now = 0
  let idSeq = 1
  const timers = new Map() // id -> { at, fn }
  return {
    setTimeout(fn, ms) {
      const id = idSeq++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
    advance(ms) {
      now += ms
      const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)
      for (const [id, t] of due) { timers.delete(id); t.fn() }
    },
    pendingCount() { return timers.size },
  }
}

export function renderHook(hookFn, clock) {
  let hooks = []
  let hookIndex = 0
  let committedEffects = [] // effects from the last commit, for cleanup/dep-diff

  const api = {
    useState(initial) {
      const idx = hookIndex++
      if (!(idx in hooks)) hooks[idx] = { value: typeof initial === 'function' ? initial() : initial }
      const cell = hooks[idx]
      const setState = (updater) => {
        const next = typeof updater === 'function' ? updater(cell.value) : updater
        if (!Object.is(next, cell.value)) { cell.value = next; host.rerender() }
      }
      return [cell.value, setState]
    },
    useRef(initial) {
      const idx = hookIndex++
      if (!(idx in hooks)) hooks[idx] = { current: initial }
      return hooks[idx]
    },
    useCallback(fn, deps) {
      const idx = hookIndex++
      const prev = hooks[idx]
      if (!prev || !depsEqual(prev.deps, deps)) hooks[idx] = { fn, deps }
      return hooks[idx].fn
    },
    useEffect(effectFn, deps) {
      const idx = hookIndex++
      hooks[idx] = hooks[idx] || {}
      hooks[idx].pending = { effectFn, deps }
    },
  }
  let host
  const run = () => {
    hookIndex = 0
    const prevGlobalSetTimeout = globalThis.setTimeout
    const prevGlobalClearTimeout = globalThis.clearTimeout
    globalThis.setTimeout = clock.setTimeout
    globalThis.clearTimeout = clock.clearTimeout
    try {
      global.__FAKE_HOOKS__ = api
      const result = hookFn()
      // Commit phase must run BEFORE the fake clock is unpatched — effect
      // bodies (useStudent.js's setTimeout/clearTimeout calls) execute here,
      // synchronously, as part of this same render pass.
      for (let i = 0; i < hooks.length; i++) {
        const slot = hooks[i]
        if (!slot || !slot.pending) continue
        const { effectFn, deps } = slot.pending
        slot.pending = null
        const shouldRun = !slot.committedDeps || !depsEqual(slot.committedDeps, deps)
        if (shouldRun) {
          if (typeof slot.cleanup === 'function') slot.cleanup()
          slot.cleanup = effectFn() || undefined
          slot.committedDeps = deps
        }
      }
      return result
    } finally {
      globalThis.setTimeout = prevGlobalSetTimeout
      globalThis.clearTimeout = prevGlobalClearTimeout
    }
  }
  host = {
    result: null,
    rerender() { host.result = run() },
  }
  host.result = run()
  return host
}
