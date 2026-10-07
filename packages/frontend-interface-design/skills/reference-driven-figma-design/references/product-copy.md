# Product copy — rules with stable IDs

Load when writing, editing, or reviewing action labels, destructive confirmations, errors, loading
states, product names, or accessible names, including a copy-only pass. The same file ships in more
than one skill; keep the copies identical.

Owner: the target product's content guide and glossary win; cite them. These rules are the default
only where the product is silent. Findings cite the rule ID, such as `copy/destructive-verb-noun`.
Rewording is not a material decision; changing what an action does, its default, or its
consequence is, and it goes back to the user.

"Vercel product-design" below means https://vercel.com/blog/teaching-agents-product-design-at-vercel (2026-06).

## copy/action-names-outcome

- Scope: primary and secondary buttons, menu items, dialog actions.
- Rule: name the result the user gets, with verb + object when the object is not obvious.
  Do not use `확인`, `OK`, `제출` or `Submit` when the action does more than acknowledge.
- Why: users decide from the label; a generic label hides scope and consequence.
- Exceptions: a pure acknowledgement with no side effect (`확인` on a read-only notice); `다음`
  between steps of one flow when the step itself changes nothing.
- Source: Vercel product-design, "Name the exact object, scope, and consequence of important actions."
- Bad: `[확인]` under "팀원을 초대할까요?"
- Good: `[초대 보내기]`

## copy/destructive-verb-noun

- Scope: actions that delete, remove, revoke, reset, cancel a subscription, or otherwise lose data or access.
- Rule: the action label is verb + object (`프로젝트 삭제`, `Delete project`). The title names the
  object; the body says what else is lost and whether it can be undone, taken from product facts.
  An unknown count or recovery policy stays a visible placeholder, never a guess. Never `확인`,
  `OK`, `예`, or a bare verb (`삭제`).
- Why: a confirmation protects only when the user reads what is lost; generic confirms train click-through.
- Exceptions: none for the label. An undo toast offered instead of a confirmation still names the object.
- Source: Vercel product-design, `rule/destructive-names-action`: "Destructive CTAs follow Verb + Noun.
  Never use Confirm, OK, or a bare verb."
- Bad: "정말 삭제하시겠습니까?" `[취소] [확인]`
- Good: "'결제 대시보드' 프로젝트를 삭제할까요?" / "배포 {n}개와 도메인 {m}개가 함께 삭제돼요. {복구 정책}" `[취소] [프로젝트 삭제]`, with the counts and the recovery sentence filled from product data

## copy/error-cause-recovery

- Scope: inline validation, failed-action banners and toasts, error pages.
- Rule: say what happened in the user's terms and what to do next (fix the field, retry, contact
  support), and keep what the user entered. A code or "알 수 없는 오류" alone is not a message.
- Why: an error the user cannot act on ends the task.
- Exceptions: security-sensitive failures (sign-in, fraud checks) may withhold the cause; they still give the next step.
- Source: NN/g, Error-Message Guidelines (https://www.nngroup.com/articles/error-message-guidelines/);
  Vercel product-design, "Preserve user input through validation and recoverable errors."
- Bad: "오류가 발생했습니다. (500)"
- Good: "결제 수단을 저장하지 못했어요. 입력한 내용은 그대로 있어요." `[다시 시도]`

## copy/stable-loading-label

- Scope: buttons and controls while their action is pending.
- Rule: keep the label and show the pending state with the component's busy affordance (spinner,
  busy or disabled state). If the label must change (`저장 중...`), keep the control's width fixed
  and expose the busy state (`aria-busy`).
- Why: a changing label shifts the control's width and target, and screen readers announce it again.
- Exceptions: the design system has no busy affordance; then keep the width fixed and show progress beside the control.
- Source: Vercel product-design, "Keep loading control labels stable; use the component's loading/busy affordance."
- Bad: `[저장]` → `[저장 중...]`
- Good: `[저장]` → `[⟳ 저장]`, same width because the spinner's space is reserved, busy

## copy/canonical-names

- Scope: product objects, plans, roles, and feature names.
- Rule: use the product glossary's term exactly, and the same word for the same object on every
  screen. With no glossary, use the term the PRD or the shipped UI already uses and record it; never coin a new one.
- Why: two names read as two things.
- Exceptions: a rename the user approved; record the old term as an alias.
- Source: Vercel product-design, `glossary.md` (canonical product names).
- Bad: "워크스페이스" in the list, "프로젝트" in the settings title, "스페이스" in the delete dialog, all for one object.
- Good: "프로젝트" everywhere the glossary says 프로젝트.

## copy/accessible-name-matches-label

- Scope: icon-only controls and controls with a visible label.
- Rule: an icon-only control has an accessible name that names the action and object; a visible
  label is contained in the accessible name. In Figma, record the name in the layer name or the
  handoff annotation; in code, set it on the control.
- Why: screen-reader and speech-input users act by the name they hear or say.
- Exceptions: a decorative icon next to a text label has no name of its own.
- Source: WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
  for icon-only names; SC 2.5.3 Label in Name (https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)
  for visible labels.
- Bad: a trash icon button named `icon-trash`
- Good: a trash icon button named `프로젝트 삭제`

## Changing these rules

Add or change a rule only with the user's approval and either a cited standard or evidence from two
or more real screens or reviews. One screenshot, one shipped file, or one review comment never
becomes a rule by itself.
Record scope, why, exceptions, source, and a bad/good pair. A rule that code can check without
rendering belongs in lint; a rule that needs many exceptions goes back to prose guidance.
