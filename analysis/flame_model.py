import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "public/data/tests.json"
SUMMARY = ROOT / "public/data/summary.json"
OUT_JSON = ROOT / "public/data/model.json"
OUT_TXT = ROOT / "results/flame-model.txt"

INPUTS = {
    "o2": ("oxygen", "share"),
    "p": ("pressure", "ratio"),
    "flow": ("fuel flow", "ratio"),
    "fuel": ("fuel", "name"),
    "dil": ("gas mixed with the oxygen", "name"),
    "d0": ("droplet size", "ratio"),
    "o2flow": ("oxygen flow", "ratio"),
    "around": ("fuel in the gas around it", "share"),
}
NEAR = {"share": 0.04, "ratio": math.log(1.3)}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def tests():
    return json.load(open(TESTS))


def gas():
    out = []
    for t in tests():
        if t["exp"] == "CFI-G" and t["end"] in ("out", "stopped") and t["raw"].get("Flame Type") == "Normal":
            out.append(dict(id=t["id"], day=t["date"], o2=t["o2"], p=t["p"], flow=num(t["raw"].get("mHC (mg/s)")), alive=t["end"] == "stopped"))
    return out


def droplets():
    out = []
    for t in tests():
        if t["exp"] == "FLEX" and t["end"] in ("out", "burned"):
            out.append(dict(id=t["id"], day=t["date"], o2=t["o2"], p=t["p"], dil=t["dil"], fuel=t["fuel"], d0=t.get("d0") or None, alive=t["end"] == "burned"))
    return out


def inverse():
    out = []
    for t in tests():
        r = t["raw"]
        if t["exp"] == "CFI-G" and t["end"] in ("out", "stopped") and r.get("Flame Type", "").lower() == "inverse":
            out.append(dict(id=t["id"], day=t["date"], o2=num(r.get("XO2")), p=t["p"], o2flow=num(r.get("O2 flow rate (mg/s)")),
                            around=num(r.get("Xf  before test")), fuel=t["fuel"], alive=t["end"] == "stopped"))
    return out


def close(k, a, b):
    kind = INPUTS[k][1]
    if kind == "name":
        return a == b
    if kind == "ratio":
        return abs(math.log(a / b)) <= NEAR["ratio"] + 1e-9
    return abs(a - b) <= NEAR["share"] + 1e-9


class Columns:

    def __init__(self, rows, inputs, by=None, split=()):
        self.parts = []
        for k in inputs:
            if INPUTS[k][1] == "name":
                self.parts += [(k, level, None) for level in sorted({d[k] for d in rows})[1:]]
            else:
                self.parts.append((k, None, None))
        if by in inputs:
            self.parts += [(k, None, level) for k in split if k in inputs for level in sorted({d[by] for d in rows})[1:]]
        self.by = by

    def __call__(self, rows):
        def one(d, k, level, of):
            if level is not None:
                return 1.0 if d[k] == level else 0.0
            v = math.log(d[k]) if INPUTS[k][1] == "ratio" else d[k]
            return v if of is None else v * (d[self.by] == of)
        return np.array([[one(d, *part) for part in self.parts] for d in rows])


class Nearest:

    def __init__(self, match):
        self.match = match

    def fit(self, rows):
        self.rows = rows
        self.base = np.mean([d["alive"] for d in rows])
        return self

    def prob(self, rows):
        out = []
        for d in rows:
            near = [t["alive"] for t in self.rows if all(close(k, t[k], d[k]) for k in self.match)]
            out.append(np.mean(near) if near else self.base)
        return np.array(out)


class Learned:
    def __init__(self, make, columns):
        self.make, self.columns = make, columns

    def fit(self, rows):
        self.m = self.make().fit(self.columns(rows), [d["alive"] for d in rows])
        return self

    def prob(self, rows):
        return self.m.predict_proba(self.columns(rows))[:, 1]


def logistic():
    return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))


def forest():
    return RandomForestClassifier(n_estimators=300, min_samples_leaf=3, random_state=0, n_jobs=-1)


def boosted():
    return HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=5, random_state=0)


KINDS = {"line": ("Straight-line model (logistic regression)", logistic), "forest": ("Forest of 300 decision trees", forest),
         "boosted": ("Boosted decision trees", boosted)}


def says(inputs):
    names = [INPUTS[k][0] for k in inputs]
    return ", ".join(names[:-1]) + " and " + names[-1]


def held_out(rows, build):
    p = np.zeros(len(rows))
    for day in sorted({d["day"] for d in rows}):
        train = [d for d in rows if d["day"] != day]
        idx = [i for i, d in enumerate(rows) if d["day"] == day]
        p[idx] = build().fit(train).prob([rows[i] for i in idx])
    return p


