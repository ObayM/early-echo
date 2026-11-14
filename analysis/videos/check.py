import csv
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TABLE = os.path.join(ROOT, "data/tables/PSI-159_Experimental table_CFI-G_Normal Flames.csv")
MATCH = os.path.join(ROOT, "results/videos-match.csv")
CALIB = os.path.join(ROOT, "analysis/videos/calibration.txt")
CLIP_BASE = "https://earlyecho.obayy.dev/app/videos/"
STORY = "21174C3"
AGREE_S = 3


def num(x):
    try:
        return float(str(x).strip())
    except ValueError:
        return None


def code(x):
    return "".join(str(x).split())


def ranks(a):
    a = np.asarray(a, float)
    order = np.argsort(a, kind="mergesort")
    r = np.empty(len(a))
    r[order] = np.arange(len(a))
    for v in np.unique(a):
        m = a == v
        r[m] = r[m].mean()
    return r


def spearman(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    ok = ~(np.isnan(x) | np.isnan(y))
    if ok.sum() < 3:
        return None, int(ok.sum())
    return float(np.corrcoef(ranks(x[ok]), ranks(y[ok]))[0, 1]), int(ok.sum())


def higher_share(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if not len(a) or not len(b):
        return None
    return float(((a[:, None] > b[None, :]).sum() + 0.5 * (a[:, None] == b[None, :]).sum()) / (len(a) * len(b)))


def q(v):
    v = np.asarray([x for x in v if x is not None], float)
    if not len(v):
        return "none"
    p25, p50, p75 = np.percentile(v, [25, 50, 75])
    return f"median {p50:.2f} (middle half {p25:.2f} to {p75:.2f}, n={len(v)})"


RICH_O2 = 0.33


def flicker_rule(rows):
    rows = [x for x in rows if x["flicker"] is not None]

    def cut(train):
        return -max((sum((x["flicker"] > t) == (x["outcome"] == "SE") for x in train), -t) for t in sorted({x["flicker"] for x in train}))[1]

    right = 0
    for day in sorted({x["test"][:5] for x in rows}):
        t = cut([x for x in rows if x["test"][:5] != day])
        right += sum((x["flicker"] > t) == (x["outcome"] == "SE") for x in rows if x["test"][:5] == day)
    return {"right": int(right), "of": len(rows), "always": sum(x["outcome"] == "SE" for x in rows)}


def load_nasa():
    with open(TABLE, encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r["Self-ext or flow term"].strip() in ("SE", "FT")]
    out = {}
    for r in rows:
        r = {k.strip(): v for k, v in r.items()}
        note = r["Cool flame?"].strip()
        out[code(r["Test"])] = {
            "test": code(r["Test"]),
            "outcome": r["Self-ext or flow term"].strip(),
            "fuel": r["Fuel"].strip(),
            "oxygen": num(r["XO2 before test"]),
            "pressure_bar": num(r["approx p (bar)"]),
            "fuel_frac": num(r["Xf"]),
            "fuel_flow_mg_s": num(r["mHC (mg/s)"]),
            "nasa_burn_s": num(r["burn time (sec)"]),
            "cool_flame_note": note,
            "cool_flame": note.lower().startswith("yes"),
            "comments": r["Comments"].strip(),
        }
    return out


def load_match():
    with open(MATCH) as f:
        return {r["test"] for r in csv.DictReader(f) if r["pick"] == "1" and r["file_name"]}


def load_calib():
    with open(CALIB) as f:
        return {code(l.split(",")[0]) for l in f if l.strip() and not l.startswith("#")}


def main(res_dir):
    nasa = load_nasa()
    with_video = load_match()
    calib = load_calib()
    files = set(os.listdir(res_dir))
    reads = {}
    for t in nasa:
        if t + ".json" in files:
            with open(os.path.join(res_dir, t + ".json")) as f:
                reads[t] = json.load(f)

    rows = []
    for t, n in nasa.items():
        r = reads.get(t, {})
        clip = r.get("clip") or {}
        st = r.get("status") or ("not_read" if t in with_video else "no_video")
        vb = r.get("burn_time_s") if st == "ok" else None
        diff = round(vb - n["nasa_burn_s"], 1) if vb is not None and n["nasa_burn_s"] is not None else None
        rows.append({
            **{k: n[k] for k in ("test", "outcome", "fuel", "oxygen", "pressure_bar", "fuel_frac", "fuel_flow_mg_s",
                                 "nasa_burn_s", "cool_flame_note")},
            "calibration": "yes" if t in calib else "no",
            "has_video": "yes" if t in with_video else "no",
            "status": st,
            "ignition_s": r.get("ignition_s"),
            "extinction_s": r.get("extinction_s"),
            "video_burn_s": vb,
            "video_minus_nasa_s": diff,
            "cut_off_burn_s": r.get("burn_time_s") if st == "cut_off" else None,
            "peak_radius_px": r.get("peak_radius_px"),
            "start_radius_px": r.get("start_radius_px"),
            "growth_px_per_s": r.get("growth_px_per_s"),
            "shrink_last10_px_per_s": r.get("shrink_px_per_s"),
            "fade_pct_per_s": r.get("fade_pct_per_s"),
            "end_kind": r.get("end_kind"),
            "flicker": r.get("flicker"),
            "final_drop_s": r.get("final_drop_s"),
            "clip": clip.get("file") if clip.get("file") in files else None,
            "sheet": r.get("sheet") if r.get("sheet") in files else None,
        })
    rows.sort(key=lambda x: x["test"])

    with open(os.path.join(ROOT, "results/videos.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    L = []
    say = L.append
    out_cal = [x for x in rows if x["calibration"] == "no"]
    vid = [x for x in out_cal if x["has_video"] == "yes"]
    ok = [x for x in vid if x["status"] == "ok"]
    other = {}
    for x in vid:
        if x["status"] != "ok":
            other.setdefault(x["status"], []).append(x["test"])
    d = np.array([abs(x["video_minus_nasa_s"]) for x in ok if x["video_minus_nasa_s"] is not None])
    sd = np.array([x["video_minus_nasa_s"] for x in ok if x["video_minus_nasa_s"] is not None])

    say("NASA's gas flame videos, read by analysis/videos/read.py (read-1.0) and checked by analysis/videos/check.py.")
    say(f"The table has {len(rows)} normal gas flame tests that lit (SE or FT). {len(calib)} were used to tune the reader and are left out of every count below.")
    say(f"Results found for {len(reads)} tests in {res_dir}.")
    say("")
    say("Burn time")
    say(f"Of the {len(out_cal)} other tests, {len(vid)} have a video. The program read a flame in {len(ok)} of them.")
    for s, ts in sorted(other.items()):
        say(f"  {s}: {len(ts)} ({', '.join(ts)})")
    if len(d):
        for lim in (1, AGREE_S, 5):
            say(f"Within {lim} s of NASA's burn time: {int((d <= lim).sum())} of {len(ok)} read ({100 * (d <= lim).mean():.0f}%), "
                f"or {int((d <= lim).sum())} of {len(vid)} with a video ({100 * (d <= lim).sum() / len(vid):.0f}%).")
        say(f"Median difference (video minus NASA): {np.median(sd):+.1f} s. Median absolute difference: {np.median(d):.1f} s.")
    say("The table gives whole seconds, and its start and end may be timed by other sensors, so 1 to 2 s apart is expected.")
    say("")

    say("How the flame ends, SE (went out on its own) against FT (fuel cut while burning)")
    se = [x for x in ok if x["outcome"] == "SE"]
    ft = [x for x in ok if x["outcome"] == "FT"]
    for g, name in ((se, "SE"), (ft, "FT")):
        k = [x["end_kind"] for x in g]
        say(f"  {name}: {len(g)} read; end_kind gradual {k.count('gradual')}, sudden {k.count('sudden')}, none {k.count(None)}.")
    for f_, label in (("flicker", "flicker"), ("final_drop_s", "final drop (s)"), ("fade_pct_per_s", "fade in last 10 s (%/s)")):
        a = [x[f_] for x in se if x[f_] is not None]
        b = [x[f_] for x in ft if x[f_] is not None]
        h = higher_share(a, b)
        say(f"  {label}: SE {q(a)}; FT {q(b)}.")
        if h is not None:
            say(f"    A random SE test has the higher value {100 * h:.0f}% of the time against a random FT test (50% = no difference).")
    rich = [x for x in ok if x["oxygen"] is not None and x["oxygen"] >= RICH_O2]
    fl_all, fl_rich = flicker_rule(ok), flicker_rule(rich)
    say("  Flicker as a rule (above a cut-off = went out on its own), with the cut-off chosen from the other test days each time:")
    say(f"    all tests read: right {fl_all['right']} of {fl_all['of']}; always saying SE is right {fl_all['always']}.")
    say(f"    oxygen {100 * RICH_O2:.0f}% and up, where both endings happen: right {fl_rich['right']} of {fl_rich['of']}; always saying SE is right {fl_rich['always']}.")
    say("")

    say("Peak flame radius (pixels; there is no mm scale, and the camera zoom may differ between days)")
    pk = [x for x in ok if x["peak_radius_px"] is not None]
    for f_, label in (("oxygen", "oxygen"), ("fuel_flow_mg_s", "fuel flow"), ("pressure_bar", "pressure"),
                      ("nasa_burn_s", "NASA burn time")):
        rho, nn = spearman([x[f_] if x[f_] is not None else np.nan for x in pk], [x["peak_radius_px"] for x in pk])
        say(f"  against {label}: rank correlation {rho:+.2f} (n={nn}).")
    for f_, bins, unit in (("oxygen", [(0, 0.25), (0.25, 0.33), (0.33, 1)], ""), ("fuel_flow_mg_s", [(0, 0.9), (0.9, 1.6), (1.6, 99)], " mg/s")):
        parts = []
        for lo, hi in bins:
            v = [x["peak_radius_px"] for x in pk if x[f_] is not None and lo <= x[f_] < hi]
            if v:
                parts.append(f"{lo:g} to {hi:g}{unit}: median {np.median(v):.0f} px (n={len(v)})")
        say(f"  by {f_}: " + "; ".join(parts) + ".")
    say("")

    say("Size and brightness over the burn (NASA's documents say these flames grow while they dim)")
    g = [x["growth_px_per_s"] for x in ok if x["growth_px_per_s"] is not None]
    s10 = [x["shrink_last10_px_per_s"] for x in ok if x["shrink_last10_px_per_s"] is not None]
    fd = [x["fade_pct_per_s"] for x in ok if x["fade_pct_per_s"] is not None]
    gse = [x["growth_px_per_s"] for x in se if x["growth_px_per_s"] is not None]
    both = [x for x in ok if x["growth_px_per_s"] is not None and x["fade_pct_per_s"] is not None]
    say(f"  Radius trend over the whole burn: grows in {sum(v > 0 for v in g)} of {len(g)}; {q(g)} px/s.")
    say(f"  SE only: grows in {sum(v > 0 for v in gse)} of {len(gse)}; {q(gse)} px/s.")
    say(f"  Last 10 s before the end: radius shrinks in {sum(v > 0 for v in s10)} of {len(s10)}; shrink {q(s10)} px/s.")
    say(f"  Glow in the last 10 s: falls in {sum(v > 0 for v in fd)} of {len(fd)}; {q(fd)} %/s.")
    say(f"  Grows over the burn and dims at the end: {sum(x['growth_px_per_s'] > 0 and x['fade_pct_per_s'] > 0 for x in both)} of {len(both)}.")
    say("  The radius is where the blue glow falls to half its peak. As a flame dims its faint edge can drop under that line, so a shrinking number may be a dimming flame.")
    say("")

    say(f"For checking by eye: tests outside the tuning set where the video and the table differ by more than {AGREE_S} s, or the program did not read a flame.")
    for x in vid:
        if x["status"] != "ok" or (x["video_minus_nasa_s"] is not None and abs(x["video_minus_nasa_s"]) > AGREE_S):
            say(f"  {x['test']} {x['outcome']} NASA {x['nasa_burn_s']:g} s, video {x['video_burn_s'] if x['video_burn_s'] is not None else '-'} s, "
                f"status {x['status']}, sheet {x['sheet'] or '-'}")

    with open(os.path.join(ROOT, "results/videos.txt"), "w") as f:
        f.write("\n".join(L) + "\n")

    tests = {}
    for x in rows:
        t = x["test"]
        if t not in reads:
            continue
        r = reads[t]
        clip = r.get("clip") or {}
        has_clip = clip.get("file") in files
        tests[t] = {
            "status": x["status"],
            "nasa_burn_s": x["nasa_burn_s"],
            "video_burn_s": x["video_burn_s"],
            "clip": clip["file"] if has_clip else None,
            "poster": clip.get("poster") if has_clip and clip.get("poster") in files else None,
            "clip_speed": clip.get("speed") if has_clip else None,
            "clip_seconds": clip.get("seconds") if has_clip else None,
            "peak_bd": None,
            "peak_px": x["peak_radius_px"],
            "fade": None,
            "cool_flame": nasa[t]["cool_flame"],
            "calibration": x["calibration"] == "yes",
        }
    sr = reads.get(STORY, {})
    story_from = ((sr.get("clip") or {}).get("story") or {}).get("from_s")
    site = {
        "clip_base": CLIP_BASE,
        "reader": "read-1.0",
        "summary": {
            "with_video": sum(x["has_video"] == "yes" for x in rows),
            "read_ok": sum(x["status"] == "ok" for x in rows),
            "scored": len(ok),
            "burn_within_3s": int((d <= AGREE_S).sum()),
            "median_diff_s": round(float(np.median(d)), 1) if len(d) else None,
            "flicker": {**fl_rich, "min_oxygen": RICH_O2},
        },
        "story": {
            "clip": f"story-{STORY}.mp4",
            "clip_speed": 1,
            "clip_start_s": round(story_from - sr["ignition_s"], 1) if story_from is not None and sr.get("ignition_s") is not None else None,
        },
        "tests": tests,
    }
    path = os.path.join(ROOT, "public/data/videos.json")
    with open(path, "w") as f:
        f.write(json.dumps(site, separators=(",", ":")) + "\n")
    print("\n".join(L))
    print(f"\nwrote results/videos.csv ({len(rows)} rows), results/videos.txt, public/data/videos.json ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main(sys.argv[1])
