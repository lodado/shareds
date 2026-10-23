# @lodado/slack-dispatch

Turns the Slack threads that tag you into reviewed pull requests, with you approving each step in a Slack DM.

1. **Poll** Slack for new mentions and route each to a repository by rule (GitHub link, repo name, channel table).
2. **Digest DM**: one section per new item with what was asked, the likely cause and a plan, each as 2 to 4 short lines,
   and a recommendation, read by the cheapest model. Recommended items arrive already checked. Pick a model in the menu
   (automatic: plan on Opus and build on Sonnet; or Opus, Sonnet or Haiku for both), then press _플랜 시작_, or
   _바로 구현_ to build the plan shown in the digest without a plan step of its own.
3. **Plan** each ticked item in an Orca worktree (`claude -p`, plan mode, the model you picked) and post a plan card.
   Reply in its thread to ask for changes; a reply while the item is building answers with its progress instead.
4. **Build** after you approve the plan: dependencies installed, the change committed, Visual QA run on the screens it
   touched (the repo's own dev server, screenshots, a model that looks at them). A terminal tab named _구현 진행 보기_
   opens in the item's Orca worktree (in the background, never taking the focus) and shows the changed files, because
   the agent itself is a background process Orca cannot show.
5. **Pull request** only when `ENABLE_PR=1`; merging needs your click, passing CI and an approved review. When it is
   open, the bot answers in the thread the work came from: the Slack thread, or your DM for a DM request.
   Every 10 minutes the bot asks GitHub about each pull request that is waiting: one merged there (not only by the
   button) finishes the item and its worktree is removed; one closed without a merge is called off.

You can also DM the bot a free-form request; it is split per repository and goes straight to planning. DM `대기` for the
open items, or `어제`, `그제`, `3일 전` (up to 30 days) to list what tagged you that day: new items arrive as a digest,
and the threads that were left out are listed with the reason.

## Run

```sh
pnpm start          # the service (Socket Mode); settings in .env, see .env.example
pnpm dry-run        # read-only look at today's mentions; sends nothing
pnpm lint && pnpm test
```

### Start at login (macOS)

```sh
pnpm service:install     # a LaunchAgent: starts when you log in, restarts after a crash
pnpm service:restart     # run the code as it is now (after you changed it)
pnpm service:status
pnpm service:uninstall
```

Log: `~/.slack-dispatch/service.log`. While it runs, `http://localhost:9814/health` and `/status` (stage counts, active
runs, last poll) answer on this machine only; `STATUS_PORT=0` turns that off. The agent file holds absolute paths (node,
the repository), so run `service:install` again after changing the node version or moving the folder.

Slack tokens (`xoxb-`, `xoxp-`, `xapp-`) are read from the macOS keychain, never from files. `claude` is the one installed on
this machine and uses its own login; no API key or sign-in variable is handed to it or to any program it starts. State lives in `~/.slack-dispatch`.
A lock file keeps a second service from starting on the same folder.

Every agent runs cut off from your own claude setup: `--safe-mode` (no CLAUDE.md, skills, plugins, hooks or MCP servers) and
`--restricted` (your user, project and folder settings are ignored, no tool runs commands unless the service lists it,
and the file tools stay in the working folder). That matters: with your settings loaded, a rule like `allow: ["Bash"]`
let every command run although the service passed an exact tool list. `OWN_SETUP=1` runs the plan and the build with
your own setup (your skills); it gives that protection up, leaving only a deny list of remote-reaching commands, so turn
it on only when nobody but you can influence what the agents read.

## How it stays safe

- The item state machine (`src/machine`) and the run lifecycle (`src/run`) are modelled in Bend; the laws are proven there
  and generated tests compare the code with the model (`src/*/__test__/formal`, generated, do not edit).
- Only the owner can act; every id in a click is checked against the store; every event is logged, append-only, with
  secrets redacted.
- The agents get a limited environment and an exact tool list that is enforced (see above); text from Slack is data inside a `<thread>` block and is escaped
  before it goes back into Slack.
- Spending is capped per item; at most 3 runs at a time, 1 per repository.
