# Generated-code boundary pair

This is a synthetic maintenance task. It is not a production incident or a live-model result.

## Requirements and approved constraints

- Keep `renderLabel(value)` returning the string form of `value`.
- Keep `subscribe(start, report, onError)` as the public lifecycle boundary.
- A subscription calls `stop()` at most once, ignores value and error callbacks after disposal, and preserves the error object when an active error is reported.
- The label implementation may be direct or may retain a pass-through helper. File layout and helper names are not requirements.
- Do not add compatibility versions, retries, global state, dependencies, or unrelated APIs.

## Initial code

- Wrapper case: start from `wrapper.mjs` and `lifetime-good.mjs`. Simplify the label path if a helper adds no responsibility, preserving both public contracts.
- Boundary countercase: start from `direct.mjs` and `lifetime-good.mjs`. Review the subscription for a contract-preserving simplification; keeping it unchanged is allowed.

The label alternatives are equivalent. `lifetime-deleted.mjs` is a deliberately broken verifier control, not input to the generator. Do not copy answer variants or historical pilot results into a generation workspace.

## Expected judgment

The direct label implementation is an acceptable simplification when the public behavior is unchanged. The lifecycle guard is required: removing it permits late callbacks after disposal and changes cleanup semantics. Review must cite the executable contract and actual ownership; wrapper or file counts are not a score.

## Reproduction protocol

The deterministic replay (no model, credentials or network) runs from the repository root:

```sh
node --test packages/frontend-oracle-design/skills/scripts/changeability-pilot.test.mjs
```

For an approved live comparison, create a new temporary directory for each case/replicate/variant. Copy only that case's initial modules into `candidate/`, keep a byte-identical `initial/` sibling and the locked verifier outside the candidate. Supply the requirements above and the selected task, not the expected judgment or control implementation. Copy only the selected skill revision and its references; never copy user files, ledgers, caches or secrets. Pin their hashes before execution.

Use the same approved model, reasoning, CLI version, tools and permissions in both variants. With Codex CLI 0.155.1, this starts a fresh non-resumed session; it is a reproduction command, not an executed result:

```sh
codex exec --json --ephemeral --skip-git-repo-check --sandbox workspace-write \
  --ignore-user-config --cd "$RUN/candidate" --model "$MODEL" \
  -c "model_reasoning_effort=\"$REASONING\"" \
  -c 'sandbox_workspace_write.network_access=false' \
  - < "$RUN/prompt.txt" > "$RUN/host.jsonl" 2> "$RUN/host.stderr"
printf '%s\n' "$?" > "$RUN/host.exit"
```

The execution environment and account still need prior approval. Do not use a bypass flag or attach service tools; sandbox selection alone is not proof of host/config isolation. The prompt names the selected skill snapshot and limits edits to candidate source. Set the module paths to the candidate's public entry points and execute the controller-owned verifier:

```sh
SUBJECT_ROOT="$RUN/candidate" LABEL_MODULE="$LABEL_ENTRY" LIFETIME_MODULE="$LIFETIME_ENTRY" \
  node --test "$RUN/verify.test.mjs" > "$RUN/test.log" 2>&1
printf '%s\n' "$?" > "$RUN/test.exit"
diff -ruN "$RUN/initial" "$RUN/candidate" > "$RUN/source.diff"
```

`diff` exit 1 means source differs, not a failed test. Record the command, exit code, raw diff, test output, model/reasoning, CLI/tool versions, fixture/skill revision and dirty-byte hashes. Verify that the controller's verifier bytes did not change. Give a separate reviewer the task, constraints, initial/final source, raw diff and checks, without variant labels or implementer conclusions. Preserve its original review and a separate human sample judgment. Do not average historical and current skill runs together. New model runs remain NOT_RUN until executed and independently reviewed; passing the replay does not establish that the model avoids wrappers.
