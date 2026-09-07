"""
Coordinate-based extractor for the ADP 2026-2027 Volume V scheme ledger.

Pipeline (run from the repo root):
  1. pip install pdfplumber
  2. python backend/src/seeders/cache_words.py     # Download.pdf -> words cache
  3. python backend/src/seeders/parseAdpLedger.py  # words cache  -> data/*.json
  4. node  backend/src/seeders/importAdpLedger.js  # data/*.json  -> MongoDB

The PDF (Download.pdf at the repo root) contains THREE identical copies of the
full ledger:  copy 1: pages 10-627   copy 2: 628-1245   copy 3: 1246-1855.
Each copy has 3,712 scheme data rows. We parse copy 1 only.

Anchor: every "data row" (Gen.Sr integer in col-1 x-band + >=10 figures in
cols 8..19) is exactly one scheme. All hard fields (UID, district, status,
approval date, U/R, target, and the 12 financial figures) are read from fixed
x-bands, so neighbouring schemes never mix. The scheme NAME is the only wrapped
field: it is gathered from the name x-band across the rows around the data row,
which can occasionally pick up a sibling fragment - the UID, not the name, is
the key.

Nothing is invented: a data row that fails a hard check is written to the
warning report, not guessed. Financial sums reconcile to the book's own printed
sub-sector "Total ... :-" subtotals (see scratch/parse_report.json).
"""
import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
WORDS = os.path.join(REPO, "scratch", "words.jsonl")
OUT = os.path.join(HERE, "data")
REPORT = os.path.join(REPO, "scratch", "parse_report.json")
ADP_FY, REV_FY = "2026-2027", "2025-2026"
COPY1 = range(10, 628)

COL1 = (74, 101)
COL_UID = (100, 165)
COL_NAME = (183, 353)
COL_DIST = (345, 400)
COL_STAT = (400, 447)
COL_TGT = (447, 486)
FIG_MIN = 483

MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}
# district spelling (as printed in the book, incl. abbreviations) -> canonical
DISTRICT_VARIANTS = {
    "Badin": "Badin", "Dadu": "Dadu", "Ghotki": "Ghotki", "Hyderabad": "Hyderabad",
    "Jacobabad": "Jacobabad", "Jamshoro": "Jamshoro", "Kashmore": "Kashmore",
    "Keamari": "Keamari", "Kemari": "Keamari", "Khairpur": "Khairpur", "Korangi": "Korangi",
    "Larkana": "Larkana", "Larkano": "Larkana", "Larkana": "Larkana",
    "Malir": "Malir", "Matiari": "Matiari", "Mattiari": "Matiari",
    "Mirpurkhas": "Mirpur Khas", "Mirpur Khas": "Mirpur Khas", "Mirpur khas": "Mirpur Khas",
    "Mithi": "Tharparkar", "Sanghar": "Sanghar", "Shikarpur": "Shikarpur",
    "Sujawal": "Sujawal", "Sukkur": "Sukkur", "Tharparkar": "Tharparkar",
    "Thatta": "Thatta", "Umerkot": "Umerkot", "Umer Kot": "Umerkot", "Umarkot": "Umerkot",
    "Karachi": "Karachi", "Karachi Central": "Karachi Central", "Karachi East": "Karachi East",
    "Karachi West": "Karachi West", "Karachi South": "Karachi South",
    "Shaheed Benazirabad": "Shaheed Benazirabad", "Benazirabad": "Shaheed Benazirabad",
    "Nawabshah": "Shaheed Benazirabad", "S.Benazirabad": "Shaheed Benazirabad",
    "SBA": "Shaheed Benazirabad",
    "Naushahro Feroze": "Naushahro Feroze", "Naushehro Feroze": "Naushahro Feroze",
    "Naushero Feroze": "Naushahro Feroze", "N.Feroze": "Naushahro Feroze",
    "NaushahroFeroze": "Naushahro Feroze",
    "Tando Allahyar": "Tando Allahyar", "T.A.Yar": "Tando Allahyar", "T.Allahyar": "Tando Allahyar",
    "Tando Muhammad Khan": "Tando Muhammad Khan", "T.M.Khan": "Tando Muhammad Khan",
    "T.Muhammad Khan": "Tando Muhammad Khan", "TM Khan": "Tando Muhammad Khan",
    "Qambar Shahdadkot": "Qambar Shahdadkot", "Kambar Shahdadkot": "Qambar Shahdadkot",
    "Qambar": "Qambar Shahdadkot", "Kamber": "Qambar Shahdadkot", "Kambar": "Qambar Shahdadkot",
    "Qambar-Shahdadkot": "Qambar Shahdadkot", "Q.Shahdadkot": "Qambar Shahdadkot",
    "Sindh": "Sindh",
}
_DVAR = sorted(DISTRICT_VARIANTS, key=len, reverse=True)
DIST_RE = re.compile(r"\b(" + "|".join(re.escape(v) for v in _DVAR) + r")\b")

