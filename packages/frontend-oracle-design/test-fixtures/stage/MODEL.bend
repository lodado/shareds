import Base

# Reference model of the authoring graph as `oracle-step.mjs` drives it (oracle-stage.mjs evaluateGraph,
# recordCheck, briefStatus) and of the lock that judges it (`oracle-lock.mjs create`). No record says where the
# authoring is: each step evaluates the deterministic nodes in the profile's order on the files as they are, up to
# the first failing one, and records one check (the files digest, the issue list, the label and the next). Editing
# is free; the lock is the only commit and judges every deterministic node on the bytes it reads.
#
# State, as the commands read it:
# - Blank: no package and no card yet. Start{prof} is the first write (intake).
# - FormalAt: p the package node (packageIssues at stage model), m the model node (derivation, cross-check, adequacy,
#   proofs, laws), k the card node's lint (its hand-written sections), proj whether oracle.md's generated region is
#   the projection of the package (a step projects it when p and m pass; check-card fails it otherwise), a the model
#   analyst review, c the card reviews (cold-read and reverse-impossible, read the same card digest and are
#   dispatched and saved together), seen the recorded checks against the files.
# - ContractAt: q the confirmation node (the user's approval, its source and the strict Space), k the card lint, c
#   the cold-read review (first in the Contract graph), seen.
# - Rev: the rounds a review ran (saved returns for distinct input digests, REVIEW_ROUNDS = 2) and whether a return
#   is saved for the input it reads now. Step asks for a review that has none for its input and fewer than 2 rounds.
# - Seen: no check recorded; the last check is of these files (Now) with the run of the same non-empty issue list
#   over distinct file states the checks end with (sameIssuesRun, saturating at SAME_ISSUES_STOP = 3); files changed
#   since, giving the issue list it recorded (Since) or another one (Moved).
# - Locked{prof}: stage.json at ORACLE_READY with the lock file; Drifted: a locked byte changed since the lock.
#
# Parts an edit touches. Each node has one owning part; an edit fixes the nodes its part owns (they pass), breaks the
# first of them (it fails with new issues) or keeps them (new bytes, the same issues):
# - PkgFile (Formal) owns p; it also changes the projection and both review inputs (the model input and the
#   projected card).
# - BendFiles (Formal) owns m; the projection records the digest of the inputs it read, the Bend files among them, so
#   it also changes the projection and the card reviews' input (the model analyst reads the sources only).
# - CardText (both profiles: oracle.md outside the generated region and the User Confirmation) owns k; it changes
#   the card reviews' input.
# - Approval (Contract: the User Confirmation section) owns q; the card reviews read the card without it.
#
# Left out: an edit that brings back bytes or issues seen before (the model's edits are always new bytes); several
# edits between two checks (`enabled` allows one); a return saved after its input changed (it counts a round on disk
# but answers no current input); card lint issues the generated region raises; the Formal approval (the card the
# trace starts from is approved; withdrawing it is left out); a stage.json written by hand; the Delivery run after
# the lock (its own model) and the run directory of a new revision.

type Prof is Data:
  Formal{}
  Contract{}

type Health is Data:
  Good{}
  Bad{}

type Rev is Data:
  NoRound{}
  Saved1{}
  Stale1{}
  Saved2{}
  Stale2{}

type Run is Data:
  K0{}
  K1{}
  K2{}
  K3{}

type Seen is Data:
  Never{}
  Now{run: Run}
  Since{run: Run}
  Moved{}

type Graph is Data:
  Blank{}
  FormalAt{p: Health, m: Health, k: Health, proj: Bool, a: Rev, c: Rev, seen: Seen}
  ContractAt{q: Health, k: Health, c: Rev, seen: Seen}
  Locked{prof: Prof}
  Drifted{}

type Part is Data:
  PkgFile{}
  BendFiles{}
  CardText{}
  Approval{}

type How is Data:
  Fixes{}
  Breaks{}
  Keeps{}

# Start: the first write. Step: `oracle-step.mjs --dir`. Check: `oracle-step.mjs --dir --check`. Save: the agent
# saves the returns the last step asked for (when the files are still the ones it checked), then runs step. Lock:
# `oracle-lock.mjs create`. Edit: a file of a part changes.
type Msg is Data:
  Start{prof: Prof}
  Step{}
  Check{}
  Save{}
  Lock{}
  Edit{part: Part, how: How}

# the exit status: 0, or not 0 (a failing node, a refused lock, --check on a locked oracle)
type Exit is Data:
  Exit0{}
  Exit1{}

type Out is Data:
  Out{exit: Exit, after: Graph}

# the next the phase line names (oracle-next.mjs NEXT_LINES keys step, lock, stop, init, revise)
type Hint is Data:
  HStep{}
  HLock{}
  HStop{}
  HInit{}
  HRevise{}

# the label of the last check; LNone before any check, or after an edit (the record then holds an older one)
type Label is Data:
  LNone{}
  LDiscovering{}
  LModeled{}
  LChecked{}
  LDrafted{}
  LReady{}

# what following NEXT FOR YOU does next: a command, or nothing (the user's decision, the Delivery run)
type Plan is Data:
  Act{e: Msg}
  Rest{}

def Graph.init() -> Graph:
  Blank{}

# ---- small names
def Graph.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Graph.iff(+a: Bool, +b: Bool) -> Bool:
  Bool.and(Graph.imp(a, b), Graph.imp(b, a))

def Graph.flag(b: Bool) -> Nat:
  match b:
    case True{}:
      1n
    case False{}:
      0n

def Graph.bad(h: Health) -> Bool:
  match h:
    case Good{}:
      False{}
    case Bad{}:
      True{}

def Graph.good(h: Health) -> Bool:
  Bool.not(Graph.bad(h))

def Graph.health_eq(+a: Health, +b: Health) -> Bool:
  Graph.iff(Graph.bad(a), Graph.bad(b))

def Graph.prof_n(p: Prof) -> Nat:
  match p:
    case Formal{}:
      0n
    case Contract{}:
      1n

def Graph.rev_n(r: Rev) -> Nat:
  match r:
    case NoRound{}:
      0n
    case Saved1{}:
      1n
    case Stale1{}:
      2n
    case Saved2{}:
      3n
    case Stale2{}:
      4n

def Graph.rev_eq(a: Rev, b: Rev) -> Bool:
  Nat.is_eq(Graph.rev_n(a), Graph.rev_n(b))

def Graph.run_n(r: Run) -> Nat:
  match r:
    case K0{}:
      0n
    case K1{}:
      1n
    case K2{}:
      2n
    case K3{}:
      3n

