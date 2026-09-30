# Document save fixture Oracle (skill tool fixture, not a product decision)

## Outcome Brief

- Actor and context: an editor saving a document while their edit permission may be revoked during processing
- Observable success: "Saved" appears only for a committed change, a reload shows it, and nothing commits after a revocation
- Non-goals: concurrent editors, duplicate requests, offline editing, real network or browser behavior
- Worst regression: "Saved" shown for a change committed after the revocation, or for a change a reload does not show
- Reversibility: revert the isolated fixture
- Risk: Medium
- Sources: S1

## Source Registry

| ID  | Kind           | Jurisdiction                 | Standard            | Location·version              | Approval status |
| --- | -------------- | ---------------------------- | ------------------- | ----------------------------- | --------------- |
| S1  | product-policy | document save and permission | fixture policy text | repo:README.md#fixture-policy | approved        |
| S2  | product-policy | adequacy world model         | Bend 2.0.34 world   | repo:World.bend#v1            | approved        |

## User Confirmation

- Status: approved
- Source: synthetic fixture approval; not a real consumer user confirmation

## Decided policies

- P1: A change commits only while the editor holds edit permission at commit time. (source: S1) (rows: O1, O2)
- P2: "Saved" is shown only for a committed change. (source: S1) (rows: O1, O3)
- P3: After a commit, a reload shows the committed version. (source: S1) (rows: O1, O4)

## Behavior Contract

| ID  | Policy     | Given                                           | When               | Then                                                           | Never                                            | Side effects | BVA                             |
| --- | ---------- | ----------------------------------------------- | ------------------ | -------------------------------------------------------------- | ------------------------------------------------ | ------------ | ------------------------------- |
| O1  | P1, P2, P3 | the editor holds edit permission throughout     | the editor saves   | the server commits; "Saved" appears; a reload shows the commit | "Saved" missing or a reload showing the old text | commit×1     | permission: held throughout     |
| O2  | P1         | permission is revoked before the server commits | the editor saves   | no commit; the server keeps the old version                    | a commit after the revocation                    | commit×0     | permission: revoked mid-request |
| O3  | P2         | any save attempt                                | the attempt ends   | "Saved" appears only after a commit                            | "Saved" without a commit                         | toast×1      | outcome: committed, no commit   |
| O4  | P3         | a committed save                                | the editor reloads | the reload shows the committed version                         | the old version after a commit                   | request×1    | reload: after a commit          |

- N/A: loading indicator, error, retry, empty data, out-of-order responses, cancellation, concurrent editors, duplicate requests and offline editing are outside this fixture's policy. (source: S1)

## Case space

| Family      | Dimension | Choices                                                              |
| ----------- | --------- | -------------------------------------------------------------------- |
| Data        | —         | excluded: one document with one version S1                           |
| Value       | —         | excluded: no free-form input in the policy S1                        |
| Async       | —         | excluded: request outcomes are enumerated by the Adequacy world (S2) |
| Order       | —         | excluded: the revocation timing is the Adequacy coordinate held (S2) |
| Entry       | —         | excluded: one save button S1                                         |
| Environment | —         | excluded: pure model fixture S1                                      |
| Platform    | —         | excluded: pure model fixture S1                                      |
| Inherited   | —         | excluded: first revision S1                                          |

## Terms

| Term | Context | Name                   | Category     | Field     | Observed via                                  | Definition                                          | Not                                | Source | Status    |
| ---- | ------- | ---------------------- | ------------ | --------- | --------------------------------------------- | --------------------------------------------------- | ---------------------------------- | ------ | --------- |
| T1   | editor  | submit permission      | controllable | start     | —                                             | the editor holds edit permission when pressing Save | permission when the server commits | S1     | confirmed |
| T2   | editor  | commit-time permission | controllable | held      | —                                             | the editor still holds it when the server commits   | permission at submit               | S1     | confirmed |
| T3   | server  | commit                 | observable   | committed | API: GET /documents/1 returns the new version | the server applied the change durably               | request sent; server accepted      | S1     | confirmed |
| T4   | editor  | Saved acknowledgement  | observable   | ack       | UI: the "Saved" toast                         | the editor sees "Saved"                             | request sent; response received    | S1     | confirmed |
| T5   | editor  | reload                 | observable   | reload    | UI: the document after a page reload          | the reloaded page shows the submitted version       | the in-memory draft                | S1     | confirmed |
| T6   | editor  | document               | concept      | —         | —                                             | the one document being edited                       | —                                  | S1     | confirmed |

## Adequacy

- World: S2 Save
- Coordinates: start held
- Observations: committed ack reload
- Rows: O1 O2 O3 O4
- Rows outside the world: none

| Assumption | Source | Falsifier                                                           |
| ---------- | ------ | ------------------------------------------------------------------- |
| A1         | S1     | a permission log showing permission restored mid-request            |
| A2         | S1     | a reload served from a client cache that the server never committed |

| Goal | Kind    | Cites |
| ---- | ------- | ----- |
| G1   | safety  | S1    |
| G2   | safety  | S1    |
| G3   | safety  | S1    |
| G4   | witness | S1    |

| Example | Goal | World                             | Verdict  |
| ------- | ---- | --------------------------------- | -------- |
| E1      | G1   | start held committed ack reload   | holds    |
| E2      | G1   | start !held committed ack reload  | violates |
| E3      | G3   | start held committed !ack !reload | violates |

| Hazard              | Disposition                     |
| ------------------- | ------------------------------- |
| permission-change   | modeled: start held             |
| concurrent-change   | n/a: S1 one editor              |
| display-vs-commit   | modeled: committed ack          |
| effect-count        | n/a: S1 one request per attempt |
| identity-reference  | n/a: S1 one document            |
| feature-composition | n/a: S1 save only               |