NUMTOK = re.compile(r"^-?[\d,]+\.\d{3}$")
PCTTOK = re.compile(r"^\d+(?:\.\d+)?%$")
DATETOK = re.compile(r"^\d{2}\.\d{2}\.\d{2}$")
TGTTOK = re.compile(r"^[A-Z][a-z]{2}-\d{2}$")
GENTOK = re.compile(r"^\d{1,4}$")
UID_4 = re.compile(r"([A-Z]{3,7})-([A-Z0-9]{2})-(\d{2})-(\d{3,4}(?:-[A-Z])?)")
UID_3 = re.compile(r"([A-Z]{3,7})-(\d{2})-(\d{3,4}(?:-[A-Z])?)")


def is_uid_token(tk):
    """A fragment of a UID printed in the UID column: uppercase letters,
    digits and dashes, and either carries a dash or is a 3-7 letter code."""
    if not re.fullmatch(r"[-A-Z0-9]+", tk):
        return False
    return ("-" in tk) or re.fullmatch(r"[A-Z]{3,7}", tk) or any(c.isdigit() for c in tk)

HDR_SUBSTR = ("QR Code Sector", "Location of", "Revised Allocation", "Rs. in million",
              "upto June", "in %age upto", "F.P.A. 01-07-26", "Gen.Sr.")
MARK_ON = "(On-Going Schemes)"
MARK_UN = "(Unapproved Schemes Carried Forward)"


def rows_of(ws, tol=3.0):
    out = []
    for x0, x1, top, text in sorted(ws, key=lambda w: (w[2], w[0])):
        if out and abs(top - out[-1][0]) <= tol:
            out[-1][1].append((x0, text))
        else:
            out.append([top, [(x0, text)]])
    return [(t, sorted(r, key=lambda w: w[0])) for t, r in out]


def band(row, lo, hi):
    return " ".join(t for x, t in row if lo <= x < hi)


def full(row):
    return " ".join(t for x, t in row)


def is_data(row):
    if not row:
        return False
    x0, t0 = row[0]
    if not (COL1[0] <= x0 < COL1[1] and GENTOK.match(t0)):
        return False
    figs = [t for x, t in row if x >= FIG_MIN and (NUMTOK.match(t) or PCTTOK.match(t))]
    return len(figs) >= 10


def row_kind(top, row):
    txt = full(row).strip()
    if not txt:
        return "blank"
    # A real data row can contain header-looking words in its scheme name
    # ("... Location of UC #12 ...") - detect it before the header heuristics.
    if is_data(row):
        return "data"
    # Column headers only ever appear in the top band of a page; gating on
    # position stops a scheme-name row like "... Location of UC #12 ..." from
    # being mistaken for the "Location of Scheme / District" header.
    if top < 120 and any(h in txt for h in HDR_SUBSTR):
        return "header"
    if re.match(r"^\{\d+\}$", txt) or re.match(r"^1 2 3 4 5 6 7 8 9 10 11", txt):
        return "header"
    if top < 48 and txt == txt.upper() and len(txt) > 3 and not any(c.isdigit() for c in txt) \
            and "RS." not in txt.upper() and not txt.endswith("-"):
        return "depthdr"
    if txt in (MARK_ON, MARK_UN):
        return "marker"
    if txt.startswith("Total "):
        return "subtotal"
    return "text"