def Graph.seen_n(s: Seen) -> Nat:
  match s:
    case Never{}:
      0n
    case Now{r}:
      Nat.add(1n, Graph.run_n(r))
    case Since{r}:
      Nat.add(5n, Graph.run_n(r))
    case Moved{}:
      9n

def Graph.seen_eq(a: Seen, b: Seen) -> Bool:
  Nat.is_eq(Graph.seen_n(a), Graph.seen_n(b))

def Graph.part_n(p: Part) -> Nat:
  match p:
    case PkgFile{}:
      0n
    case BendFiles{}:
      1n
    case CardText{}:
      2n
    case Approval{}:
      3n

def Graph.label_n(l: Label) -> Nat:
  match l:
    case LNone{}:
      0n
    case LDiscovering{}:
      1n
    case LModeled{}:
      2n
    case LChecked{}:
      3n
    case LDrafted{}:
      4n
    case LReady{}:
      5n

def Graph.hint_n(h: Hint) -> Nat:
  match h:
    case HStep{}:
      0n
    case HLock{}:
      1n
    case HStop{}:
      2n
    case HInit{}:
      3n
    case HRevise{}:
      4n

def Graph.ok(o: Exit) -> Bool:
  match o:
    case Exit0{}:
      True{}
    case Exit1{}:
      False{}

def Graph.exit_of(fail: Bool) -> Exit:
  match fail:
    case True{}:
      Exit1{}
    case False{}:
      Exit0{}

# ---- reviews
# the rounds a review ran
def Graph.rounds(r: Rev) -> Nat:
  match r:
    case NoRound{}:
      0n
    case Saved1{}:
      1n
    case Stale1{}:
      1n
    case Saved2{}:
      2n
    case Stale2{}:
      2n

def Graph.is_saved(r: Rev) -> Bool:
  match r:
    case Saved1{}:
      True{}
    case Saved2{}:
      True{}
    case _:
      False{}

# step asks for it: no return saved for the input it reads now and fewer than REVIEW_ROUNDS rounds
def Graph.wantable(r: Rev) -> Bool:
  match r:
    case NoRound{}:
      True{}
    case Stale1{}:
      True{}
    case _:
      False{}

# a return saved for the current input: one more round
def Graph.saved(+r: Rev) -> Rev:
  match r:
    case NoRound{}:
      Saved1{}
    case Stale1{}:
      Saved2{}
    case _:
      r

def Graph.save_if(want: Bool, +r: Rev) -> Rev:
  match want:
    case True{}:
      Graph.saved(r)
    case False{}:
      r

# its input changed: the saved return no longer answers it, the rounds stay
def Graph.staled(+r: Rev) -> Rev:
  match r:
    case Saved1{}:
      Stale1{}
    case Saved2{}:
      Stale2{}
    case _:
      r

def Graph.left(r: Rev) -> Nat:
  match r:
    case NoRound{}:
      2n
    case Saved1{}:
      1n
    case Stale1{}:
      1n
    case _:
      0n

# ---- the recorded checks
# one more distinct file state with the same issues, saturating at SAME_ISSUES_STOP
def Graph.bump(r: Run) -> Run:
  match r:
    case K0{}:
      K1{}
    case K1{}:
      K2{}
    case K2{}:
      K3{}
    case K3{}:
      K3{}

# a failing check of the files the last check recorded keeps its run (recordCheck replaces that check)
def Graph.held(+r: Run) -> Run:
  match r:
    case K0{}:
      K1{}
    case _:
      r

# the run the next check records: none when no node fails; kept on unchanged files; one more when the files changed
# and give the issues it recorded; else one (sameIssuesRun over the checks with this one)
def Graph.run_failing(s: Seen) -> Run:
  match s:
    case Never{}:
      K1{}
    case Now{r}:
      Graph.held(r)
    case Since{r}:
      Graph.bump(r)
    case Moved{}:
      K1{}

def Graph.run_after(fail: Bool, s: Seen) -> Run:
  match fail:
    case False{}:
      K0{}
    case True{}:
      Graph.run_failing(s)

def Graph.since_or_moved(fresh: Bool, r: Run) -> Seen:
  match fresh:
    case True{}:
      Moved{}
    case False{}:
      Since{r}

# an edit: no record stays none; otherwise the files differ from the ones the last check recorded and give its issue
# list (not fresh) or another one
def Graph.edited(+fresh: Bool, s: Seen) -> Seen:
  match s:
    case Never{}:
      Never{}
    case Now{r}:
      Graph.since_or_moved(fresh, r)
    case Since{r}:
      Graph.since_or_moved(fresh, r)
    case Moved{}:
      Moved{}

def Graph.is_now(s: Seen) -> Bool:
  match s:
    case Now{r}:
      True{}
    case _:
      False{}

# one edit between two checks: the environment edits only on no record or on the files the last check recorded
def Graph.can_edit(s: Seen) -> Bool:
  match s:
    case Never{}:
      True{}
    case Now{r}:
      True{}
    case _:
      False{}

def Graph.now_run(s: Seen) -> Nat:
  match s:
    case Now{r}:
      Graph.run_n(r)
    case _:
      0n

# the last check recorded a failing node
def Graph.recorded_fail(s: Seen) -> Bool:
  Bool.not(Nat.is_eq(Graph.now_run(s), 0n))

# the last check is of these files and did not stop: it asked for the reviews it named (a stop asks for none)
def Graph.asks(s: Seen) -> Bool:
  match s:
    case Now{r}:
      Bool.not(Nat.is_eq(Graph.run_n(r), 3n))
    case _:
      False{}

def Graph.seen_of(s: Graph) -> Seen:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      seen
    case ContractAt{q, k, c, seen}:
      seen
    case _:
      Never{}

# ---- the graph in each profile's order
# Formal: package, model analyst (review), model, card, card reviews. Contract: cold-read (review), confirmation, card.
def Graph.first_k(k: Health) -> Label:
  match k:
    case Bad{}:
      LChecked{}
    case Good{}:
      LDrafted{}

def Graph.first_mk(m: Health, k: Health) -> Label:
  match m:
    case Bad{}:
      LModeled{}
    case Good{}:
      Graph.first_k(k)

def Graph.first3(p: Health, m: Health, k: Health) -> Label:
  match p:
    case Bad{}:
      LDiscovering{}
    case Good{}:
      Graph.first_mk(m, k)

def Graph.first2(q: Health, k: Health) -> Label:
  match q:
    case Bad{}:
      LDiscovering{}
    case Good{}:
      Graph.first_k(k)

