# Backend and Data-access Contract

Read this only when setting DB and persistence boundaries in full-stack work. It does not mandate a
particular framework, ORM, database, or frontend architecture.

## Intake

Before implementation and the Oracle lock, confirm the following in the actual repo and record the
paths and responsibilities in the approved architecture source.

- The backend source root and public server entry points
- The data-access boundary that may import the DB driver·ORM
- The existing responsibilities of repository, service, and route/controller
- Where schema·migration·seed and integration tests are owned
- The persistence and reset policies for local·test·production

If a boundary is unresolved, do not create a new layer first. Return to `NEEDS_DECISION` and lock it
after the approved architecture is stable.

In an FSD repo, follow "Server Code Placement" in [`fsd.md`](fsd.md) for placing server domain code
— do not create an `src/server/` root outside the layers; put it in the owning slice's `api` segment
as a `server-only` boundary.

## Minimum Data-access Boundaries

- Keep DB driver·ORM imports and query execution only inside the approved repository/data-access module.
- The repository owns SQL/query, row mapping, stable ordering, the pagination predicate, and the
  next-page decision. route/controller and UI do not reimplement these.
- For a simple read-only lookup, the route/controller calls the repository directly. Do not add a
  service layer unless it coordinates multiple repositories, a transaction, or a business workflow.
- If a service is needed, state the workflow it coordinates and the transaction boundary in the
  architecture source. Do not create a service that merely forwards to the repository.
- Once the DB is designated the authoritative source, do not let a client cache, fixture, or draft
  become a separate source of truth for the same record.

## Persistence and reset

- Record the retention scope of container volumes, local files, or a managed DB in the architecture
  contract.
- Distinguish non-destructive shutdown from destructive reset commands, and state the name and the
  outcome of any data-deleting command.
- Verify whether seed·migration can be run repeatedly and how test isolation works, against the
  actual tools. Do not leave a fallback that deletes production data.

## Verification

If the repo has import-boundary lint or an architecture test, run it. If not, confirm through search
and independent review that no DB import·query sits outside the approved boundary. Verify logic that
changes query results, such as pagination, transaction, and mapping, with the nearest data-access
test, and use a real test database when possible.
