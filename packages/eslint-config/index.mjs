import antfu from '@antfu/eslint-config'
import prettier from 'eslint-config-prettier'

/** Base preset: Antfu's modern JS/TS defaults without formatter ownership. */
// eslint-disable-next-line antfu/no-top-level-await -- consumers spread a resolved config array
export default await antfu(
  {
    type: 'lib',
    formatters: false,
    lessOpinionated: true,
    stylistic: false,
    typescript: true,
  },
  prettier,
).renamePlugins({ import: 'import-lite' })