def Graph.drafted(l: Label) -> Bool:
  Nat.is_eq(Graph.label_n(l), 4n)

# the part that owns the first failing node
def Graph.owner_m(m: Health) -> Part:
  match m:
    case Bad{}:
      BendFiles{}
    case Good{}:
      CardText{}

def Graph.owner3(p: Health, m: Health) -> Part:
  match p:
    case Bad{}:
      PkgFile{}
    case Good{}:
      Graph.owner_m(m)

def Graph.owner2(q: Health) -> Part:
  match q:
    case Bad{}:
      Approval{}
    case Good{}:
      CardText{}

# the reviews step asks for: the ones before the first failing node with no return for their input and fewer than
# two rounds (Formal: the analyst after the package, the card reviews after the card)
def Graph.wanted_a(p: Health, a: Rev) -> Bool:
  Bool.and(Graph.good(p), Graph.wantable(a))

def Graph.wanted_fc(p: Health, m: Health, k: Health, c: Rev) -> Bool:
  Bool.and(Graph.good(p), Bool.and(Graph.good(m), Bool.and(Graph.good(k), Graph.wantable(c))))

def Graph.formal_failing(p: Health, m: Health, k: Health, proj: Bool) -> Bool:
  Bool.or(Graph.bad(p), Bool.or(Graph.bad(m), Bool.or(Graph.bad(k), Bool.not(proj))))

def Graph.contract_failing(q: Health, k: Health) -> Bool:
  Bool.or(Graph.bad(q), Graph.bad(k))

# ---- an edit
def Graph.apply(how: How, h: Health) -> Health:
  match how:
    case Fixes{}:
      Good{}
    case Breaks{}:
      Bad{}
    case Keeps{}:
      h

# whether an edit of the first node of the order changes the issue list a step records
def Graph.fresh_first(how: How, bad: Bool) -> Bool:
  match how:
    case Fixes{}:
      bad
    case Breaks{}:
      True{}
    case Keeps{}:
      False{}

# the same for a node every node before which passes when `before` holds
def Graph.fresh_behind(how: How, +before: Bool, bad: Bool) -> Bool:
  match how:
    case Fixes{}:
      Bool.and(before, bad)
    case Breaks{}:
      before
    case Keeps{}:
      False{}

def Graph.formal_edit(part: Part, +how: How, +p: Health, +m: Health, +k: Health, +proj: Bool, +a: Rev, +c: Rev, +seen: Seen) -> Graph:
  match part:
    case PkgFile{}:
      FormalAt{Graph.apply(how, p), m, k, False{}, Graph.staled(a), Graph.staled(c), Graph.edited(Graph.fresh_first(how, Graph.bad(p)), seen)}
    case BendFiles{}:
      FormalAt{p, Graph.apply(how, m), k, False{}, a, Graph.staled(c), Graph.edited(Graph.fresh_behind(how, Graph.good(p), Graph.bad(m)), seen)}
    case CardText{}:
      FormalAt{p, m, Graph.apply(how, k), proj, a, Graph.staled(c), Graph.edited(Graph.fresh_behind(how, Bool.and(Graph.good(p), Graph.good(m)), Graph.bad(k)), seen)}
    case Approval{}:
      FormalAt{p, m, k, proj, a, c, seen}

def Graph.contract_edit(part: Part, +how: How, +q: Health, +k: Health, +c: Rev, +seen: Seen) -> Graph:
  match part:
    case Approval{}:
      ContractAt{Graph.apply(how, q), k, c, Graph.edited(Graph.fresh_first(how, Graph.bad(q)), seen)}
    case CardText{}:
      ContractAt{q, Graph.apply(how, k), Graph.staled(c), Graph.edited(Graph.fresh_behind(how, Graph.good(q), Graph.bad(k)), seen)}
    case _:
      ContractAt{q, k, c, seen}

# a locked byte the profile reads changed: the lock drifts (only a new revision goes on)
def Graph.contract_locked_edit(part: Part) -> Graph:
  match part:
    case CardText{}:
      Drifted{}
    case Approval{}:
      Drifted{}
    case _:
      Locked{Contract{}}

def Graph.locked_edit(prof: Prof, part: Part) -> Graph:
  match prof:
    case Formal{}:
      Drifted{}
    case Contract{}:
      Graph.contract_locked_edit(part)

# ---- a step: project the card when the package and the model pass, evaluate the nodes in order up to the first
# failing one, record the check
def Graph.formal_step(+p: Health, +m: Health, +k: Health, proj: Bool, a: Rev, c: Rev, seen: Seen) -> Graph:
  FormalAt{p, m, k, Bool.or(proj, Bool.and(Graph.good(p), Graph.good(m))), a, c, Now{Graph.run_after(Bool.not(Graph.drafted(Graph.first3(p, m, k))), seen)}}

def Graph.contract_step(+q: Health, +k: Health, c: Rev, seen: Seen) -> Graph:
  ContractAt{q, k, c, Now{Graph.run_after(Bool.not(Graph.drafted(Graph.first2(q, k))), seen)}}

# a save: the returns step asked for, when the files are still the ones it checked, then the step again
def Graph.formal_save(+p: Health, +m: Health, +k: Health, proj: Bool, +a: Rev, +c: Rev, +seen: Seen) -> Graph:
  Graph.formal_step(p, m, k, proj, Graph.save_if(Bool.and(Graph.asks(seen), Graph.wanted_a(p, a)), a), Graph.save_if(Bool.and(Graph.asks(seen), Graph.wanted_fc(p, m, k, c)), c), seen)

def Graph.contract_save(+q: Health, +k: Health, +c: Rev, +seen: Seen) -> Graph:
  Graph.contract_step(q, k, Graph.save_if(Bool.and(Graph.asks(seen), Graph.wantable(c)), c), seen)

# a step exits 1 when the check it recorded has a failing node
def Graph.stepped(+t: Graph) -> Out:
  Out{Graph.exit_of(Graph.recorded_fail(Graph.seen_of(t))), t}

# the lock judges every deterministic node on the bytes it reads; it reads no review
def Graph.lock_out(fail: Bool, prof: Prof, s: Graph) -> Out:
  match fail:
    case True{}:
      Out{Exit1{}, s}
    case False{}:
      Out{Exit0{}, Locked{prof}}

# ---- every command in every state
# the first write: the Formal package and its approved card with every node passing; the Contract card waiting for
# the user's approval
def Graph.started(prof: Prof) -> Graph:
  match prof:
    case Formal{}:
      FormalAt{Good{}, Good{}, Good{}, True{}, NoRound{}, NoRound{}, Never{}}
    case Contract{}:
      ContractAt{Bad{}, Good{}, NoRound{}, Never{}}

