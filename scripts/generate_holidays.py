"""Generate data/holidays.json for the calendar site.

Uses the open-source `holidays` library (https://github.com/vacanza/holidays):
  - Tamil Nadu: India, subdivision "TN", public holidays
  - US: federal holidays (with observed days)

Run locally:   pip install holidays && python scripts/generate_holidays.py
In CI it runs weekly (see .github/workflows/update-holidays.yml), so new years
and fixes in the library reach the site without editing any code.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

import holidays

YEARS_BEFORE = 1   # keep last year for looking back
YEARS_AFTER = 3    # and a few years ahead
OUT = Path(__file__).resolve().parent.parent / "data" / "holidays.json"

ESTIMATED = re.compile(r"\s*\((estimated|tentative)\)\s*$", re.I)


def entries(calendar: holidays.HolidayBase) -> list[dict]:
    """Flatten a holidays calendar into [{date, name, estimated?}], one entry per holiday name."""
    out = []
    for day, names in sorted(calendar.items()):
        for name in str(names).split("; "):        # the library joins same-day holidays with "; "
            name = name.strip()
            item = {"date": day.isoformat(), "name": ESTIMATED.sub("", name)}
            if ESTIMATED.search(name):
                item["estimated"] = True
            out.append(item)
    return out


def main() -> None:
    this_year = date.today().year
    years = list(range(this_year - YEARS_BEFORE, this_year + YEARS_AFTER + 1))

    data = {
        "source": f"python-holidays {holidays.__version__}",
        "years": {
            str(y): {
                "tn": entries(holidays.India(subdiv="TN", years=y)),
                "us": entries(holidays.US(years=y)),
            }
            for y in years
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} for {years[0]}–{years[-1]} ({data['source']})")


if __name__ == "__main__":
    main()
