"""
Step 1 of the ADP ledger import: extract word coordinates from every page of
Download.pdf into scratch/words.jsonl (one {"p": <index>, "w": [[x0,x1,top,text],
...]} per line). parseAdpLedger.py consumes that cache.

    pip install pdfplumber
    python backend/src/seeders/cache_words.py

Re-running resumes: pages already in the cache are skipped. The full run over
1,856 pages takes ~20-30 minutes.
"""
import json
import os
import time

import pdfplumber

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
PDF = os.path.join(REPO, "Download.pdf")
OUT = os.path.join(REPO, "scratch", "words.jsonl")


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    done = set()
    if os.path.exists(OUT):
        for line in open(OUT, encoding="utf-8"):
            try:
                done.add(json.loads(line)["p"])
            except Exception:
                pass
    fh = open(OUT, "a", encoding="utf-8")
    t0 = time.time()
    with pdfplumber.open(PDF) as pdf:
        n = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            if i in done:
                continue
            words = [
                [round(w["x0"], 1), round(w["x1"], 1), round(w["top"], 1), w["text"]]
                for w in page.extract_words(use_text_flow=False, keep_blank_chars=False)
            ]
            fh.write(json.dumps({"p": i, "w": words}) + "\n")
            fh.flush()
            if i % 50 == 0:
                print(f"{i}/{n}  {round(time.time() - t0, 1)}s", flush=True)
    fh.close()
    print(f"DONE {n} pages in {round(time.time() - t0, 1)}s")


if __name__ == "__main__":
    main()