# with no package and no card a step names the intake and records nothing; there is nothing to lock
def Graph.blank_out(e: Msg) -> Out:
  match e:
    case Start{prof}:
      Out{Exit0{}, Graph.started(prof)}
    case Lock{}:
      Out{Exit1{}, Blank{}}
    case _:
      Out{Exit0{}, Blank{}}

def Graph.formal_out(e: Msg, +p: Health, +m: Health, +k: Health, +proj: Bool, +a: Rev, +c: Rev, +seen: Seen) -> Out:
  match e:
    case Start{prof}:
      Out{Exit0{}, FormalAt{p, m, k, proj, a, c, seen}}
    case Step{}:
      Graph.stepped(Graph.formal_step(p, m, k, proj, a, c, seen))
    case Check{}:
      Out{Graph.exit_of(Graph.formal_failing(p, m, k, proj)), FormalAt{p, m, k, proj, a, c, seen}}
    case Save{}:
      Graph.stepped(Graph.formal_save(p, m, k, proj, a, c, seen))
    case Lock{}:
      Graph.lock_out(Graph.formal_failing(p, m, k, proj), Formal{}, FormalAt{p, m, k, proj, a, c, seen})
    case Edit{part, how}:
      Out{Exit0{}, Graph.formal_edit(part, how, p, m, k, proj, a, c, seen)}

def Graph.contract_out(e: Msg, +q: Health, +k: Health, +c: Rev, +seen: Seen) -> Out:
  match e:
    case Start{prof}:
      Out{Exit0{}, ContractAt{q, k, c, seen}}
    case Step{}:
      Graph.stepped(Graph.contract_step(q, k, c, seen))
    case Check{}:
      Out{Graph.exit_of(Graph.contract_failing(q, k)), ContractAt{q, k, c, seen}}
    case Save{}:
      Graph.stepped(Graph.contract_save(q, k, c, seen))
    case Lock{}:
      Graph.lock_out(Graph.contract_failing(q, k), Contract{}, ContractAt{q, k, c, seen})
    case Edit{part, how}:
      Out{Exit0{}, Graph.contract_edit(part, how, q, k, c, seen)}

# after the lock step names init (the relock is idempotent); --check on a locked oracle is refused
def Graph.locked_out(e: Msg, +prof: Prof) -> Out:
  match e:
    case Check{}:
      Out{Exit1{}, Locked{prof}}
    case Edit{part, how}:
      Out{Exit0{}, Graph.locked_edit(prof, part)}
    case _:
      Out{Exit0{}, Locked{prof}}

# a drifted lock: step names the new revision, the lock and --check are refused
def Graph.drifted_out(e: Msg) -> Out:
  match e:
    case Check{}:
      Out{Exit1{}, Drifted{}}
    case Lock{}:
      Out{Exit1{}, Drifted{}}
    case _:
      Out{Exit0{}, Drifted{}}

def Graph.out(s: Graph, e: Msg) -> Out:
  match s:
    case Blank{}:
      Graph.blank_out(e)
    case FormalAt{p, m, k, proj, a, c, seen}:
      Graph.formal_out(e, p, m, k, proj, a, c, seen)
    case ContractAt{q, k, c, seen}:
      Graph.contract_out(e, q, k, c, seen)
    case Locked{prof}:
      Graph.locked_out(e, prof)
    case Drifted{}:
      Graph.drifted_out(e)

def Graph.exit(o: Out) -> Exit:
  match o:
    case Out{x, t}:
      x

def Graph.after(o: Out) -> Graph:
  match o:
    case Out{x, t}:
      t

def Graph.decide(+s: Graph, +e: Msg) -> Exit:
  Graph.exit(Graph.out(s, e))

def Graph.step(+s: Graph, +e: Msg) -> Graph:
  Graph.after(Graph.out(s, e))

def Graph.run_all(es: List<Msg>, s: Graph) -> Graph:
  match es:
    case Nil{}:
      s
    case Con{e, rest}:
      Graph.run_all(rest, Graph.step(s, e))

# every command and edit
def Graph.commands() -> List<Msg>:
  [Start{Formal{}}, Start{Contract{}}, Step{}, Check{}, Save{}, Lock{}, Edit{PkgFile{}, Fixes{}}, Edit{PkgFile{}, Breaks{}}, Edit{PkgFile{}, Keeps{}}, Edit{BendFiles{}, Fixes{}}, Edit{BendFiles{}, Breaks{}}, Edit{BendFiles{}, Keeps{}}, Edit{CardText{}, Fixes{}}, Edit{CardText{}, Breaks{}}, Edit{CardText{}, Keeps{}}, Edit{Approval{}, Fixes{}}, Edit{Approval{}, Breaks{}}, Edit{Approval{}, Keeps{}}]

def Graph.cat(xs: List<Msg>, ys: List<Msg>) -> List<Msg>:
  match xs:
    case Nil{}:
      ys
    case Con{x, rest}:
      Con{x, Graph.cat(rest, ys)}

# an edit of a part: a fix where its node fails, a break where it passes, a keep either way
def Graph.edits(+part: Part, h: Health) -> List<Msg>:
  match h:
    case Bad{}:
      [Edit{part, Fixes{}}, Edit{part, Keeps{}}]
    case Good{}:
      [Edit{part, Breaks{}}, Edit{part, Keeps{}}]

def Graph.commands_run() -> List<Msg>:
  [Step{}, Check{}, Save{}, Lock{}]

def Graph.formal_edits(can: Bool, p: Health, m: Health, k: Health) -> List<Msg>:
  match can:
    case True{}:
      Graph.cat(Graph.edits(PkgFile{}, p), Graph.cat(Graph.edits(BendFiles{}, m), Graph.edits(CardText{}, k)))
    case False{}:
      []

def Graph.contract_edits(can: Bool, q: Health, k: Health) -> List<Msg>:
  match can:
    case True{}:
      Graph.cat(Graph.edits(Approval{}, q), Graph.edits(CardText{}, k))
    case False{}:
      []

def Graph.locked_edits(prof: Prof) -> List<Msg>:
  match prof:
    case Formal{}:
      [Edit{PkgFile{}, Keeps{}}, Edit{BendFiles{}, Keeps{}}, Edit{CardText{}, Keeps{}}]
    case Contract{}:
      [Edit{CardText{}, Keeps{}}, Edit{Approval{}, Keeps{}}]

