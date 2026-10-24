# Repository instructions

Claude and Codex load this repository's skills only through the `my-vibe-coding-helper` plugins.
Do not copy them into `~/.claude/skills`, `~/.codex/skills`, or `~/.agents/skills` (Codex reads
it too): a second copy shows up as a duplicate, often stale, entry in the skill list. JCode has
no plugin system, so it keeps plain copies in `~/.jcode/skills/`.

Install these plugins at user scope only. Do not add `--scope project` installs or run
`claude plugin update --scope project`: a project-scope install is a second copy that goes stale.

After successfully committing and pushing a change under `packages/<plugin>/skills/`, with the
version bump its contract test requires, refresh the installs:

```sh
git -C ~/orca/my-Vibe-Coding-Helper merge --ff-only main  # marketplace root; skip if it has local work
claude plugin marketplace update my-vibe-coding-helper
claude plugin update <plugin>@my-vibe-coding-helper
codex plugin add <plugin>@my-vibe-coding-helper
rsync -a packages/<plugin>/skills/<skill>/ "$HOME/.jcode/skills/<skill>/"
```

A flat layout (`packages/<plugin>/skills/SKILL.md`, e.g. frontend-oracle-design) copies
`skills/` to `~/.jcode/skills/<plugin>/`. Run this only after the push succeeds. The rsync does
not delete host-local files; verify each install against the repository source and preserve
local-only data. Restart Claude to load the new plugin version.

## slack-dispatch service

`packages/slack-dispatch` runs on the owner's machine, from this checkout, as a macOS LaunchAgent (see its README). A
running service keeps the old code, so after a change under `packages/slack-dispatch/src` or
`packages/slack-dispatch/scripts` passes `pnpm lint` and `pnpm test` there, bring it up to date and check that it is back:

```sh
pnpm --filter @lodado/slack-dispatch service:restart
pnpm --filter @lodado/slack-dispatch service:status   # job state running, health: 200
```

Run `service:install` instead when the node version or the folder changed (the agent file holds absolute paths). Never
start a second copy by hand: a lock file in `~/.slack-dispatch` refuses it. Restart only when no run is in progress
(`/status` on `localhost:9814` shows `activeRuns`); a run cut off by a restart is charged its whole budget.
