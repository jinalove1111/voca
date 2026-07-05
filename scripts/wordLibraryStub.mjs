// Test-only stub replacing src/utils/wordLibrary.js's Supabase-backed
// exports, so the progress-store test can bundle useStudent.js in plain
// Node without needing import.meta.env / a live Supabase connection.
// useStudent.js only re-exports these three — it never calls them itself.
export const getStudents = () => []
export const addStudent = () => {}
export const removeStudent = () => {}
export const findStudentByName = () => null
