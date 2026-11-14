import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TABLES = ROOT / "data/tables"
NORMAL = TABLES / "PSI-159_Experimental table_CFI-G_Normal Flames.csv"
INVERSE = TABLES / "PSI-159_Experimental table_CFI-G_Inverse Flames.csv"
LISTING = Path(sys.argv[1])
OUT = ROOT / "results/videos-match.csv"

VIDEO_EXT = (".ts", ".mp4", ".mov", ".avi", ".mkv")
HOW_ORDER = ["exact", "suffix", "code_at_start", "date_fix"]
CODE = r"\d{4,5} ?[A-Z]\d+"


def rows(path):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        rs = [[c.strip().replace("�", "") for c in r] for r in csv.reader(fh)]
    rs = [r for r in rs if any(r)]
    return [dict(zip(rs[0], r + [""] * (len(rs[0]) - len(r)))) for r in rs[1:]]


def col(r, start):
    return next(v for k, v in r.items() if k.lower().startswith(start.lower()))


def norm(code):
    return code.replace(" ", "").upper()


def entries(listing):
    for e in listing["added"]:
        if isinstance(e, str):
            yield e, None
            continue
        name = next((e[k] for k in ("fileName", "file_name", "name", "filename", "path", "key") if k in e), None)
        size = next((e[k] for k in ("size", "fileSize", "file_size", "size_bytes", "bytes", "length") if k in e), None)
        if name is None:
            raise SystemExit(f"listing entry without a file name: {e}")
        yield Path(name).name, int(size) if size is not None else None


def rec_date(base):
    m = re.search(r"vlc-record-(\d{4})-(\d{2})-(\d{2})", base)
    return date(*map(int, m.groups())) if m else None


def yyddd(d):
    return f"{d.year % 100:02d}{d.timetuple().tm_yday:03d}"


def parse(name):
    base = re.sub(r"^PSI-\d+_Raw Data_", "", Path(name).stem)
    tail = re.split(r"udp_+", base)[-1] if re.search(r"udp_+", base) else None
    head = re.match(rf"({CODE})[-_ ]", base)
    return tail, head.group(1) if head else None, rec_date(base)


def match(name, tests):
    tail, head, rec = parse(name)
    t = norm(tail) if tail else None
    if t in tests:
        return t, "exact", ""
    m = re.fullmatch(r"(.+?)(_\d+|-)", t or "")
    if m and m.group(1) in tests:
        return m.group(1), "suffix", ""
    if head and norm(head) in tests:
        return norm(head), "code_at_start", ""
    m = re.fullmatch(r"(\d{4}|\d{6})([A-Z]\d+)", t or "")
    if m and rec:
        want, got = yyddd(rec), m.group(1)
        if len(got) == 4:
            ok, what = any(want[:i] + want[i + 1:] == got for i in range(5)), f"one digit missing from {want}"
        else:
            ok, what = any(got[:i] + got[i + 1:] == want for i in range(6)), f"one digit extra in {want}"
        if ok and want + m.group(2) in tests:
            fixed = want + m.group(2)
            note = (f"name says {t}, which has {len(got)} digits before the letter; recorded {rec} = 20{want[:2]} day "
                    f"{int(want[2:])}, so read as {fixed} ({what}); {fixed} is in the table and no other file names it")
            return fixed, "date_fix", note
    return None, None, ""


