// Drop-in replacement for the 4 hooks useStudent.js imports from 'react'.
// Delegates to whatever fakeReact.mjs's renderHook() installed on
// globalThis.__FAKE_HOOKS__ for the current render pass.
export const useState = (...a) => globalThis.__FAKE_HOOKS__.useState(...a)
export const useEffect = (...a) => globalThis.__FAKE_HOOKS__.useEffect(...a)
export const useRef = (...a) => globalThis.__FAKE_HOOKS__.useRef(...a)
export const useCallback = (...a) => globalThis.__FAKE_HOOKS__.useCallback(...a)