# the events the environment and the agent take: the commands at any time, the first write on Blank, and one edit
# between two checks (prove-reach counts these; every law is still checked on every command)
def Graph.enabled(s: Graph) -> List<Msg>:
  match s:
    case Blank{}:
      [Start{Formal{}}, Start{Contract{}}, Step{}, Check{}, Save{}, Lock{}]
    case FormalAt{p, m, k, proj, a, c, seen}:
      Graph.cat(Graph.commands_run(), Graph.formal_edits(Graph.can_edit(seen), p, m, k))
    case ContractAt{q, k, c, seen}:
      Graph.cat(Graph.commands_run(), Graph.contract_edits(Graph.can_edit(seen), q, k))
    case Locked{prof}:
      Graph.cat(Graph.commands_run(), Graph.locked_edits(prof))
    case Drifted{}:
      Graph.commands_run()

# ---- what the phase line says (briefStatus) and what following it does
def Graph.step_or_lock(b: Bool) -> Hint:
  match b:
    case True{}:
      HStep{}
    case False{}:
      HLock{}

def Graph.hint_now(r: Run, more: Bool) -> Hint:
  match r:
    case K3{}:
      HStop{}
    case _:
      Graph.step_or_lock(more)

# the next the last check recorded when it is of these files (the stop, step while a node fails or a review waits,
# else the lock); after an edit, step
def Graph.hint_at(s: Seen, more: Bool) -> Hint:
  match s:
    case Now{r}:
      Graph.hint_now(r, more)
    case _:
      HStep{}

def Graph.hint(s: Graph) -> Hint:
  match s:
    case Blank{}:
      HStep{}
    case FormalAt{+p, +m, +k, proj, +a, +c, seen}:
      Graph.hint_at(seen, Bool.or(Bool.not(Graph.drafted(Graph.first3(p, m, k))), Bool.or(Graph.wanted_a(p, a), Graph.wanted_fc(p, m, k, c))))
    case ContractAt{+q, +k, c, seen}:
      Graph.hint_at(seen, Bool.or(Bool.not(Graph.drafted(Graph.first2(q, k))), Graph.wantable(c)))
    case Locked{prof}:
      HInit{}
    case Drifted{}:
      HRevise{}

def Graph.label_seen(s: Seen, l: Label) -> Label:
  match s:
    case Now{r}:
      l
    case _:
      LNone{}

# the label the record shows, known when the last check is of these files
def Graph.label(s: Graph) -> Label:
  match s:
    case Blank{}:
      LNone{}
    case FormalAt{p, m, k, proj, a, c, seen}:
      Graph.label_seen(seen, Graph.first3(p, m, k))
    case ContractAt{q, k, c, seen}:
      Graph.label_seen(seen, Graph.first2(q, k))
    case Locked{prof}:
      LReady{}
    case Drifted{}:
      LReady{}

def Graph.plan_checked(wanted: Bool, owner: Part) -> Plan:
  match wanted:
    case True{}:
      Act{Save{}}
    case False{}:
      Act{Edit{owner, Fixes{}}}

def Graph.plan_open(now: Bool, wanted: Bool, owner: Part) -> Plan:
  match now:
    case False{}:
      Act{Step{}}
    case True{}:
      Graph.plan_checked(wanted, owner)

# next step: an unchecked oracle runs step; a checked one saves the returns step asked for, else fixes the part that
# owns the first failing node
def Graph.plan_step(s: Graph) -> Plan:
  match s:
    case Blank{}:
      Act{Start{Formal{}}}
    case FormalAt{+p, +m, k, proj, +a, c, seen}:
      Graph.plan_open(Graph.is_now(seen), Bool.or(Graph.wanted_a(p, a), Graph.wanted_fc(p, m, k, c)), Graph.owner3(p, m))
    case ContractAt{+q, k, c, seen}:
      Graph.plan_open(Graph.is_now(seen), Graph.wantable(c), Graph.owner2(q))
    case _:
      Rest{}

def Graph.plan_of(h: Hint, s: Graph) -> Plan:
  match h:
    case HStep{}:
      Graph.plan_step(s)
    case HLock{}:
      Act{Lock{}}
    case _:
      Rest{}

def Graph.policy(+s: Graph) -> Plan:
  Graph.plan_of(Graph.hint(s), s)

# the rank following NEXT FOR YOU lowers: three per failing node and per review round left, plus one while the last
# check is not of these files; a locked oracle is 0, no files at all above the first write
def Graph.unchecked(s: Seen) -> Nat:
  Graph.flag(Bool.not(Graph.is_now(s)))

def Graph.rank(s: Graph) -> Nat:
  match s:
    case Blank{}:
      20n
    case FormalAt{p, m, k, proj, a, c, seen}:
      Nat.add(1n, Nat.add(Nat.mul(3n, Nat.add(Graph.flag(Graph.bad(p)), Nat.add(Graph.flag(Graph.bad(m)), Nat.add(Graph.flag(Graph.bad(k)), Nat.add(Graph.left(a), Graph.left(c)))))), Graph.unchecked(seen)))
    case ContractAt{q, k, c, seen}:
      Nat.add(1n, Nat.add(Nat.mul(3n, Nat.add(Graph.flag(Graph.bad(q)), Nat.add(Graph.flag(Graph.bad(k)), Graph.left(c)))), Graph.unchecked(seen)))
    case _:
      0n

# ---- vocabulary of the laws
def Graph.is_lock(e: Msg) -> Bool:
  match e:
    case Lock{}:
      True{}
    case _:
      False{}

def Graph.is_check(e: Msg) -> Bool:
  match e:
    case Check{}:
      True{}
    case _:
      False{}

def Graph.is_save(e: Msg) -> Bool:
  match e:
    case Save{}:
      True{}
    case _:
      False{}

# a step, or a save, which runs it again
def Graph.reruns(e: Msg) -> Bool:
  match e:
    case Step{}:
      True{}
    case Save{}:
      True{}
    case _:
      False{}

def Graph.is_edit(e: Msg) -> Bool:
  match e:
    case Edit{part, how}:
      True{}
    case _:
      False{}

def Graph.is_open(s: Graph) -> Bool:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      True{}
    case ContractAt{q, k, c, seen}:
      True{}
    case _:
      False{}

def Graph.is_locked(s: Graph) -> Bool:
  match s:
    case Locked{prof}:
      True{}
    case _:
      False{}

def Graph.is_drifted(s: Graph) -> Bool:
  match s:
    case Drifted{}:
      True{}
    case _:
      False{}

def Graph.locked_as(t: Graph, n: Nat) -> Bool:
  match t:
    case Locked{prof}:
      Nat.is_eq(Graph.prof_n(prof), n)
    case _:
      False{}

