# ADP source data

This folder is unused — the real source data lives at the repo root in
[`adp-database-seed-csv/`](../../../../adp-database-seed-csv), one CSV per
reference table (`divisions.csv`, `districts.csv`, `departments.csv`,
`sub_sectors.csv`, `funding_sources.csv`, `sdg_goals.csv`, `schemes.csv`,
`scheme_districts.csv`, `scheme_funding.csv`, `scheme_sdg.csv`,
`revision_history.csv`, `financial_year_allocations.csv`), committed to the
repo. `../importAdpBooklet.js` reads from there by default (`--dir` to
override). See that script's header for the exact parsing/idempotency rules.
