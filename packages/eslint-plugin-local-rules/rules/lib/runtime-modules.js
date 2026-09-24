/**
 * State owners and transport clients, shared by no-fetch-in-component, strict-ui-boundary and the
 * hook-tiers preset so one list decides where a request or a store may live.
 */
const OWNERS = [
  '@tanstack/react-query',
  'swr',
  'zustand',
  'jotai',
  'valtio',
  'react-redux',
  '@reduxjs/toolkit',
  'react-hook-form',
  '@tanstack/react-form',
]

// The owner APIs that create or read state; a `Provider` or a type import is not ownership.
const OWNER_API = '^(?:default$|use[A-Z]|create$|createStore$|atom$|proxy$|configureStore$|createSlice$)'

// Browser-capable HTTP clients seen in agent output; `fetch` itself is a global.
const TRANSPORT = ['axios', 'ky', 'ofetch', 'wretch', 'redaxios', 'node-fetch']

const fromModule = (source, modules) => modules.some((name) => source === name || source.startsWith(`${name}/`))

const GLOBAL_OBJECTS = new Set(['window', 'globalThis'])
const MAX_ALIAS_DEPTH = 4

const propertyName = (node) => (!node.computed && node.property.type === 'Identifier' ? node.property.name : null)

const findVariable = (sourceCode, identifier) => {
  for (let scope = sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name)
    if (variable) {
      return variable
    }
  }
  return null
}

/** The name a function is declared or assigned under: `function Panel`, `const Panel = () =>`. */
const functionName = (fn) => {
  if (fn.id) {
    return fn.id.name
  }
  return fn.parent.type === 'VariableDeclarator' && fn.parent.id.type === 'Identifier' ? fn.parent.id.name : null
}

/** Whether `node` evaluates to fetch, an HTTP client or an instance of one. */
const isTransport = (sourceCode, node, depth = 0) => {
  if (!node || depth > MAX_ALIAS_DEPTH) {
    return false
  }
  if (node.type === 'Identifier') {
    const definition = findVariable(sourceCode, node)?.defs[0]
    if (!definition) {
      return node.name === 'fetch' || TRANSPORT.includes(node.name)
    }
    if (definition.type === 'ImportBinding') {
      return fromModule(definition.parent.source.value, TRANSPORT)
    }
    return (
      definition.type === 'Variable' &&
      definition.node.id.type === 'Identifier' &&
      isTransport(sourceCode, definition.node.init, depth + 1)
    )
  }
  if (node.type === 'MemberExpression') {
    const isGlobal =
      node.object.type === 'Identifier' &&
      GLOBAL_OBJECTS.has(node.object.name) &&
      !findVariable(sourceCode, node.object)?.defs[0]
    return isGlobal ? propertyName(node) === 'fetch' : isTransport(sourceCode, node.object, depth + 1)
  }
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    return (
      ['create', 'extend'].includes(propertyName(node.callee)) && isTransport(sourceCode, node.callee.object, depth + 1)
    )
  }
  return false
}

module.exports = { OWNERS, OWNER_API, TRANSPORT, fromModule, findVariable, functionName, isTransport }