def Graph.prof_of(s: Graph) -> Nat:
  match s:
    case ContractAt{q, k, c, seen}:
      1n
    case _:
      0n

def Graph.rev_a(s: Graph) -> Rev:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      a
    case _:
      NoRound{}

def Graph.rev_c(s: Graph) -> Rev:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      c
    case ContractAt{q, k, c, seen}:
      c
    case _:
      NoRound{}

def Graph.failing(s: Graph) -> Bool:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      Graph.formal_failing(p, m, k, proj)
    case ContractAt{q, k, c, seen}:
      Graph.contract_failing(q, k)
    case _:
      False{}

# a node fails in a step's view (the card projected when the package and the model pass)
def Graph.step_fail(s: Graph) -> Bool:
  match s:
    case FormalAt{+p, +m, k, proj, a, c, seen}:
      Bool.or(Graph.bad(p), Bool.or(Graph.bad(m), Graph.bad(k)))
    case ContractAt{q, k, c, seen}:
      Graph.contract_failing(q, k)
    case _:
      False{}

# a review step asks for in this state
def Graph.waits(s: Graph) -> Bool:
  match s:
    case FormalAt{+p, +m, +k, proj, +a, +c, seen}:
      Bool.or(Graph.wanted_a(p, a), Graph.wanted_fc(p, m, k, c))
    case ContractAt{q, k, c, seen}:
      Graph.wantable(c)
    case _:
      False{}

# step asked for the review in a state whose last check is of these files and did not stop
def Graph.asked_a(s: Graph) -> Bool:
  match s:
    case FormalAt{+p, m, k, proj, +a, c, seen}:
      Bool.and(Graph.asks(seen), Graph.wanted_a(p, a))
    case _:
      False{}

def Graph.asked_c(s: Graph) -> Bool:
  match s:
    case FormalAt{+p, +m, +k, proj, a, +c, seen}:
      Bool.and(Graph.asks(seen), Graph.wanted_fc(p, m, k, c))
    case ContractAt{q, k, +c, seen}:
      Bool.and(Graph.asks(seen), Graph.wantable(c))
    case _:
      False{}

# step asks for the card reviews and not the model analyst
def Graph.asks_card_only(+s: Graph) -> Bool:
  Bool.and(Graph.asked_c(s), Bool.not(Graph.asked_a(s)))

def Graph.hint_is(s: Graph, n: Nat) -> Bool:
  Nat.is_eq(Graph.hint_n(Graph.hint(s)), n)

def Graph.stops(s: Graph) -> Bool:
  Graph.hint_is(s, 2n)

def Graph.is_blank(t: Graph) -> Bool:
  match t:
    case Blank{}:
      True{}
    case _:
      False{}

def Graph.same_formal(p: Health, m: Health, k: Health, proj: Bool, a: Rev, c: Rev, seen: Seen, t: Graph) -> Bool:
  match t:
    case FormalAt{p2, m2, k2, proj2, a2, c2, seen2}:
      Bool.and(Graph.health_eq(p, p2), Bool.and(Graph.health_eq(m, m2), Bool.and(Graph.health_eq(k, k2), Bool.and(Graph.iff(proj, proj2), Bool.and(Graph.rev_eq(a, a2), Bool.and(Graph.rev_eq(c, c2), Graph.seen_eq(seen, seen2)))))))
    case _:
      False{}

def Graph.same_contract(q: Health, k: Health, c: Rev, seen: Seen, t: Graph) -> Bool:
  match t:
    case ContractAt{q2, k2, c2, seen2}:
      Bool.and(Graph.health_eq(q, q2), Bool.and(Graph.health_eq(k, k2), Bool.and(Graph.rev_eq(c, c2), Graph.seen_eq(seen, seen2))))
    case _:
      False{}

def Graph.same(s: Graph, +t: Graph) -> Bool:
  match s:
    case Blank{}:
      Graph.is_blank(t)
    case FormalAt{p, m, k, proj, a, c, seen}:
      Graph.same_formal(p, m, k, proj, a, c, seen, t)
    case ContractAt{q, k, c, seen}:
      Graph.same_contract(q, k, c, seen, t)
    case Locked{prof}:
      Graph.locked_as(t, Graph.prof_n(prof))
    case Drifted{}:
      Graph.is_drifted(t)

def Graph.edit_part(e: Msg) -> Nat:
  match e:
    case Edit{part, how}:
      Graph.part_n(part)
    case _:
      9n

def Graph.edit_how(e: Msg) -> How:
  match e:
    case Edit{part, how}:
      how
    case _:
      Keeps{}

# a node after the edit of a part: one it owns follows `how`, any other is as it was
def Graph.node_ok(owns: Bool, how: How, +h: Health, +g: Health) -> Bool:
  match owns:
    case True{}:
      Graph.health_eq(Graph.apply(how, h), g)
    case False{}:
      Graph.health_eq(h, g)

# a review after the edit of a part: one whose input the part feeds keeps its rounds and has no return for its input;
# any other is as it was
def Graph.review_ok(feeds: Bool, +r: Rev, +u: Rev) -> Bool:
  match feeds:
    case True{}:
      Bool.and(Nat.is_eq(Graph.rounds(r), Graph.rounds(u)), Bool.not(Graph.is_saved(u)))
    case False{}:
      Graph.rev_eq(r, u)

def Graph.formal_edit_ok(+n: Nat, +how: How, p: Health, m: Health, k: Health, proj: Bool, a: Rev, c: Rev, t: Graph) -> Bool:
  match t:
    case FormalAt{p2, m2, k2, proj2, a2, c2, seen2}:
      Bool.and(Graph.node_ok(Nat.is_eq(n, 0n), how, p, p2), Bool.and(Graph.node_ok(Nat.is_eq(n, 1n), how, m, m2), Bool.and(Graph.node_ok(Nat.is_eq(n, 2n), how, k, k2), Bool.and(Graph.iff(proj2, Bool.and(proj, Bool.not(Nat.is_le(n, 1n)))), Bool.and(Graph.review_ok(Nat.is_eq(n, 0n), a, a2), Graph.review_ok(Nat.is_le(n, 2n), c, c2))))))
    case _:
      False{}

def Graph.contract_edit_ok(+n: Nat, +how: How, q: Health, k: Health, c: Rev, t: Graph) -> Bool:
  match t:
    case ContractAt{q2, k2, c2, seen2}:
      Bool.and(Graph.node_ok(Nat.is_eq(n, 3n), how, q, q2), Bool.and(Graph.node_ok(Nat.is_eq(n, 2n), how, k, k2), Graph.review_ok(Nat.is_eq(n, 2n), c, c2)))
    case _:
      False{}

