# Seeders

## Reference data (`index.js`)

`npm run seed` — upserts the 45 departments + 5 block allocations, the
Agriculture/Education sub-sectors spelled out in the schema doc, and the Sindh
districts. Safe to rerun (upsert on `name`).

## ADP 2026-2027 Volume V ledger import

Loads every scheme in the government ADP book (`Download.pdf`, kept out of git)
into `departments`, `subSectors`, `districts`, `schemes` and
`adpFinancialRecords`.

```
pip install pdfplumber
python backend/src/seeders/cache_words.py      # PDF -> scratch/words.jsonl  (~20-30 min)
python backend/src/seeders/parseAdpLedger.py   # words -> src/seeders/data/*.json
node  backend/src/seeders/importAdpLedger.js   # data -> MongoDB (idempotent, upsert on uid)
```

The extracted JSON under `data/` is committed, so step 4 can run on its own.

### What the import contains

| | |
|---|---|
| schemes | **3,712** — every Gen.Sr.No 1‑3710 in ledger copy 1, plus the 2 block-allocation lines |
| adpFinancialRecords | 3,712 — one per scheme for edition `2026-2027`, never overwritten |
| departments | 46 (45 line departments + block allocations) |
| subSectors | 96 |
| districts | 30 |

### Fidelity

The 12 financial figures per scheme (cols 8‑19 of the ledger) are read from
fixed column x-positions and **reconcile exactly** to the book's own printed
sub-sector `Total … :-` subtotals — e.g. Agriculture Water Management:
`Σ estimatedCost = 6,761.925`, `Σ priorActualExpenditure = 815.515`,
`Σ throwForward = 4,076.957`, `Σ nextYearAllocation.total = 1,883.983`, all
matching the book to 3 d.p.

`uid`, `genSerialNo`, `department`, `subSector`, `schemeCategory`,
`adpApproval` (status / date / `U/R`) and `targetCompletionDate` are likewise
read from fixed positions.

Known soft spots (the ledger's scheme-name column wraps over up to 6 lines
interleaved with siblings):

- ~30 schemes (0.8%) have no recoverable `name` (stored as the uid);
- ~15% of names carry a leading or trailing fragment from an adjacent line;
- 160 schemes (4.3%) have no `districtIds` and are not `provinceWide` (the
  district cell could not be resolved); 86 are `provinceWide` ("Sindh").

`uid` is the key and is 100% populated and unique. A handful of UIDs use the
book's compressed 2026-batch form (`LPDJD-26-0001`), a foreign-project segment
(`SGAFH-FP-24-0001`) or an amendment suffix (`WSDIM-PP-19-0452-A`).
