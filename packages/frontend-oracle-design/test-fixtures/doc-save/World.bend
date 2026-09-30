import Base

# Document-save fixture world, locked with oracle.md as S2. One save attempt is a finite record of the
# facts the policy talks about, including outcomes the policy forbids. `oracle-adequacy.mjs check`
# enumerates every record; the card chooses the fields it sets (Coordinates) and reads (Observations).
type Save is Data:
  Save{start: Bool, held: Bool, committed: Bool, ack: Bool, reload: Bool}

def Save.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

# A1: permission is never regained while one save request is processed
def Save.A1(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(h, s)


# G1 (S1 item 1): nothing is committed without permission at commit time
def Save.G1(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(c, h)

# G2 (S1 item 2): "Saved" is shown only for a committed change
def Save.G2(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(a, c)

# G3 (S1 item 3): a committed change is shown after a reload
def Save.G3(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(c, r)

# G5 (S1 item 2 and 3): a reload never shows a version the server did not commit — the client decides
# whether a reload reads the server, so this is a duty of the product, not an assumption
def Save.G5(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(r, c)

# G4 (S1 item 4): with permission throughout, the save commits, shows "Saved" and survives a reload
def Save.G4(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Bool.and(s, Bool.and(h, Bool.and(c, Bool.and(a, r))))

# O1: with permission throughout, the save commits, "Saved" appears and a reload shows the version
def Save.O1(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(Bool.and(s, h), Bool.and(c, Bool.and(a, r)))

# O2: without permission at commit time, nothing is committed
def Save.O2(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(Bool.not(h), Bool.not(c))

# O3: "Saved" appears only after a commit
def Save.O3(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(a, c)

# O4: after a commit, a reload shows the committed version
def Save.O4(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(c, r)

# O5: without a commit, a reload shows the old version
def Save.O5(w: Save) -> Bool:
  match w:
    case Save{s, h, c, a, r}:
      Save.imp(Bool.not(c), Bool.not(r))
