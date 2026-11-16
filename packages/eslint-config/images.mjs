import css from '@eslint/css'
import localRules from '@lodado/eslint-plugin-local-rules'
import { CODE_FILES } from './code-files.js'

/**
 * Opt-in image policy: application images use the shared AppImage boundary (one or more gateway modules).
 * `css: true` also parses stylesheets for image URLs. It is off by default: the base preset applies its JavaScript
 * rules to every file it lints, and they crash on a stylesheet, so turn it on only in a config whose JavaScript
 * rules are limited to code files.
 */
export default function images({ appImageModules = ['@/shared/ui/AppImage'], css: checkCss = false } = {}) {
  const code = {
    name: 'lodado/images',
    files: CODE_FILES,
    plugins: { '@lodado/local-rules': localRules },
    rules: { '@lodado/local-rules/no-image-bypass': ['error', { appImageModules }] },
  }
  if (!checkCss) return [code]
  return [
    code,
    {
      name: 'lodado/images/css',
      files: ['**/*.css'],
      language: 'css/css',
      plugins: { css, '@lodado/local-rules': localRules },
      rules: { '@lodado/local-rules/no-css-image-url': 'error' },
    },
  ]
}