def Graph.is_keep(h: How) -> Bool:
  match h:
    case Keeps{}:
      True{}
    case _:
      False{}

def Graph.edit_ok(s: Graph, +e: Msg, t: Graph) -> Bool:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      Graph.formal_edit_ok(Graph.edit_part(e), Graph.edit_how(e), p, m, k, proj, a, c, t)
    case ContractAt{q, k, c, seen}:
      Graph.contract_edit_ok(Graph.edit_part(e), Graph.edit_how(e), q, k, c, t)
    case _:
      True{}

# the run a step records from the checks before it, by counting: 0 with no failing node, at least 1 on the files
# checked, one more (up to 3) on changed files giving the same issues, else 1
def Graph.pick(c: Bool, x: Nat, y: Nat) -> Nat:
  match c:
    case True{}:
      x
    case False{}:
      y

def Graph.run_expected_failing(s: Seen) -> Nat:
  match s:
    case Now{+r}:
      Graph.pick(Nat.is_eq(Graph.run_n(r), 0n), 1n, Graph.run_n(r))
    case Since{+r}:
      Graph.pick(Nat.is_eq(Graph.run_n(r), 3n), 3n, Nat.add(Graph.run_n(r), 1n))
    case _:
      1n

def Graph.run_expected(s: Seen, fail: Bool) -> Nat:
  match fail:
    case False{}:
      0n
    case True{}:
      Graph.run_expected_failing(s)

def Graph.rounds_ok(+r: Rev, +u: Rev, save: Bool, asked: Bool) -> Bool:
  Bool.and(Nat.is_le(Graph.rounds(r), Graph.rounds(u)), Bool.and(Nat.is_le(Graph.rounds(u), Nat.add(Graph.rounds(r), 1n)), Graph.imp(Bool.not(Nat.is_eq(Graph.rounds(r), Graph.rounds(u))), Bool.and(save, asked))))

# every deterministic node passes, the card projected from the package as it is now
def Graph.all_pass(s: Graph) -> Bool:
  match s:
    case FormalAt{p, m, k, proj, a, c, seen}:
      Bool.and(Graph.good(p), Bool.and(Graph.good(m), Bool.and(Graph.good(k), proj)))
    case ContractAt{q, k, c, seen}:
      Bool.and(Graph.good(q), Graph.good(k))
    case _:
      False{}

# ---- the laws: Q(s, e, t, o) with t = step(s, e) and o = decide(s, e)
# Q_lock_judges: on an open oracle the lock is accepted exactly when every deterministic node passes (a projection the
# package changed after fails the card), and then the oracle is locked under its profile; a refused lock writes nothing
def Graph.Q_lock_judges(+s: Graph, +e: Msg, +t: Graph, +o: Exit) -> Bool:
  Graph.imp(Bool.and(Graph.is_lock(e), Graph.is_open(s)), Bool.and(Graph.iff(Graph.ok(o), Graph.all_pass(s)), Bool.and(Graph.imp(Graph.ok(o), Graph.locked_as(t, Graph.prof_of(s))), Graph.imp(Bool.not(Graph.ok(o)), Graph.same(s, t)))))

# Q_lock_only: only an accepted lock of an open oracle whose every node passes locks it
def Graph.Q_lock_only(+s: Graph, +e: Msg, +t: Graph, o: Exit) -> Bool:
  Graph.imp(Bool.and(Bool.not(Graph.is_locked(s)), Graph.is_locked(t)), Bool.and(Graph.is_lock(e), Bool.and(Graph.is_open(s), Graph.all_pass(s))))

# Q_check_reads: --check writes nothing, and on an open oracle it fails exactly when the lock would be refused
def Graph.Q_check_reads(+s: Graph, +e: Msg, +t: Graph, +o: Exit) -> Bool:
  Graph.imp(Graph.is_check(e), Bool.and(Graph.same(s, t), Graph.imp(Graph.is_open(s), Graph.iff(Graph.ok(o), Graph.ok(Graph.decide(s, Lock{}))))))

# the label n names the first failing node of the profile's order, every node before it passing (the Contract order
# has no model node)
def Graph.first_formal(+n: Nat, +p: Health, +m: Health, +k: Health) -> Bool:
  Bool.and(Graph.iff(Nat.is_eq(n, 1n), Graph.bad(p)), Bool.and(Graph.iff(Nat.is_eq(n, 2n), Bool.and(Graph.good(p), Graph.bad(m))), Bool.and(Graph.iff(Nat.is_eq(n, 3n), Bool.and(Graph.good(p), Bool.and(Graph.good(m), Graph.bad(k)))), Graph.iff(Nat.is_eq(n, 4n), Bool.and(Graph.good(p), Bool.and(Graph.good(m), Graph.good(k)))))))

def Graph.first_contract(+n: Nat, +q: Health, +k: Health) -> Bool:
  Bool.and(Graph.iff(Nat.is_eq(n, 1n), Graph.bad(q)), Bool.and(Bool.not(Nat.is_eq(n, 2n)), Bool.and(Graph.iff(Nat.is_eq(n, 3n), Bool.and(Graph.good(q), Graph.bad(k))), Graph.iff(Nat.is_eq(n, 4n), Bool.and(Graph.good(q), Graph.good(k))))))

def Graph.first_ok(+t: Graph) -> Bool:
  match t:
    case FormalAt{+p, +m, +k, proj, a, c, seen}:
      Graph.first_formal(Graph.label_n(Graph.label(FormalAt{p, m, k, proj, a, c, seen})), p, m, k)
    case ContractAt{+q, +k, c, seen}:
      Graph.first_contract(Graph.label_n(Graph.label(ContractAt{q, k, c, seen})), q, k)
    case _:
      False{}

# Q_next_first: a step (or a save, which runs it) records the first failing node of the profile's order; it exits 1
# exactly when a node fails and names the lock exactly when no node fails and no review step asks for waits
def Graph.Q_next_first(+s: Graph, +e: Msg, +t: Graph, +o: Exit) -> Bool:
  Graph.imp(Bool.and(Graph.reruns(e), Graph.is_open(s)), Bool.and(Graph.first_ok(t), Bool.and(Graph.iff(Graph.ok(o), Bool.not(Graph.step_fail(t))), Graph.iff(Graph.hint_is(t, 1n), Bool.and(Bool.not(Graph.step_fail(t)), Bool.not(Graph.waits(t)))))))