def grade(rows, p):
    y = np.array([d["alive"] for d in rows])
    return dict(auc=round(float(roc_auc_score(y, p)), 3), right=int(((p >= 0.5) == y).sum()), of=len(rows),
                brier=round(float(np.mean((p - y) ** 2)), 3))


def study(s, lines):
    loaded = s["load"]()
    rows = [d for d in loaded if all(d[k] is not None for k in s["inputs"])]
    inputs, use = s["inputs"], s["use"]
    make = KINDS[s["keep"]][1]
    y = np.array([d["alive"] for d in rows])
    days = sorted({d["day"] for d in rows})
    lines += [f"== {s['name']}: {s['about']}", f"{len(rows)} tests on {len(days)} days, {int((~y).sum())} went out on their own, {int(y.sum())} kept burning.", ""]

    always = grade(rows, np.zeros(len(rows)))
    lines.append(f"Always saying 'it goes out' is right {always['right']} of {always['of']} times.")
    scores = {"near_air": dict(name="Nearest tests, by oxygen and pressure", **grade(rows, held_out(rows, lambda: Nearest(["o2", "p"]))))}
    plus = {}
    for k in inputs:
        if k not in ("o2", "p"):
            plus[k] = dict(name=f"Nearest tests, by oxygen, pressure and {INPUTS[k][0]}", input=k, **grade(rows, held_out(rows, lambda: Nearest(["o2", "p", k]))))
    scores["near_plus"] = max(plus.values(), key=lambda v: (v["auc"], v["right"]))
    every = Columns(rows, inputs)
    for kind, (name, mk) in KINDS.items():
        scores[kind] = dict(name=f"{name}, all inputs", **grade(rows, held_out(rows, lambda: Learned(mk, every))))
    by, split = s.get("by"), s.get("split", ())
    cols = Columns(rows, use, by, split)
    described = f"{KINDS[s['keep']][0]} on {says(use)}" + (f", with its own {says(split)} slopes for each {INPUTS[by][0]}" if split else "")
    kept_p = held_out(rows, lambda: Learned(make, cols))
    scores["kept"] = dict(name=f"{described} (the one kept)", **grade(rows, kept_p))
    for v in [scores["near_air"], *plus.values(), *(scores[k] for k in KINDS), scores["kept"]]:
        lines.append(f"  {v['name']:90s} AUC {v['auc']:.2f}  right {v['right']} of {v['of']}  Brier {v['brier']:.3f}")
    lines.append("")

    weight = {}
    for k in use:
        rest = Columns(rows, [i for i in use if i != k], by, [i for i in split if i != k])
        weight[k] = round(scores["kept"]["auc"] - grade(rows, held_out(rows, lambda: Learned(make, rest)))["auc"], 3)
    lines.append("Score lost without each input (bigger means it matters more):")
    lines += [f"  {INPUTS[k][0]:26s} {v:+.2f}" for k, v in sorted(weight.items(), key=lambda kv: -kv[1])]
    lines.append("")

    model = Learned(make, cols).fit(rows)
    found = dict(key=s["key"], name=s["name"], about=s["about"], model=described, use=use, tests=len(rows), dropped=len(loaded) - len(rows),
                 days=len(days), out=int((~y).sum()), alive=int(y.sum()), always=always, scores=scores, weight=weight,
                 calls={d["id"]: round(float(q), 3) for d, q in zip(rows, kept_p)})

    if s["keep"] == "line":
        scaler, line = model.m[0], model.m[1]
        w = line.coef_[0] / scaler.scale_
        start = float(line.intercept_[0] - (line.coef_[0] * scaler.mean_ / scaler.scale_).sum())
        terms = []
        lines.append("What the model learned (how the odds of a flame surviving change):")
        for (k, level, of), wk in zip(cols.parts, w):
            kind = INPUTS[k][1]
            if kind == "share":
                step, say = 0.01, f"each extra point of {INPUTS[k][0]}"
            elif kind == "ratio":
                step, say = math.log(2), f"twice the {INPUTS[k][0]}"
            else:
                step, say = 1.0, f"{level} instead of {sorted({d[k] for d in rows})[0]}"
            if of:
                say = f"{of}: {say}, on top"
            terms.append(dict(input=k, level=level, of=of, weight=round(float(wk), 4), log=kind == "ratio", say=say, odds=round(math.exp(wk * step), 3)))
            lines.append(f"  {say:46s} times {math.exp(wk * step):.2f}")
        lines.append("  (The model is fitted with a mild penalty on large weights, so these are a little smaller than an unpenalised fit.)")
        lines.append(f"  z = {start:.2f} " + " ".join(f"{'+' if t['weight'] >= 0 else '-'} {abs(t['weight']):.3f} x {('ln ' if t['log'] else '') + t['input'] + ('=' + t['level'] if t['level'] else '') + (' if ' + t['of'] if t['of'] else '')}" for t in terms))
        lines.append("")
        found.update(start=round(start, 4), terms=terms)

    rng = np.random.default_rng(0)
    by_day = defaultdict(list)
    for d in rows:
        by_day[d["day"]].append(d)
    redo = []
    for _ in range(500 if s["keep"] == "line" else 60):
        pick = [d for day in rng.choice(days, len(days)) for d in by_day[day]]
        if len({d["alive"] for d in pick}) == 2:
            redo.append(Learned(make, cols).fit(pick))

    def estimate(groups):
        flat = [q for g in groups for q in g]
        cut = np.cumsum([0] + [len(g) for g in groups])

        def mean(m):
            v = m.prob(flat)
            return np.array([v[a:b].mean() for a, b in zip(cut[:-1], cut[1:])])
        best, spread = mean(model), np.array([mean(m) for m in redo])
        return [dict(p=round(float(best[i]), 3), lo=round(float(np.percentile(spread[:, i], 10)), 3), hi=round(float(np.percentile(spread[:, i], 90)), 3))
                for i in range(len(groups))]

    def tested(q, match):
        return sum(1 for d in rows if all(close(k, d[k], q[k]) for k in match))

    print(f"{s['name']}: scored", flush=True)
    return found, rows, estimate, tested


