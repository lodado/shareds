import Base
import ./MODEL.bend as M

# Metamorphic relations for the stale-search fixture (oracle.package.json S6). A relation compares the
# observation after a trace t with the observation after T(t); `oracle-discovery.mjs close` checks it on
# every in-space pair, first on the model and then on the product.

# T: issue one more request after the trace
def Meta.append(t: List<M.Msg>, m: M.Msg) -> List<M.Msg>:
  match t:
    case Nil{}:
      [m]
    case Con{h, rest}:
      h <> Meta.append(rest, m)

def Meta.issueAppended(t: List<M.Msg>) -> List<M.Msg>:
  Meta.append(t, M.Issue{})

# R (S1 item 1): issuing a request keeps what the list shows
def Meta.sameShown(a: Nat, b: Nat) -> Bool:
  Nat.is_eq(a, b)
