# lint-guard

Claude Code **mod** (needs Claude Code 2.1.287+). It enforces, with regexes and `git diff` instead of model judgment, the rule that an agent fixes a lint or type diagnostic rather than hiding it.

| Guard                                                                                                                                                                                                | Event                          | Result                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Edit, Write or MultiEdit adds `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `as any`, `as unknown as`, `void <promise>`, `it.skip`/`.only`/`xit` to a code file, or `waitForTimeout` to a test file | `tool.call`                    | deny                                                                              |
| `git commit` while the diff against `HEAD` adds any of those (covers edits made through Bash or other tools)                                                                                         | `tool.call`                    | deny                                                                              |
| New `waitFor`, `waitUntil`, `expect.poll`, `networkidle`, `setTimeout`/`sleep` or a raised test timeout in a test file                                                                               | `tool.check`                   | ask                                                                               |
| Edit of ESLint, Vitest/Jest, lint-staged, commitlint or `.husky/` configuration, a `tsconfig` change that loosens checking, `--no-verify`, `HUSKY=0`, `SKIP=`, `core.hooksPath`                      | `tool.check`                   | ask                                                                               |
| After an Edit, Write or MultiEdit of a code file: local ESLint (`npx --no-install eslint`) on that file                                                                                              | `tool.call` + `session.append` | findings on the lines the call wrote are appended to the tool result Claude reads |

Only lines the call **adds** are scanned, so an existing match that an edit leaves in place is not blamed on the agent. Markdown and other non-code files are ignored.

The hook fails closed: if the guard throws or times out on an Edit, Write, MultiEdit or Bash call, that call is denied rather than silently unguarded.

## Limits

- Tools that write files without a `file_path`/`new_string` shape (MCP editors, shell redirects) bypass the edit guard. The commit guard still catches what they add to tracked files; a new untracked file is only seen once it is staged.
- A regex match inside a string or comment is still a hit. Approved exceptions: approve the `ask`, or start with `--safe-mode`.
- Post-edit lint runs `npx --no-install eslint` on the edited file from the session directory, with a 45 second timeout. A project without ESLint or an ESLint config is skipped silently; any other failure is reported to Claude. It never runs `--fix`. Only findings on the lines the call wrote are shown, so existing problems do not become the agent's. Whole-repo lint stays in `pnpm lint` and the pre-push gate.
- The edit lint blocks the next step while it runs, so a slow typed config makes every edit slower.

## Develop

```sh
pnpm --filter @lodado/lint-guard-plugin test   # pure detectors, node --test
claude plugin test                             # mod-level tests, run in this directory
claude plugin validate .
claude --plugin-dir packages/lint-guard        # try it in one session
```

Install at user scope only, like every plugin in this repository:

```sh
claude plugin marketplace update my-vibe-coding-helper
claude plugin install lint-guard@my-vibe-coding-helper --scope user
```