def counts(rows, groups, lines):
    out = []
    lines.append("What the tests show (kept burning, of tests):")
    for say, keep in groups:
        g = [d for d in rows if keep(d)]
        out.append(dict(say=say, alive=sum(d["alive"] for d in g), tests=len(g)))
        lines.append(f"  {say:58s} {out[-1]['alive']:3d} of {len(g)}")
    lines.append("")
    return out


def sweep(rows, estimate, tested, lines, x, fixed, near, match):
    groups = []
    for v in x["at"]:
        f = fixed(v) if callable(fixed) else fixed
        groups.append([dict(g, **{x["key"]: v}) for g in (f if isinstance(f, list) else [f])])
    pts = [dict(x=v, **e, tested=tested(g[0], match)) for v, g, e in zip(x["at"], groups, estimate(groups))]
    lines += [f"    {q['x']:6.3g}  {q['p'] * 100:3.0f}%  ({q['lo'] * 100:.0f} to {q['hi'] * 100:.0f}%)  {q['tested']} nearby" for q in pts[::2]]
    return pts, [dict(x=d[x["key"]], alive=d["alive"], id=d["id"]) for d in rows if near(d)]


def gas_view(rows, estimate, tested, lines):
    cabins = json.load(open(SUMMARY))["cabins"]
    x = dict(key="flow", say="Fuel flow, mg/s", log=True, lo=0.25, hi=3, ticks=[0.25, 0.5, 1, 2], at=[round(0.25 * 2 ** (i / 4), 3) for i in range(15)])
    out = []
    lines.append("Chance a gas flame keeps burning, by fuel flow (10 to 90% range from relearning):")
    for c in cabins:
        lines.append(f"  {c['name']} ({c['o2'] * 100:.1f}% oxygen, {c['p']:.2f} atm)")
        pts, near = sweep(rows, estimate, tested, lines, x, dict(o2=c["o2"], p=c["p"]),
                          lambda d: close("o2", d["o2"], c["o2"]) and close("p", d["p"], c["p"]), ["o2", "p", "flow"])
        out.append(dict(key=c["key"], short=c["short"], points=pts, tests=near))
    lines.append("")
    return dict(x={k: v for k, v in x.items() if k != "at"}, lines=out, pick="Pick a cabin air",
                note="Fuel flow stands in for the size of a leak. Kept burning means still burning when NASA shut off the fuel; a few were cut early because the burner got hot. No tests between 25 and 33% oxygen. Pressure barely changed the result in these tests.")


