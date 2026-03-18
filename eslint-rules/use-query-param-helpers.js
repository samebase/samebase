'use strict'

const MUTATING_QUERY_METHODS = new Set(['append', 'delete', 'set'])

function isIdentifier(node, name) {
  return node && node.type === 'Identifier' && node.name === name
}

function isMutatingQueryMethodCall(node) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property &&
    node.callee.property.type === 'Identifier' &&
    MUTATING_QUERY_METHODS.has(node.callee.property.name)
  )
}

function isLikelyQueryParamsTarget(node) {
  if (!node) {
    return false
  }

  if (node.type === 'Identifier') {
    return (
      node.name === 'params' ||
      node.name === 'searchParams' ||
      node.name.endsWith('SearchParams')
    )
  }

  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property &&
    node.property.type === 'Identifier' &&
    node.property.name === 'searchParams'
  )
}

function isRawRootQueryString(value) {
  return value.startsWith('/?') || (value.startsWith('?') && value.length > 1)
}

function templateContainsRawRootQuery(node) {
  return node.quasis.some(quasi => {
    const value = quasi.value.cooked ?? quasi.value.raw ?? ''
    return value.includes('/?') || (value.startsWith('?') && value.length > 1)
  })
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      useHelpers:
        'Use apps/noter/src/lib/queryParams.ts helpers instead of mutating URL query params directly.',
      rawRootQuery:
        'Use apps/noter/src/lib/queryParams.ts helpers instead of hardcoding root query URLs like /?... .',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isMutatingQueryMethodCall(node)) {
          return
        }

        if (isLikelyQueryParamsTarget(node.callee.object)) {
          context.report({
            node,
            messageId: 'useHelpers',
          })
        }
      },
      Literal(node) {
        if (typeof node.value !== 'string') {
          return
        }

        if (!isRawRootQueryString(node.value)) {
          return
        }

        context.report({
          node,
          messageId: 'rawRootQuery',
        })
      },
      TemplateLiteral(node) {
        if (!templateContainsRawRootQuery(node)) {
          return
        }

        if (
          node.parent &&
          node.parent.type === 'TaggedTemplateExpression' &&
          isIdentifier(node.parent.tag, 'css')
        ) {
          return
        }

        context.report({
          node,
          messageId: 'rawRootQuery',
        })
      },
    }
  },
}