# Q_edit_local: an edit changes the node its part owns as it says and no other node; it takes the return away from
# exactly the reviews whose input the part feeds, keeping their rounds; only a package or Bend edit stales the
# projection; the profile stays
def Graph.Q_edit_local(+s: Graph, +e: Msg, +t: Graph, o: Exit) -> Bool:
  Graph.imp(Bool.and(Graph.is_edit(e), Graph.is_open(s)), Bool.and(Nat.is_eq(Graph.prof_of(s), Graph.prof_of(t)), Graph.edit_ok(s, e, t)))

# Q_rounds: on an open oracle a review's rounds never fall and rise by at most one, only on a save and only for a
# review step asked for on the files it checked (no return for its input, fewer than two rounds): never a third round,
# and a return already saved for the input adds none
def Graph.Q_rounds(+s: Graph, +e: Msg, +t: Graph, o: Exit) -> Bool:
  Graph.imp(Bool.and(Graph.is_open(s), Graph.is_open(t)), Bool.and(Graph.rounds_ok(Graph.rev_a(s), Graph.rev_a(t), Graph.is_save(e), Graph.asked_a(s)), Graph.rounds_ok(Graph.rev_c(s), Graph.rev_c(t), Graph.is_save(e), Graph.asked_c(s))))

# Q_stop_third: a step (or save) records the run of the same issue list over distinct file states, and names the stop
# exactly when it reaches 3: the same issues on a third distinct file state stop it, and nothing earlier does
def Graph.Q_stop_third(+s: Graph, +e: Msg, +t: Graph, o: Exit) -> Bool:
  Graph.imp(Bool.and(Graph.reruns(e), Graph.is_open(s)), Bool.and(Nat.is_eq(Graph.now_run(Graph.seen_of(t)), Graph.run_expected(Graph.seen_of(s), Graph.step_fail(t))), Bool.and(Graph.is_now(Graph.seen_of(t)), Graph.iff(Graph.stops(t), Nat.is_eq(Graph.now_run(Graph.seen_of(t)), 3n)))))

# Q_refused_keeps: a refused lock or check writes nothing
def Graph.Q_refused_keeps(+s: Graph, +e: Msg, +t: Graph, +o: Exit) -> Bool:
  Graph.imp(Bool.and(Bool.or(Graph.is_lock(e), Graph.is_check(e)), Bool.not(Graph.ok(o))), Graph.same(s, t))

# Q_locked_stays: a locked oracle stays locked until a byte its profile reads changes; a drifted one stays drifted
# (only a new revision goes on)
def Graph.Q_locked_stays(+s: Graph, e: Msg, +t: Graph, o: Exit) -> Bool:
  Bool.and(Graph.imp(Graph.is_locked(s), Bool.or(Graph.same(s, t), Graph.is_drifted(t))), Graph.imp(Graph.is_drifted(s), Graph.is_drifted(t)))

def Graph.cell_with(+s: Graph, +e: Msg, +t: Graph, +o: Exit) -> Bool:
  Bool.and(Graph.Q_lock_judges(s, e, t, o), Bool.and(Graph.Q_lock_only(s, e, t, o), Bool.and(Graph.Q_check_reads(s, e, t, o), Bool.and(Graph.Q_next_first(s, e, t, o), Bool.and(Graph.Q_edit_local(s, e, t, o), Bool.and(Graph.Q_rounds(s, e, t, o), Bool.and(Graph.Q_stop_third(s, e, t, o), Bool.and(Graph.Q_refused_keeps(s, e, t, o), Graph.Q_locked_stays(s, e, t, o)))))))))

def Graph.cell_out(+s: Graph, +e: Msg, +o: Out) -> Bool:
  Graph.cell_with(s, e, Graph.after(o), Graph.exit(o))

def Graph.cell_ok(+s: Graph, +e: Msg) -> Bool:
  Graph.cell_out(s, e, Graph.out(s, e))

def Graph.all_ok(+s: Graph, es: List<Msg>) -> Bool:
  match es:
    case Nil{}:
      True{}
    case Con{e, rest}:
      Bool.and(Graph.cell_ok(s, e), Graph.all_ok(s, rest))

# a reached state: a check of these files has a run exactly when a node fails, and a Formal one with the package and
# the model passing has the card projected
def Graph.inv(+s: Graph) -> Bool:
  match s:
    case FormalAt{+p, +m, k, proj, a, c, +seen}:
      Bool.and(Graph.imp(Graph.is_now(seen), Graph.iff(Graph.recorded_fail(seen), Graph.step_fail(s))), Graph.imp(Bool.and(Graph.is_now(seen), Bool.and(Graph.good(p), Graph.good(m))), proj))
    case ContractAt{q, k, c, +seen}:
      Graph.imp(Graph.is_now(seen), Graph.iff(Graph.recorded_fail(seen), Graph.step_fail(s)))
    case _:
      True{}

# Following NEXT FOR YOU — step, save the returns step asked for, fix the part of the first failing node, lock —
# lowers the rank at every move, so it never returns to a state; it ends at the lock, the stop or the Delivery run
def Graph.ranked_as(p: Plan, +s: Graph) -> Bool:
  match p:
    case Act{e}:
      Nat.is_lt(Graph.rank(Graph.step(s, e)), Graph.rank(s))
    case Rest{}:
      True{}

def Graph.ranked(+s: Graph) -> Bool:
  Graph.ranked_as(Graph.policy(s), s)

# The every-trace safety def: in every state a trace reaches, the state invariants hold, following the next lowers
# the rank, and every law holds for every command. `oracle-model.mjs prove-reach --safe safe` proves it.
def Graph.safe(+s: Graph) -> Bool:
  Bool.and(Graph.inv(s), Bool.and(Graph.ranked(s), Graph.all_ok(s, Graph.commands())))

# ---- cell laws over small types (LAWS.bend)
def Graph.run_counts(+s: Seen, +f: Bool) -> Bool:
  Nat.is_eq(Graph.run_n(Graph.run_after(f, s)), Graph.run_expected(s, f))

def Graph.save_rounds(+r: Rev, +w: Bool) -> Bool:
  Bool.and(Graph.rounds_ok(r, Graph.save_if(w, r), w, Bool.and(w, Graph.wantable(r))), Graph.imp(Graph.is_saved(r), Graph.rev_eq(r, Graph.save_if(w, r))))

def Graph.first_failing(+p: Health, +m: Health, +k: Health) -> Bool:
  Graph.first_formal(Graph.label_n(Graph.first3(p, m, k)), p, m, k)

def Graph.first_failing_contract(+q: Health, +k: Health) -> Bool:
  Graph.first_contract(Graph.label_n(Graph.first2(q, k)), q, k)
