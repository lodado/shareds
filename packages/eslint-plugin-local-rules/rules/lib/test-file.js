/** Path predicates shared by the rules that only apply to test code. */
const UNIT_TEST_FILE = /\.(test|spec)\.[jt]sx?$/
const TEST_DIRECTORY = /(^|\/)(e2e|playwright|__tests__)\//
const E2E_FILE = /(^|\/)(e2e|playwright)\/|\.e2e\.[jt]s$/

const normalize = (filename) => filename.replace(/\\/g, '/')

const isTestFile = (filename) => {
  const normalized = normalize(filename)
  return UNIT_TEST_FILE.test(normalized) || TEST_DIRECTORY.test(normalized)
}

const isE2EFile = (filename) => E2E_FILE.test(normalize(filename))

module.exports = { isTestFile, isE2EFile, normalize }
