const RASTER = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/iu
const IMAGE_URL = /url\s*\(|image-set\s*\(/iu
const moduleName = (value) =>
  value
    .split('/')
    .pop()
    .replace(/\.(?:[cm]?[jt]sx?)$/iu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')

const nameOf = (node) => (node.type === 'JSXIdentifier' ? node.name : null)
const literalText = (node) =>
  node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : node?.type === 'TemplateLiteral'
    ? node.quasis.map((part) => part.value.raw).join('')
    : null

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'keep application images behind the shared image component' },
    schema: [
      {
        type: 'object',
        properties: { appImageModules: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      element: 'Use the shared AppImage component instead of a raw <img>.',
      nextImage: 'Import the shared AppImage component instead of next/image.',
      rasterImport: 'Import raster assets through the shared AppImage pipeline.',
      require: 'Load raster assets through the shared AppImage pipeline.',
      inlineUrl: 'Keep image URLs out of inline styles; use the shared AppImage component.',
      tailwindUrl: 'Keep image URLs out of Tailwind classes; use the shared AppImage component.',
    },
  },
  create(context) {
    const appImageNames = new Set((context.options[0]?.appImageModules ?? ['@/shared/ui/AppImage']).map(moduleName))
    const filename = (context.filename ?? '').toLowerCase().replace(/[^a-z0-9]/gu, '')
    const isAppImageModule = [...appImageNames].some((name) =>
      ['js', 'jsx', 'ts', 'tsx'].some((extension) => filename.endsWith(name + extension)),
    )
    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (source === 'next/image' && !isAppImageModule) context.report({ node: node.source, messageId: 'nextImage' })
        else if (RASTER.test(source)) context.report({ node: node.source, messageId: 'rasterImport' })
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          RASTER.test(literalText(node.arguments[0]) ?? '')
        )
          context.report({ node, messageId: 'require' })
      },
      JSXOpeningElement(node) {
        if (nameOf(node.name)?.toLowerCase() === 'img') context.report({ node: node.name, messageId: 'element' })
        for (const attribute of node.attributes) {
          const name = nameOf(attribute.name)
          const value = literalText(attribute.value)
          if (name === 'className' && value && IMAGE_URL.test(value))
            context.report({ node: attribute, messageId: 'tailwindUrl' })
          if (name === 'style' && IMAGE_URL.test(context.sourceCode.getText(attribute.value)))
            context.report({ node: attribute, messageId: 'inlineUrl' })
        }
      },
      Property(node) {
        const key = node.key.type === 'Identifier' ? node.key.name : node.key.value
        if (['background', 'backgroundImage', 'content'].includes(key) && IMAGE_URL.test(literalText(node.value) ?? ''))
          context.report({ node: node.value, messageId: 'inlineUrl' })
      },
    }
  },
}
