# Pagination fixture

A server-paginated orders table, used by the projection tests: `MODEL.bend` is the Bend model, `pager-product.mjs` the
product and `pager.adapter.mjs` the adapter the generated tests drive it through.

## Orders table policy

The table shows twenty orders per page. The page number lives in the URL. While a new page loads, the rows of the previous page stay on screen. The last page the user asked for wins: a response for an older request never replaces the rows.