def main():
    normal = rows(NORMAL)
    picked = [r for r in normal if r["Flame Type"] == "Normal" and col(r, "Self") in ("SE", "FT")]
    order = [norm(r["Test"]) for r in picked]
    outcome = {norm(r["Test"]): col(r, "Self") for r in picked}
    assert len(order) == len(set(order)) == 133, len(order)
    other_normal = {norm(r["Test"]) for r in normal} - set(order)
    inverse = {norm(r["Test"]) for r in rows(INVERSE)}

    listing = json.load(open(LISTING))
    files = [(n, s) for n, s in entries(listing) if n.lower().endswith(VIDEO_EXT)]
    print(f"listing: {len(listing['added'])} entries, {len(files)} video files")

    found = defaultdict(list)
    unmatched = []
    for name, size in files:
        test, how, note = match(name, set(order))
        if test:
            found[test].append(dict(file_name=name, size_bytes=size, how=how, date_fix_note=note))
        else:
            unmatched.append(name)

    for test, fs in found.items():
        if any(f["how"] == "date_fix" for f in fs) and len(fs) > 1:
            print(f"WARNING: date fix for {test} collides with another file: {[f['file_name'] for f in fs]}")

    out = []
    for test in order:
        fs = found.get(test, [])
        fs.sort(key=lambda f: (HOW_ORDER.index(f["how"]), not f["file_name"].lower().endswith(".ts"), -(f["size_bytes"] or 0)))
        for i, f in enumerate(fs):
            out.append(dict(test=test, outcome=outcome[test], **f, pick=int(i == 0)))
        if not fs:
            out.append(dict(test=test, outcome=outcome[test], file_name="", size_bytes="", how="none", date_fix_note="", pick=0))

    OUT.parent.mkdir(exist_ok=True)
    with open(OUT, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["test", "outcome", "file_name", "size_bytes", "how", "date_fix_note", "pick"])
        w.writeheader()
        w.writerows(out)

    have = [t for t in order if t in found]
    none = [t for t in order if t not in found]
    pick = [r for r in out if r["pick"]]
    gb = sum(r["size_bytes"] or 0 for r in pick) / 1e9
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out)} rows")
    print(f"tests with a video: {len(have)} of {len(order)} ({sum(outcome[t] == 'SE' for t in have)} SE, {sum(outcome[t] == 'FT' for t in have)} FT)")
    print(f"picked files: {len(pick)}, {gb:.2f} GB" + (" (some sizes missing)" if any(r["size_bytes"] is None for r in pick) else ""))
    print("matched files per how:", dict(Counter(r["how"] for r in out if r["how"] != "none")))
    print("picked files per how:", dict(Counter(r["how"] for r in pick)))
    for r in out:
        if r["how"] not in ("exact", "none"):
            print(f"  {r['how']}: {r['test']} <- {r['file_name']} (pick {r['pick']})" + (f"\n    {r['date_fix_note']}" if r["date_fix_note"] else ""))
    for t, fs in found.items():
        if len(fs) > 1:
            print(f"  {t} has {len(fs)} files: " + ", ".join(f"{f['file_name']} ({f['size_bytes']} B)" for f in fs))
    print(f"tests with no video ({len(none)}):", " ".join(f"{t} ({outcome[t]})" for t in none) or "-")

    agree, off1, other = 0, 0, []
    for r in out:
        if r["how"] != "exact":
            continue
        rec = parse(r["file_name"])[2]
        if rec is None:
            other.append((r["test"], "no date in name"))
        elif yyddd(rec) == r["test"][:5]:
            agree += 1
        else:
            hm = re.search(r"vlc-record-\d{4}-\d\d-\d\d-(\d\d)h(\d\d)m", r["file_name"])
            when = f"{rec} {hm.group(1)}:{hm.group(2)}" if hm else str(rec)
            if int(yyddd(rec)) - int(r["test"][:5]) == 1 and hm and int(hm.group(1)) < 6:
                off1 += 1
            other.append((r["test"], when))
    n_exact = sum(r["how"] == "exact" for r in out)
    print(f"day-of-year check on exact matches: {agree} of {n_exact} agree, {off1} recorded the next day before 06:00 "
          f"(run went past midnight), {n_exact - agree - off1} other")
    for t, why in other:
        print(f"  {t}: recorded {why}")

    kinds, unknown = Counter(), []
    for name in unmatched:
        tail, head, _ = parse(name)
        codes = {norm(c) for c in (tail, head) if c}
        codes |= {re.sub(r"(_\d+|-)$", "", c) for c in codes}
        kind = "inverse flame test" if codes & inverse else "normal flame, not SE/FT" if codes & other_normal else "in neither table"
        kinds[kind] += 1
        if kind == "in neither table":
            unknown.append(name)
    print(f"video files matching none of the 133: {len(unmatched)}", dict(kinds))
    for name in unknown:
        print(f"  in neither table: {name}")


if __name__ == "__main__":
    main()