def norm_districts(text):
    out = []
    for hit in DIST_RE.findall(text):
        c = DISTRICT_VARIANTS[hit]
        if c != "Sindh" and c not in out:
            out.append(c)
    # collapse "Karachi" if a specific Karachi sub-district was also found
    if any(d.startswith("Karachi ") for d in out) and "Karachi" in out:
        out = [d for d in out if d != "Karachi"]
    province = ("Sindh" in DIST_RE.findall(text)) and not out
    return out, province


def target_iso(tok):
    if not tok:
        return None
    mon, yy = tok.split("-")
    return f"20{yy}-{MONTHS[mon]:02d}-01"


def date_iso(tok):
    d, m, y = tok.split(".")
    return f"20{y}-{m}-{d}"


def clean_sub(s):
    return bool(s) and not (s == s.upper() and len(s) > 8)


def main():
    allpages = {}
    with open(WORDS, encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            allpages[r["p"]] = r["w"]

    schemes, financial, warnings = [], [], []
    departments, subsectors = {}, {}
    dept = subsec = None
    category = "on_going"
    seen = set()

    for p in COPY1:
        if p not in allpages:
            continue
        rr = rows_of(allpages[p])
        kinds = [row_kind(t, r) for t, r in rr]
        if "data" not in kinds:
            continue
        for (t, r), k in zip(rr, kinds):
            if k == "depthdr":
                d = full(r).strip()
                if d != "PROVINCIAL":
                    dept = d
                    departments.setdefault(dept, len(departments) + 1)

        data_idx = [i for i, k in enumerate(kinds) if k == "data"]

        def has_uid_prefix(row):
            return any(COL_UID[0] <= x < COL_UID[1] and tk.endswith("-")
                       and re.match(r"^[A-Z]{3,7}-", tk) for x, tk in row)

        def has_uid_tail(row):
            return any(COL_UID[0] <= x < COL_UID[1]
                       and re.match(r"^(?:[A-Z0-9]{2}-)*\d{3,4}(?:-[A-Z])?$", tk) and any(c.isdigit() for c in tk)
                       for x, tk in row)

        prefix_rows = [i for i, (_, r) in enumerate(rr) if has_uid_prefix(r)]
        tail_rows = [i for i, (_, r) in enumerate(rr) if has_uid_tail(r)]

        _NOTE_RE = re.compile(
            r"(\)\s*\.?$|\bC\s*:\s*[\d,]|\bR\s*:\s*[\d,]|\bRev\s*:|Total\s*Cost|GoS'?\s*Share|"
            r"Farmers?'?\s*Share|Share\s*:\s*Rs|\bRs\.?\s*[\d,]+\s*M\)|\(Total\s*:|"
            r"\(Revised\b|Revised\s+on\b|Revised\s+Date|w\.e\.f|\bSDG\s*#)")

        def looks_like_note(txt):
            """A trailing cost / PC-I / revision note line (belongs to the scheme
            whose name it follows, never the start of a new scheme name)."""
            t = txt.strip()
            return bool(t) and (t[0] in "(&" or t[0].islower() or bool(_NOTE_RE.search(t)))

        prev_i = -1
        for di in data_idx:
            # update sub-sector / category from rows since previous data row
            for j in range(prev_i + 1, di):
                tj, rj = rr[j]
                kj = kinds[j]
                txt = full(rj).strip()
                if kj == "marker":
                    category = "on_going" if txt == MARK_ON else "unapproved_carried_forward"
                elif kj == "subtotal":
                    mm = re.match(r"^Total\s+(.+?)\s*(?::-|\((?:On-Going|Unapproved)[^)]*\))", txt)
                    nm = mm.group(1).strip() if mm else None
                    if nm and dept:
                        d0 = re.sub(r"[^A-Za-z]", "", dept.split()[0]).upper()
                        caps = nm == nm.upper() and len(nm) > 8
                        if nm.lower() != dept.lower() and 2 < len(nm) < 80 \
                                and not nm.upper().startswith(d0) and not caps:
                            subsec = nm
                            subsectors.setdefault((dept, subsec), None)
                elif kj == "text" and j + 1 < len(kinds) and kinds[j + 1] == "marker":
                    if dept and 2 < len(txt) < 80 and not txt.startswith("Total ") \
                            and (any(c.islower() for c in txt) or txt in ("STEVTA", "DEPD")):
                        subsec = txt
                        subsectors.setdefault((dept, subsec), None)

            top, drow = rr[di]
            prev_di = prev_i  # previous scheme's data-row index (before we advance)
            # window rows: from prev data row (exclusive) to this one, + up to 2 after
            wrows = [rr[j] for j in range(prev_i + 1, di + 1)]
            after = []
            for j in range(di + 1, min(di + 6, len(rr))):
                if kinds[j] in ("data", "marker", "subtotal", "header", "depthdr"):
                    break
                # stop if a fresh UID prefix (next scheme) begins: a 3-6 letter
                # code token ending in "-" sitting in the UID band
                if any(COL_UID[0] <= x < COL_UID[1] and tk.endswith("-")
                       and re.match(r"^[A-Z]{3,6}-", tk) for x, tk in rr[j][1]):
                    break
                after.append(rr[j])
            wrows_all = wrows + after
            prev_i = di

            gen = int(drow[0][1])
            figs = [t for x, t in drow if x >= FIG_MIN and (NUMTOK.match(t) or PCTTOK.match(t))]
            nums = [f for f in figs if NUMTOK.match(f)][:10]
            pcts = [f for f in figs if PCTTOK.match(f)][:2]
            if len(nums) < 10 or len(pcts) < 2:
                warnings.append({"page": p, "gen": gen, "why": f"figs n{len(nums)} p{len(pcts)}", "row": full(drow)[:120]})
                continue

            # UID from the UID x-band across window rows
            # Collect UID-band tokens across the window, in reading order, and
            # stitch them: the book prints the UID split over 2 rows, e.g.
            # "AGRWM-" + "PP-25-0001", "SGAFH-" + "FP-24-0001",
            # "LPDJD-26-" + "0001", "SGADM-MD-26-" + "0004".
            uid_toks = [tk for _, r in wrows_all for x, tk in r
                        if COL_UID[0] <= x < COL_UID[1] and is_uid_token(tk)]
            glued = "".join(uid_toks)
            uid = None
            def seq4(s):
                m = re.match(r"(\d{3,4})(-[A-Z])?", s)
                return f"{int(m.group(1)):04d}{m.group(2) or ''}"

            m4 = UID_4.search(glued)
            m3 = UID_3.search(glued)
            if m4:
                uid = f"{m4.group(1)}-{m4.group(2)}-{m4.group(3)}-{seq4(m4.group(4))}"
            elif m3:
                uid = f"{m3.group(1)}-{m3.group(2)}-{seq4(m3.group(3))}"
            if not uid:
                warnings.append({"page": p, "gen": gen, "why": "no UID", "row": full(drow)[:120]})
                continue
            uid_printed = uid
            if uid in seen:
                # The source book itself prints a few colliding UIDs on
                # consecutive "new scheme" rows (distinct Gen.Sr.No). Keep every
                # row; disambiguate with a /N suffix so uid stays unique.
                n = 2
                while f"{uid_printed}/{n}" in seen:
                    n += 1
                uid = f"{uid_printed}/{n}"
                warnings.append({"page": p, "gen": gen, "why": "source UID collision -> suffixed",
                                 "uid": uid_printed, "stored": uid})
            seen.add(uid)

            # Districts wrap vertically; scan the scheme's window rows with a
            # slightly wider x-band (the district column x-position drifts a few
            # points page to page).
            # join adjacent rows with a space so a district split over two lines
            # ("Mirpur" / "Khas", "Naushahro" / "Feroze") is matched as one
            dist_text = " ".join(band(r, 344, 403) for _, r in wrows_all)
            districts, province = norm_districts(dist_text)
            if not districts and not province:
                # fall back to district names written inside the scheme name
                nm_text = " ".join(band(r, COL_NAME[0], COL_NAME[1]) for _, r in wrows_all)
                d2, p2 = norm_districts(nm_text)
                districts, province = d2, (p2 and not d2)

            stat_text = " ".join(band(r, COL_STAT[0], COL_STAT[1]) for _, r in wrows_all)
            status = "unapproved" if re.search(r"Un-?\s*Approved|(?:^|\s)Un-(?:\s|$)", stat_text) else "approved"
            under_rev = "U/R" in stat_text
            appr = None
            for _, r in wrows_all:
                for x, tk in r:
                    if COL_STAT[0] <= x < COL_STAT[1] and DATETOK.match(tk):
                        appr = date_iso(tk)
            tgt = next((t for x, t in drow if COL_TGT[0] <= x < COL_TGT[1] and TGTTOK.match(t)), None) \
                or next((t for x, t in drow if TGTTOK.match(t)), None)

            # --- Name: capture the full wrapped name block verbatim -----------
            # The block runs from just after the PREVIOUS scheme's UID-tail row
            # (skipping any closing "(C:.. + R:..)" note lines it owns) down to
            # this scheme's data row plus its own trailing name/tail lines.
            # Core name block = [this scheme's UID-prefix row .. this scheme's
            # UID-tail row]. The book brackets the wrapped name between them.
            pfx_k = max((i for i in prefix_rows if prev_di < i <= di), default=di)
            tail_k = min((i for i in tail_rows if i >= di), default=di)
            NB = lambda j: band(rr[j][1], COL_NAME[0], COL_NAME[1])

            name_start, name_end = pfx_k, tail_k + 1
            # extend UP: name line(s) printed above the prefix row (not the
            # previous scheme's trailing note, not a heading/marker)
            # The real stops are: the previous scheme's data row (prev_di), its
            # UID-tail row (has_uid_tail), its closing cost/PC note
            # (looks_like_note), or a heading/marker. Those bracket this scheme's
            # name cleanly, so the row / y-distance caps can be generous for the
            # long enumerated school-list names.
            j, top_j = pfx_k - 1, rr[pfx_k][0]
            while (j > prev_di and pfx_k - j <= 16 and top_j - rr[j][0] <= 200
                   and kinds[j] in ("text", "blank")
                   and not has_uid_prefix(rr[j][1]) and not has_uid_tail(rr[j][1])):
                nb = NB(j)
                if nb.strip() and looks_like_note(nb):
                    break
                if nb.strip():
                    name_start, top_j = j, rr[j][0]
                j -= 1
            # extend DOWN: this scheme's own trailing cost / revision note lines
            for j in range(tail_k + 1, min(tail_k + 4, len(rr))):
                if kinds[j] in ("data", "marker", "subtotal", "header", "depthdr") or has_uid_prefix(rr[j][1]):
                    break
                nb = NB(j)
                if nb.strip() and not looks_like_note(nb) and not has_uid_tail(rr[j][1]):
                    break
                name_end = j + 1
            name_rows = [rr[j] for j in range(name_start, name_end)]

            name = " ".join(band(r, COL_NAME[0], COL_NAME[1]) for _, r in name_rows)
            name = UID_4.sub(" ", name)
            name = UID_3.sub(" ", name)
            name = re.sub(r"\b[A-Z]{3,6}-(?:[A-Z0-9]{2}-)*", " ", name)
            name = re.sub(r"\b(?:[A-Z0-9]{2}-)?\d{2}-\d{3,4}\b", " ", name)
            name = re.sub(r"\b(Approved|Un-|U/R)\b", " ", name)
            name = re.sub(r"\bTotal\s+[A-Z][A-Za-z].*", " ", name)
            name = re.sub(r"Sector\s*/\s*Sub-sector\s*/?Name of Scheme", " ", name)
            name = re.sub(r"\bQR Code\b", " ", name)
            name = re.sub(r"\((?:On-Going Schemes|Unapproved Schemes Carried Forward)\)", " ", name)
            name = re.sub(r"^\s*\d{1,2}\s+(?=[A-Z(])", " ", name)  # stray column-legend digit
            name = re.sub(r"\s+", " ", name).strip(" ,.-")
            if len(name) < 5:
                name = ""

            if subsec and dept:
                subsectors.setdefault((dept, subsec), None)
            f = [float(x.replace(",", "")) for x in nums]
            schemes.append({
                "uid": uid, "genSerialNo": gen, "name": name or uid,
                "department": dept, "subSector": subsec,
                "districts": districts, "provinceWide": bool(province),
                "adpApproval": {"status": status,
                                "approvalDate": appr if status == "approved" else None,
                                "underRevision": bool(under_rev)},
                "schemeCategory": category,
                "targetCompletionDate": target_iso(tgt),
                "estimatedCost": f[0],
                "sourceEdition": {"page": p},
            })
            financial.append({
                "uid": uid, "adpFiscalYear": ADP_FY, "genSerialNoThisEdition": gen,
                "estimatedCost": f[0], "priorActualExpenditure": f[1],
                "priorActualExpenditureAsOf": "2025-06-30",
                "revisedAllocation": {"total": f[2], "fpa": f[3]},
                "revisedAllocationFiscalYear": REV_FY,
                "estimatedExpenditureThroughAllocationYear": f[4],
                "throwForward": f[5], "throwForwardAsOf": "2026-07-01",
                "nextYearAllocation": {"capital": f[6], "revenue": f[7], "total": f[8], "fpa": f[9]},
                "nextYearAllocationFiscalYear": ADP_FY,
                "financialProgressPercent": {"throughOutgoingFYJune": float(pcts[0].rstrip("%")),
                                             "throughNextFYJune": float(pcts[1].rstrip("%"))},
            })

    # recover sub-sector from UID prefix for the few missing/ALL-CAPS ones
    pref = defaultdict(lambda: defaultdict(int))
    for s in schemes:
        pfx = s["uid"].split("-PP-")[0]
        if clean_sub(s["subSector"]):
            pref[pfx][(s["department"], s["subSector"])] += 1
    best = {p: max(v, key=v.get) for p, v in pref.items() if v}
    rec = 0
    for s in schemes:
        if not clean_sub(s["subSector"]):
            b = best.get(s["uid"].split("-PP-")[0])
            if b:
                s["department"], s["subSector"] = b
                rec += 1

    os.makedirs(OUT, exist_ok=True)
    dep_rows = [{"name": n, "adpSerialNo": i, "type": "department"} for n, i in departments.items()]
    subseen = {}
    for s in schemes:
        if clean_sub(s["subSector"]):
            subseen.setdefault((s["department"], s["subSector"].lower()), (s["department"], s["subSector"]))
    sub_rows = [{"department": d, "name": s} for d, s in subseen.values()]
    json.dump(dep_rows, open(os.path.join(OUT, "adp_departments.json"), "w"), indent=1)
    json.dump(sub_rows, open(os.path.join(OUT, "adp_subsectors.json"), "w"), indent=1)
    json.dump(schemes, open(os.path.join(OUT, "adp_schemes.json"), "w"), indent=1)
    json.dump(financial, open(os.path.join(OUT, "adp_financial_records.json"), "w"), indent=1)
    byd = defaultdict(int)
    for s in schemes:
        byd[s["department"]] += 1
    rep = {"pagesParsed": "10-627 (copy 1 of 3)", "expectedSchemes": 3712,
           "departments": len(dep_rows), "subSectors": len(sub_rows),
           "schemes": len(schemes), "financialRecords": len(financial),
           "subSectorRecovered": rec, "warningCount": len(warnings),
           "missingName": sum(1 for s in schemes if s["name"] == s["uid"]),
           "missingSubSector": sum(1 for s in schemes if not clean_sub(s["subSector"])),
           "missingTarget": sum(1 for s in schemes if not s["targetCompletionDate"]),
           "missingDept": sum(1 for s in schemes if not s["department"]),
           "uidBad": sum(1 for s in schemes if not re.match(r"^[A-Z]{3,6}-[A-Z]{2}-\d{2}-\d{4}(?:/\d+)?$", s["uid"])),
           "byDept": dict(sorted(byd.items())), "warnings": warnings[:250]}
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    json.dump(rep, open(REPORT, "w"), indent=1)
    print(json.dumps({k: v for k, v in rep.items() if k not in ("warnings", "byDept")}, indent=1))
    print("byDept total:", sum(byd.values()))


if __name__ == "__main__":
    main()