def droplet_view(rows, estimate, tested, lines):
    x = dict(key="d0", say="Droplet size, mm", log=True, lo=1, hi=5, ticks=[1, 2, 3, 4, 5], at=[round(1.0 * 5 ** (i / 14), 3) for i in range(15)])
    out = []
    lines.append("Chance a droplet burns to the end in station air (21% oxygen, 1 atm, nitrogen), by droplet size:")
    for fuel in ["Methanol", "Heptane"]:
        lines.append(f"  {fuel}")
        pts, near = sweep(rows, estimate, tested, lines, x, dict(o2=0.21, p=1.0, dil="N2", fuel=fuel),
                          lambda d: d["fuel"] == fuel and d["dil"] == "N2" and close("o2", d["o2"], 0.21) and close("p", d["p"], 1.0),
                          ["o2", "p", "dil", "fuel", "d0"])
        out.append(dict(key=fuel.lower(), short=fuel, points=pts, tests=near))
    lines.append("")
    return dict(x={k: v for k, v in x.items() if k != "at"}, lines=out, pick="Fuel",
                note="Droplets in station air: 21% oxygen, 1 atm, nitrogen. No methanol droplet near this air burned to the end. FLEX lit almost no droplets near habitat air, so this model can't speak for it.")


def inverse_view(rows, estimate, tested, lines):
    x = dict(key="p", say="Pressure, atm", log=True, lo=0.45, hi=3.5, ticks=[0.5, 1, 2, 3], at=[round(0.45 * (3.5 / 0.45) ** (i / 14), 3) for i in range(15)])
    out = []
    def fuel_at(v):
        gap = min(abs(math.log(d["p"] / v)) for d in rows)
        return [dict(around=d["around"]) for d in rows if close("p", d["p"], v) or abs(math.log(d["p"] / v)) <= gap + 1e-9]

    lines.append("Chance an inverse flame keeps burning, by pressure (averaged over the fuel shares NASA used near each pressure):")
    for o2, short in [(0.21, "21% oxygen jet"), (0.5, "50%"), (0.85, "85%")]:
        lines.append(f"  {short}")
        pts, near = sweep(rows, estimate, tested, lines, x, lambda v: [dict(f, o2=o2) for f in fuel_at(v)], lambda d: close("o2", d["o2"], o2), ["o2", "p"])
        out.append(dict(key=str(o2), short=short, points=pts, tests=near))
    lines.append("")
    return dict(x={k: v for k, v in x.items() if k != "at"}, lines=out, pick="Oxygen in the jet",
                note="Oxygen blown into fuel gas, as from an oxygen leak into fuel vapour. Kept burning means still burning when NASA shut off the oxygen. At low pressure the chamber also held more fuel, so these tests can't tell which of the two kept the flames alive.")


VIEWS = {"gas": gas_view, "droplet": droplet_view, "inverse": inverse_view}

COUNTS = {
    "gas": [
        ("flames under 1 mg/s in 33 to 40% oxygen kept burning", lambda d: d["o2"] > 0.3 and d["flow"] < 0.99),
        ("flames over 1 mg/s in the same air did", lambda d: d["o2"] > 0.3 and d["flow"] > 1.01),
        ("kept burning in air under 25% oxygen", lambda d: d["o2"] < 0.25),
    ],
    "droplet": [
        ("heptane droplets burned to the end", lambda d: d["fuel"] == "Heptane"),
        ("methanol droplets did", lambda d: d["fuel"] == "Methanol"),
        ("droplets in 30% oxygen or more did", lambda d: d["o2"] >= 0.28),
    ],
    "inverse": [
        ("kept burning at 0.5 atm", lambda d: d["p"] < 0.7),
        ("at 1.1 atm", lambda d: 0.9 < d["p"] < 1.3),
        ("at 2.2 atm and over", lambda d: d["p"] > 2),
    ],
}


STUDIES = [
    dict(key="gas", name="Gas flames", about="fuel gas blown into air (CFI-G normal flames)", load=gas, inputs=["o2", "p", "flow"],
         keep="line", use=["o2", "p", "flow"]),
    dict(key="droplet", name="Droplets", about="a fuel droplet burning in still air (FLEX)", load=droplets, inputs=["o2", "p", "dil", "fuel", "d0"],
         keep="line", use=["o2", "p", "dil", "fuel", "d0"], by="fuel", split=("o2", "d0")),
    dict(key="inverse", name="Inverse flames", about="oxygen blown into fuel gas (CFI-G inverse flames)", load=inverse, inputs=["o2", "p", "o2flow", "around", "fuel"],
         keep="forest", use=["o2", "p", "around"]),
]


def main():
    lines = ["Every score below comes from predicting each day with a model that never saw that day.",
             "The model kept for each study was picked after seeing these scores, so its own score is a little hopeful.", ""]
    out = {}
    for s in STUDIES:
        found, rows, estimate, tested = study(s, lines)
        found["raw"] = counts(rows, COUNTS[s["key"]], lines)
        found["view"] = VIEWS[s["key"]](rows, estimate, tested, lines)
        out[s["key"]] = found
    OUT_JSON.write_text(json.dumps(out, separators=(",", ":")))
    OUT_TXT.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
