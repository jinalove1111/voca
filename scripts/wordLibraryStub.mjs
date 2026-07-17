// Test-only stub replacing src/utils/wordLibrary.js's Supabase-backed
// exports, so the progress-store test can bundle useStudent.js in plain
// Node without needing import.meta.env / a live Supabase connection.
// useStudent.js only re-exports/calls these — none of them are exercised
// by testProgress.mjs, which tests the pure history/round logic only.
export const getStudents = () => []
export const addStudent = () => {}
export const removeStudent = () => {}
export const findStudentByName = () => []
export const syncStudentProgress = async () => {}
export const fetchFullProgress = async () => null
export const fetchProgressBackupStrict = async () => null
export const setWordStatus = async () => {}
