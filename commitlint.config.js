module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0], // Remove uppercase/lowercase restrictions
    'body-max-line-length': [0], // Remove body line length limit
  },
}
