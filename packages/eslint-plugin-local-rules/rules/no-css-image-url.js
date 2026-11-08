module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'keep CSS image URLs behind the shared image pipeline' },
    schema: [],
    messages: { imageUrl: 'Keep CSS image URLs out of application styles; use the shared AppImage component.' },
  },
  create(context) {
    let fontFaceDepth = 0
    return {
      Atrule(node) {
        if (node.name.toLowerCase() === 'font-face') fontFaceDepth += 1
      },
      'Atrule:exit'(node) {
        if (node.name.toLowerCase() === 'font-face') fontFaceDepth -= 1
      },
      Url(node) {
        if (fontFaceDepth === 0) context.report({ node, messageId: 'imageUrl' })
      },
    }
  },
}
