/** Path predicates shared by the rules that only apply to test code. */
const SOURCE_EXTENSION = '[cm]?[jt]sx?'
const UNIT_TEST_FILE = new RegExp(`\\.(test|spec)\\.${SOURCE_EXTENSION}$`)
const TEST_DIRECTORY = /(^|\/)(e2e|playwright|__tests__)\//
const E2E_FILE = new RegExp(`(^|\\/)(e2e|playwright)\\/|\\.e2e\\.${SOURCE_EXTENSION}$`)

const normalize = (filename) => filename.replace(/\\/g, '/')

const isTestFile = (filename) => {
  const normalized = normalize(filename)
  return UNIT_TEST_FILE.test(normalized) || TEST_DIRECTORY.test(normalized)
}

const isE2EFile = (filename) => E2E_FILE.test(normalize(filename))

module.exports = { isTestFile, isE2EFile, normalize }
