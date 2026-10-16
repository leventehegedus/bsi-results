#!/usr/bin/env python3
"""Build public/jfk.json from the BSI "Jubileumi Futók Klubja" spreadsheets.

The club's own lists come as one sheet per threshold, each with a row per runner
and one column per marathon year:

    Teljesítések | Név | Szül. év | Egyesület | Település | Állandó rajtszám | 1984 | 1985 | …

Usage:
    python3 scripts/jfk_from_xlsx.py --out public/jfk.json \
        --sheet 2025:Budapest_Maraton_JFK_2025_10-37x.xlsx \
        --sheet 2024:Budapest_Maraton_JFK_2024_5-9x.xlsx

Each --sheet is `<complete through year>:<file>`: the year of the last marathon
that sheet accounts for. The app fills in everything after that from the API,
so a sheet never has to be re-exported just because a new race was run.
"""
import argparse
import json
import re
import unicodedata
from collections import OrderedDict

import openpyxl

TIME = re.compile(r"^\d{1,2}:\d{2}:\d{2}$")


def fold(name: str) -> str:
    """Match names the way the app does: no accents, case or title prefixes."""
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\b(dr|ifj|id|prof)\.?\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def read_sheet(path: str):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(wb.active.iter_rows(values_only=True))
    head = [str(h).strip() if h is not None else "" for h in rows[0]]
    years = [h for h in head if re.fullmatch(r"\d{4}", h)]
    at = {h: i for i, h in enumerate(head)}
    out = []
    for r in rows[1:]:
        if not r or not r[1]:
            continue
        results = {}
        for y in years:
            v = r[at[y]]
            if v is None:
                continue
            s = str(v).strip()
            if TIME.match(s):
                results[y] = s
        out.append(
            {
                "n": str(r[1]).strip(),
                "y": int(str(r[2]).strip()) if r[2] and str(r[2]).strip().isdigit() else None,
                "c": str(r[3]).strip() if r[3] else "",
                "t": str(r[4]).strip() if r[4] else "",
                "b": str(r[5]).strip() if r[5] else "",
                "r": results,
            }
        )
    return years, out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", action="append", required=True, help="<through year>:<xlsx path>")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    merged: "OrderedDict[tuple, dict]" = OrderedDict()
    years: set = set()
    # newest sheet first, so its club / town / bib win on a merge
    sheets = sorted((s.split(":", 1) for s in args.sheet), key=lambda s: int(s[0]), reverse=True)
    for through, path in sheets:
        sheet_years, runners = read_sheet(path)
        years.update(int(y) for y in sheet_years)
        for runner in runners:
            # name + birth year identifies a person; without a year the town has to do
            key = (fold(runner["n"]), runner["y"] if runner["y"] else "t:" + fold(runner["t"]))
            known = merged.get(key)
            if known is None:
                merged[key] = {**runner, "u": int(through)}
                continue
            # a runner listed on both sheets: keep the fuller record, add anything missing
            for year, time in runner["r"].items():
                known["r"].setdefault(year, time)
            known["u"] = max(known["u"], int(through))
            for field in ("c", "t", "b"):
                known[field] = known[field] or runner[field]

    runners = sorted(merged.values(), key=lambda r: (-len(r["r"]), fold(r["n"])))
    data = {
        "source": "BSI Jubileumi Futók Klubja",
        "race": "Budapest Maraton",
        "years": sorted(years),
        "runners": runners,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(runners)} runners, {sum(len(r['r']) for r in runners)} finishes → {args.out}")


if __name__ == "__main__":
    main()
