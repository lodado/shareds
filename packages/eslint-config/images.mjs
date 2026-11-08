import css from '@eslint/css'
import localRules from '@lodado/eslint-plugin-local-rules'
import { CODE_FILES } from './code-files.js'

/** Opt-in image policy: application images use the shared AppImage boundary. */
export default function images({ appImageModules = ['@/shared/ui/AppImage'] } = {}) {
  return [
    {
      name: 'lodado/images',
      files: CODE_FILES,
      plugins: { '@lodado/local-rules': localRules },
      rules: { '@lodado/local-rules/no-image-bypass': ['error', { appImageModules }] },
    },
    {
      name: 'lodado/images/css',
      files: ['**/*.css'],
      language: 'css/css',
      plugins: { css, '@lodado/local-rules': localRules },
      rules: { '@lodado/local-rules/no-css-image-url': 'error' },
    },
  ]
}
