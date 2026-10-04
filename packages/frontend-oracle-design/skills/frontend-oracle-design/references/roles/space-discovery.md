# Space discovery: confirm axes before any Bend

Read with common, card/policy-sources and [input families](case-space-inputs.md), including dependencies.
This interview is separate from the author-only card-format and case-space projection procedure.
The controller asks the questions and obtains actual human answers. Intake proposes and records them.
Do not write World.bend, a state machine or a law from the request. Run the interview first, in the
user's language. It is not Draft approval: confirmed axes do not replace Draft confirmation or authorize
a lock, test edits or production work.

1. **Propose the axes.** Start from the seven input families and add the request's own. Give each axis
   one line: meaning, candidate values, role, and why a correct and wrong result differ on it. Each axis
   names its source ID and exact location, an approved requirement or investigation file:line.
   Code, test and browser observations are investigation evidence, not approved policy. Label an inferred
   axis Assumption and a missing fact Unknown. Unknown is not excluded. Ask which axis is missing for
   judging right and wrong and which is unnecessary; an actual human `yes` accepts the proposal.
2. **Ask counterexamples.** Find two situations the confirmed axes cannot tell apart, one correct and
   one a bug, and ask one at a time with a recommendation:

   ```text
   Case A: <axis>=<value>, <axis>=<value> → correct
   Case B: <axis>=<value>, <axis>=<value> → bug: <what the user loses>
   The axes above are identical. Tell them apart? Then I add <axis> (<role>): <how the test sets or reads it>.
   ```

3. **Repeat** until no such pair comes easily. An axis that changes product policy is the user's to
   confirm, never the agent's.
4. **Classify each axis.** controllable: the test sets it to build the situation. observable: read from
   the product. hidden: real, but no test reads it. derived: computed from other axes and never stored
   as product state. A hidden axis that decides correct versus bug is a SUFFICIENCY FAILURE: show the
   two worlds and hidden value, recommend promoting it to observable or adding a substitute signal.
5. **Freeze the record.** Save confirmed axes and every question and answer verbatim as
   .ai/oracles/<id>/sources/space-discovery.md, register it as an approved source and return its location
   for the author to name in package spaceDiscovery; the lock covers it. Keep confirmed axes in a
   `## Case space` table and flow states in `## State Model` when applicable. An answer that states
   product behavior is also quoted as an R\*. No agent confirmation on the user's behalf.

Only after confirmation may the author write Terms, World, Assumptions and Goals and run adequacy.
Once Bend files exist, oracle-discovery.mjs cross-check --package compares the source declaration with
the Bend space. Each new-axis or cross-term candidate returns here as an A/B question, and each
silent-decision as a policy question. Card lint fails cross-check-undecided until each candidate is
resolved in model/record or decided in discoveryDecisions with its source. Each kernel sufficiency
counterexample (a minimal pair) returns here in the same A/B form. The author loads discovery.md when
running those checks; intake need not load its whole closure procedure merely to interview.

These questions decide the model, so they go out before the Draft, the exception to carrying questions
on the Draft. A run where the user cannot answer ends NEEDS_DECISION with the first question.
If later investigation changes axes, print only added/removed dimensions, reason, possible-case count
delta and changed residual risk. A policy question blocking only a separable part becomes a hold under
the author-owned case-space rules, never permission for tests or production on its blocked part.
