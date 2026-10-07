/**
 * A dialog opened inside another dialog stacks two focus traps and two Escape handlers; unless the
 * library coordinates them, focus return, tab order and layering break. Close the first before
 * opening the second, or show the second step inline.
 *
 * A dialog is `<dialog>`, a native element with a literal `role="dialog"`/`"alertdialog"`, a
 * component in `dialogs` (dotted names allowed), or that component's `.Root`. A library part such as
 * `.Content`, `DialogContent` or `Dialog.Panel` belongs to its dialog, so a role on it adds nothing.
 * A `Modal` or `Drawer` hosts its surface as a direct child under another name - React Aria's
 * `<Modal><Dialog>`, Joy's `<Modal><Sheet>` - and that child is the same dialog. `dialogs` replaces
 * the default list. Only nesting in one file's JSX is visible here.
 */
const { attributeName, elementName, namesOption } = require('./lib/jsx')

const DEFAULT_DIALOGS = ['Dialog', 'AlertDialog', 'Modal', 'Drawer', 'Sheet']
const DIALOG_ROLES = new Set(['dialog', 'alertdialog'])
const SURFACE_HOSTS = new Set(['Modal', 'Drawer'])
const ROOT = '.Root'

const literalRole = (opening) => {
  const role = opening.attributes.find((attribute) => attributeName(attribute) === 'role')

  return role?.value?.type === 'Literal' ? role.value.value : null
}

const isNative = (name) => name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)

/** The name to report when this element opens a dialog, otherwise null. */
const dialogName = (opening, dialogs) => {
  const name = elementName(opening.name)

  if (name === 'dialog' || dialogs.has(name)) {
    return name
  }

  if (name?.endsWith(ROOT) && dialogs.has(name.slice(0, -ROOT.length))) {
    return name
  }

  const role = isNative(opening.name) ? literalRole(opening) : null

  return DIALOG_ROLES.has(role) ? `role="${role}"` : null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow opening a dialog inside another dialog',
      category: 'Interaction',
      recommended: false,
    },
    schema: namesOption('dialogs'),
    messages: {
      nestedDialog:
        '`{{ inner }}` opens inside `{{ outer }}`. Stacked dialogs make focus, Escape and layering hard to get right; close `{{ outer }}` first, or show this step inline inside it.',
    },
  },
  create(context) {
    const dialogs = new Set(context.options[0]?.dialogs ?? DEFAULT_DIALOGS)

    return {
      JSXElement(node) {
        const inner = dialogName(node.openingElement, dialogs)

        if (!inner) {
          return
        }

        let crossedElement = false

        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
          if (ancestor.type !== 'JSXElement') {
            continue
          }

          const outer = dialogName(ancestor.openingElement, dialogs)

          if (outer && !crossedElement && SURFACE_HOSTS.has(outer) && outer !== inner) {
            return
          }

          if (outer) {
            context.report({ node: node.openingElement, messageId: 'nestedDialog', data: { inner, outer } })
            return
          }

          crossedElement = true
        }
      },
    }
  },
}
