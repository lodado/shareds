# Pagination fixture

A server-paginated orders table, used by the space cross-check test. `space-discovery.md` is the record of the axes the
user confirmed (its `## Case space` and `## State Model` tables are the declared space); `World.bend` and `MODEL.bend`
are the Bend space the cross-check compares it with.

## Orders table policy

The table shows twenty orders per page. The page number lives in the URL. While a new page loads, the rows of the previous page stay on screen. The last page the user asked for wins: a response for an older request never replaces the rows.
