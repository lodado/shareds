/** Accessibility preset: jsx-a11y strict, minus rules that duplicate TypeScript guarantees. */
module.exports = {
  extends: ['plugin:jsx-a11y/strict'],
  plugins: ['jsx-a11y'],
  rules: {
    'jsx-a11y/control-has-associated-label': 'off', // buttons label via children
    'jsx-a11y/button-has-type': 'off', // type is prop-driven and type-checked
  },
}
