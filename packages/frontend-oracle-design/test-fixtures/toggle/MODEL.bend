import Base

# Reference model for the toggle fixture. `oracle-model.mjs emit state` generates every state and command
# from these types, runs the product through the adapter and judges each transition with the compiled
# relations below — the same defs LAWS.bend proves about Toggle.step.
type Toggle is Data:
  Toggle{checked: Bool, disabled: Bool, loading: Bool}

type Cmd is Data:
  Set{next: Bool}
  Load{on: Bool}
  Disable{on: Bool}

def Toggle.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Toggle.same(a: Bool, b: Bool) -> Bool:
  Bool.not(Bool.xor(a, b))

def Toggle.checked(s: Toggle) -> Bool:
  match s:
    case Toggle{c, d, l}:
      c

def Toggle.blocked(s: Toggle) -> Bool:
  match s:
    case Toggle{c, d, l}:
      Bool.or(d, l)

def Toggle.is_set(c: Cmd) -> Bool:
  match c:
    case Set{n}:
      True{}
    case Load{on}:
      False{}
    case Disable{on}:
      False{}

def Toggle.requested(c: Cmd) -> Bool:
  match c:
    case Set{n}:
      n
    case Load{on}:
      False{}
    case Disable{on}:
      False{}

def Toggle.apply(blocked: Bool, c: Bool, d: Bool, l: Bool, n: Bool) -> Toggle:
  match blocked:
    case True{}:
      Toggle{c, d, l}
    case False{}:
      Toggle{n, d, l}

def Toggle.step(s: Toggle, m: Cmd) -> Toggle:
  match s m:
    case Toggle{c, +d, +l} Set{n}:
      Toggle.apply(Bool.or(d, l), c, d, l, n)
    case Toggle{c, d, l} Load{on}:
      Toggle{c, d, on}
    case Toggle{c, d, l} Disable{on}:
      Toggle{c, on, l}

# R_blocked_keeps (P1): while disabled or loading, a Set command leaves checked unchanged
def Toggle.R_blocked_keeps(+s: Toggle, +c: Cmd, t: Toggle) -> Bool:
  Toggle.imp(Bool.and(Toggle.blocked(s), Toggle.is_set(c)), Toggle.same(Toggle.checked(t), Toggle.checked(s)))

# R_free_applies (P2): otherwise a Set command sets checked to the requested value
def Toggle.R_free_applies(+s: Toggle, +c: Cmd, t: Toggle) -> Bool:
  Toggle.imp(Bool.and(Bool.not(Toggle.blocked(s)), Toggle.is_set(c)), Toggle.same(Toggle.checked(t), Toggle.requested(c)))
