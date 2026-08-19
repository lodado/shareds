/* eslint-disable global-require */
module.exports = {
  'fsd-no-banned-segments': require('./fsd-no-banned-segments'),
  'fsd-no-deep-import': require('./fsd-no-deep-import'),
  'fsd-no-driver-outside-repository': require('./fsd-no-driver-outside-repository'),
  'no-arbitrary-sleep-in-tests': require('./no-arbitrary-sleep-in-tests'),
  'no-console-log': require('./no-console-log'),
  'no-css-locator-without-reason': require('./no-css-locator-without-reason'),
  'no-derived-state-effect': require('./no-derived-state-effect'),
  'no-fetch-in-component': require('./no-fetch-in-component'),
  'no-refetch-in-effect': require('./no-refetch-in-effect'),
  'no-use-client-above-leaf': require('./no-use-client-above-leaf'),
  'require-abort-signal-passthrough': require('./require-abort-signal-passthrough'),
  'require-effect-annotation': require('./require-effect-annotation'),
  'require-exact-call-count': require('./require-exact-call-count'),
  'require-skip-reason': require('./require-skip-reason'),
  'scenario-test-filename': require('./scenario-test-filename'),
}
