import csv
import json
import re
import statistics as st
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLES = ROOT / "data/tables"
OUT = ROOT / "public/data"

OUTCOMES = {
    "out": "Went out on its own",
    "burned": "Burned all its fuel",
    "stopped": "Still burning when the fuel was cut",
    "broke": "Droplet broke up",
    "noign": "Did not ignite",
}
ALIVE = ("burned", "stopped")


def rows(name):
    with open(TABLES / name, newline="", encoding="utf-8-sig", errors="replace") as fh:
        rs = [[c.strip().replace("�", "") for c in r] for r in csv.reader(fh)]
    rs = [r for r in rs if any(r)]
    hdr = rs[0]
    return hdr, [dict(zip(hdr, r + [""] * (len(hdr) - len(r)))) for r in rs[1:]]


def num(x):
    m = re.search(r"-?\d+(?:\.\d+)?", str(x).replace(",", ""))
    return float(m.group()) if m else None


def col(r, start):
    for k, v in r.items():
        if k.lower().startswith(start.lower()):
            return v
    raise KeyError(start)


def iso(s, fmts):
    for f in fmts:
        try:
            d = datetime.strptime(s.strip(), f)
            return d.strftime("%Y-%m-%d") if 1990 < d.year < 2027 else None
        except ValueError:
            pass
    return None


def yyddd(s):
    m = re.match(r"(\d{2})(\d{3})", s.replace(" ", ""))
    if not m:
        return None
    try:
        return datetime.strptime(f"20{m.group(1)}{m.group(2)}", "%Y%j").strftime("%Y-%m-%d")
    except ValueError:
        return None


def clock(s):
    p = re.split(r"[:.]", s.strip())
    return int(p[0]) * 3600 + int(p[1]) * 60 + int(p[2]) if len(p) == 3 and all(x.isdigit() for x in p) else None


def test(exp, label, kind, raw, **kw):
    t = dict(exp=exp, label=str(label), kind=kind, date=None, fuel=None, o2=None, p=None, dil=None, flow=None,
             burn_s=None, end=None, flames=None, note=None, raw={k: v for k, v in raw.items() if v})
    t.update(kw)
    return t


def flex():
    out = []
    for r in rows("PSI-69_Experimental table_FLEX.csv")[1]:
        g = {k.split(";")[0].strip(): v for k, v in r.items()}
        d0, de = num(g["Droplet initial diameter"]), num(g["Visible flame extinction diameter"])
        o2, co2, he = num(g["O initial ambient composition"]), num(g["CO initial ambient composition"]) or 0, num(g["He initial ambient composition"]) or 0
        p = num(g["Ambient pressure"])
        end = {"Extinction": "out", "Completion": "burned", "Disruption": "broke"}[g["Test end"]]
        burned = 1 - (de / d0) ** 3 if d0 and de is not None and de <= d0 else 1.0 if end == "burned" else None
        out.append(test("FLEX", g["FLEX Identifier"], "Droplet", r, date=iso(g["Test Date"], ["%m/%d/%Y", "%m/%d/%y"]),
                        fuel=g["Fuel"], o2=o2, p=round(p / 760, 3) if p else None, dil="CO2" if co2 > 0 else "He" if he > 0 else "N2",
                        burn_s=num(g["Burn time"]), end=end, d0=d0, burned=round(burned, 3) if burned is not None else None))
    return out


def cfi():
    out = []
    for r in rows("PSI-39_Experimental table_CFI.csv")[1]:
        fuel = "n-Dodecane" if r["Fuel"] == "C12H26" else "n-Dodecane / iso-octane mix" if "iso" in r["Fuel"] else r["Fuel"]
        out.append(test("CFI", r["CIR"], "Droplet", r, date=iso(r["Test Date"], ["%d-%b-%y"]), fuel=fuel, o2=num(r["Oxygen"]),
                        p=num(r["Pressure"]), dil="He" if (num(r["Helium"]) or 0) > 0 else "N2"))
    return out


def cfig():
    out = []
    for name, inverse in (("PSI-159_Experimental table_CFI-G_Normal Flames.csv", False), ("PSI-159_Experimental table_CFI-G_Inverse Flames.csv", True)):
        for r in rows(name)[1]:
            how = col(r, "Self")
            ign = r["Hot ignition"].lower()
            end = {"SE": "out", "FT": "stopped"}.get(how, "noign")
            bar = num(r["approx p (bar)"])
            fuel = r["Fuel"].replace("%", "% ").replace("  ", " ").strip()
            fuel = fuel[0].upper() + fuel[1:] if not fuel[0].isdigit() else fuel + " in nitrogen"
            t = test("CFI-G", r["Test"].replace(" ", ""), "Gas flame", r, date=yyddd(r["Test"]), fuel=fuel,
                     p=round(bar / 1.01325, 3) if bar else None, dil="N2", burn_s=num(r["burn time (sec)"]), end=end,
                     note="Inverse flame: oxygen is fed into fuel gas, so the oxygen figure is the feed, not the air around it" if inverse else None)
            if inverse:
                t["feed_o2"] = num(r["XO2"])
            else:
                t["o2"] = round(num(r["XO2 before test"]), 4)
            if ign == "flash":
                t["note"] = (t["note"] + ". " if t["note"] else "") + "Flashed at ignition"
            out.append(t)
    return out


def flame_design():
    out = []
    for r in rows("PSI-10_Experimental table_Flame Design_Normal Flame.csv")[1]:
        out.append(test("Flame Design", r["Test"], "Gas flame", r, date=yyddd(r["Test"]), fuel={"C2H4": "Ethylene", "C3H8": "Propane"}[r["Fuel"]],
                        o2=round(num(r["XO2 (init)"]), 4), p=round(num(r["pinit (atm)"]), 3), dil="N2"))
    for r in rows("PSI-10_Experimental table_Flame Design_Inverse Flame.csv")[1]:
        out.append(test("Flame Design", r["Test"], "Gas flame", r, date=yyddd(r["Test"]), fuel="Ethylene", p=round(num(r["pinit (atm)"]), 3), dil="N2",
                        feed_o2=num(r["XO2"]) if num(r["XO2"]) is not None and r["XO2"][0].isdigit() else None,
                        note="Inverse flame: oxygen is fed into fuel gas, so the oxygen figure is the feed, not the air around it"))
    return out


def solid_fuel(s):
    s = s.lower()
    for key, name in (("sibal", "Cotton-fiberglass fabric (SIBAL)"), ("nomex", "Nomex fabric"), ("ultem", "Ultem sheet"), ("candle", "Wax candle"),
                      ("wax", "Wax"), ("pmma", "Acrylic (PMMA)"), ("sphere", "Acrylic (PMMA)"), ("rod", "Acrylic (PMMA)"), ("film", "Acrylic (PMMA)"),
                      ("spherical", "Acrylic (PMMA)"), ("silicone", "Silicone"), ("soot", None)):
        if key in s:
            return name
    return s.strip().capitalize() or None


def bass():
    out = []
    for r in rows("PSI-26_Experimental table_BASS.csv")[1]:
        fuel = solid_fuel(r["Fuel Sample Material"])
        if fuel is None:
            continue
        out.append(test("BASS", r["Test #"] or r["As Run Test #"] or "?", "Solid", r, date=iso(r["Date"], ["%m/%d/%Y"]), fuel=fuel))
    for r in rows("PSI-25_Experimental table_BASS-II.csv")[1]:
        o2 = num(col(r, "Calibrated  initial O2"))
        co0, co1 = num(r["Initial CO (ppm)"]), num(r["Final CO (ppm)"])
        t = test("BASS-II", r["Test #"], "Solid", r, date=iso(r["Date"], ["%m/%d/%Y"]), fuel=solid_fuel(r["Fuel Sample Material"]),
                 o2=round(o2 / 100, 4) if o2 else None, dil="N2")
        if co0 is not None and co1 is not None and r["Final CO (ppm)"].lower() != "none":
            t["co_rise_ppm"] = round(co1 - max(co0, 0), 1)
        out.append(t)
    return out


def saffire():
    out = []
    for r in rows("PSI-98_Experimental table_SAFFIRE-1.csv")[1]:
        if not r["Burn Time (s)"]:
            continue
        out.append(test("Saffire-I", r["Sample Number"], "Solid", r, fuel=solid_fuel(r["Material"]), o2=round(num(r["Percent O2"]) / 100, 4),
                        flow=num(r["Air Flow (cm/s)"]), burn_s=num(r["Burn Time (s)"]),
                        note=f"{r['Flow Direction']} air flow. A 94 by 40.6 cm sheet, the largest fire lit on purpose in space at the time. NASA's row doesn't say how it ended"))
    material = None
    for r in rows("PSI-99_Experimental table_SAFFIRE-2.csv")[1]:
        if not r["Flow Direction"]:
            continue
        material = r["Material"] or material
        length = r["?-g Burn Length"]
        end = "noign" if length.startswith("~ 0") else "burned" if length.startswith("29") else None
        out.append(test("Saffire-II", r["Sample Number"], "Solid", r, fuel=solid_fuel(material) if "&" not in material else "Acrylic (PMMA) and Nomex",
                        o2=round(num(r["Percent O2 (Note 1)"]) / 100, 4), flow=num(r["Air Flow (cm/s)"]), burn_s=num(r["Burn Time (s)"]), end=end,
                        note=f"{r['Flow Direction']} air flow. Burned length in space: {length}"))
    for r in rows("PSI-100_Experimental table_SAFFIRE-3.csv")[1]:
        out.append(test("Saffire-III", r["Sample Number"], "Solid", r, fuel=solid_fuel(r["Material"]), flow=num(r["Air Flow"]),
                        note=f"{r['Direction']} air flow. A repeat of Saffire-I at a faster air flow"))
    return out


def smoke():
    out = []
    for r in rows("PSI-101_Experimental table_SAME-R.csv")[1]:
        out.append(test("SAME-R", r["SAME Test #"], "Smoke", r, fuel=r["Sample Type"], flow=num(r["Inlet velocity (cm/s)"]), burn_s=num(r["Duration (sec)"]),
                        note=r["Description"]))
    last = None
    for r in rows("PSI-102_Experimental table_SAME.csv")[1]:
        last = r if r["Air Flow (cm/s)"] else last
        out.append(test("SAME", r["Sample #"], "Smoke", r, fuel=r["Sample Material"].split(":")[0], flow=num(last["Air Flow (cm/s)"]) if last else None))
    for r in rows("PSI-47_Experimental table_DAFT.csv")[1]:
        out.append(test("DAFT", r["Session Name"], "Smoke", r, fuel=r["Sample Material"], note="Dust test of the smoke instruments, no fire"))
    return out


def spice():
    out, seen = [], set()
    for i, r in enumerate(rows("PSI-107_Experimental table_Spice.csv")[1]):
        key = tuple(r.values())
        if key in seen:
            continue
        seen.add(key)
        a, b = clock(r["GMT ignition"]), clock(r["GMT  Flame Off"])
        burn = b - a if a is not None and b is not None and 0 < b - a < 3600 else None
        fuel = re.sub(r"(\d+)\s*%\s*", r"\1% ", r["Fuel"])
        fuel = fuel + " in nitrogen" if fuel[0].isdigit() else fuel
        out.append(test("SPICE", f"day {r['GMT date']} {r['GMT ignition']} #{i + 1}", "Gas flame", r, fuel=fuel, flow=num(r["Air Rate (cm/s)"]), burn_s=burn,
                        note="One row is one flame setting inside a burn, so several rows can share an ignition time"))
    return out


def days():
    out = []
    months = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}

    def ymd(y, m, d):
        try:
            mi = int(m) if str(m).isdigit() else months[str(m).lower()[:3]]
            return f"{int(y):04d}-{mi:02d}-{int(d):02d}"
        except (ValueError, KeyError):
            return None

    for r in rows("PSI-20_Experimental table_ACME BRE.csv")[1]:
        o2 = [num(x) for x in r["Oxygen Conc (percent)"].split(";")]
        out.append(test("ACME BRE", ymd(r["Year"], r["Month"], r["Date"]), "Gas flame", r, date=ymd(r["Year"], r["Month"], r["Date"]),
                        fuel="Ethylene" if "C2H4" in r["Fuel Bottle"] else "Methane", flames=int(num(r["Flames Ignited"])),
                        note="Oxygen levels tried that day: " + ", ".join(f"{x:g}%" for x in o2 if x)))
    for r in rows("PSI-21_Experimental table_CLD Flame.csv")[1]:
        out.append(test("ACME CLD Flame", r["Test Day"], "Gas flame", r, date=yyddd(r["Test Day"]), fuel="Methane" if "Methane" in r["Test Type"] or "CH" in r["Fuel Bottle"] else "Ethylene",
                        flames=int(num(r["Flames ignited"]))))
    last = {}
    for r in rows("PSI-22_Experimental table_ACME E-FIELD Flames.csv")[1]:
        if not r["Test Day"]:
            continue
        last = r
        out.append(test("ACME E-FIELD", r["Test Day"], "Gas flame", r, date=yyddd(r["Test Day"]), fuel="Methane" if "CH4" in r["Fuel Bottle"] else "Ethylene",
                        flames=int(num(r["Flames Ignited"])), note=f"Flames in an electric field, {r['Mesh Polarity']} mesh"))
    for r in rows("PSI-23_Experimental table_ACME s-Flame.csv")[1]:
        b = r["Fuel Bottle"]
        out.append(test("ACME s-Flame", col(r, "Test Day"), "Gas flame", r, date=yyddd(col(r, "Test Day")),
                        fuel="Hydrogen" if b.startswith("100% H2") else "Hydrogen and methane" if "H2" in b else "Methane" if "CH4" in b else "Ethylene",
                        flames=int(num(col(r, "Flames Ignited"))), note="Air that day: " + col(r, "Atmosphere").replace("N3", "N2").replace("N4", "N2")))
    for r in rows("PSI-106_Experimental table_Slice.csv")[1]:
        d = iso(r["Test Date"][:11], ["%Y-%b-%d"])
        out.append(test("SLICE", d or r["Test Date"][:11], "Gas flame", r, date=d, fuel="Methane" if "CH4" in r["Fuel Type"] else "Ethylene"))
    return out


EXPERIMENTS = [
    ("FLEX", "PSI-69", "Flame Extinguishment Experiment", "one droplet burn", "Single fuel droplets a few millimetres across, lit in a sealed chamber with chosen air", flex),
    ("CFI", "PSI-39", "Cool Flames Investigation", "one droplet burn", "Fuel droplets that keep reacting as a faint cool flame after the visible flame dies", cfi),
    ("CFI-G", "PSI-159", "Cool Flames Investigation with Gases", "one gas flame", "Ball-shaped gas flames on a porous burner", cfig),
    ("Flame Design", "PSI-10", "Flame Design", "one gas flame", "Ball-shaped gas flames, used to study soot and when flames go out", flame_design),
    ("BASS", "PSI-26", "Burning and Suppression of Solids", "one sample burn", "Small solid samples (acrylic, fabric, wax) in a small wind tunnel", lambda: [t for t in bass() if t["exp"] == "BASS"]),
    ("BASS-II", "PSI-25", "Burning and Suppression of Solids II", "one sample burn", "Small solid samples at chosen oxygen levels, with the gases measured before and after", lambda: [t for t in bass() if t["exp"] == "BASS-II"]),
    ("Saffire-I", "PSI-98", "Spacecraft Fire Safety Experiment I", "one large sample", "A sheet of fabric about a metre long, burned inside an empty cargo ship after it left the station", lambda: [t for t in saffire() if t["exp"] == "Saffire-I"]),
    ("Saffire-II", "PSI-99", "Spacecraft Fire Safety Experiment II", "one sample", "Nine smaller samples of real spacecraft materials", lambda: [t for t in saffire() if t["exp"] == "Saffire-II"]),
    ("Saffire-III", "PSI-100", "Spacecraft Fire Safety Experiment III", "one large sample", "The large fabric sheet again, at a faster air flow", lambda: [t for t in saffire() if t["exp"] == "Saffire-III"]),
    ("SPICE", "PSI-107", "Smoke Point in Coflow Experiment", "one flame setting", "Gas jet flames, to find when a flame starts to give off soot", spice),
    ("SAME-R", "PSI-101", "Smoke Aerosol Measurement Experiment, reflight", "one smoke test", "Overheated spacecraft materials, to measure the smoke particles detectors must catch", lambda: [t for t in smoke() if t["exp"] == "SAME-R"]),
    ("SAME", "PSI-102", "Smoke Aerosol Measurement Experiment", "one sample", "Overheated spacecraft materials, to measure the smoke particles detectors must catch", lambda: [t for t in smoke() if t["exp"] == "SAME"]),
    ("DAFT", "PSI-47", "Dust and Aerosol Measurement Feasibility Test", "one session", "A dust test of the smoke instruments", lambda: [t for t in smoke() if t["exp"] == "DAFT"]),
    ("ACME BRE", "PSI-20", "Burning Rate Emulator", "one test day", "A gas burner that imitates a burning solid or liquid", lambda: [t for t in days() if t["exp"] == "ACME BRE"]),
    ("ACME CLD Flame", "PSI-21", "Coflow Laminar Diffusion Flame", "one test day", "Gas jet flames in a stream of air", lambda: [t for t in days() if t["exp"] == "ACME CLD Flame"]),
    ("ACME E-FIELD", "PSI-22", "Electric-Field Effects on Laminar Diffusion Flames", "one test day", "Gas flames inside an electric field", lambda: [t for t in days() if t["exp"] == "ACME E-FIELD"]),
    ("ACME s-Flame", "PSI-23", "Structure and Response of Spherical Diffusion Flames", "one test day", "Ball-shaped gas flames", lambda: [t for t in days() if t["exp"] == "ACME s-Flame"]),
    ("SLICE", "PSI-106", "Structure and Liftoff in Combustion Experiment", "one test day", "Small gas jet flames, to see when a flame lifts off its burner", lambda: [t for t in days() if t["exp"] == "SLICE"]),
]
NOT_TESTS = [
    ("FLEX-2", "PSI-68", "The table lists the planned fuels and ranges, not the burns that were run"),
    ("PSI-142", "PSI-142", "The table is a list of figures in published papers"),
]

CABINS = [
    dict(key="station", name="Space station", short="Station", o2=0.21, p=1.0, psi=14.7, source="Sea-level air, which the station keeps"),
    dict(key="prep", name="Before a spacewalk (Shuttle)", short="Spacewalk prep", o2=0.265, p=round(10.2 / 14.696, 3), psi=10.2, source="NASA/TP-2010-216134"),
    dict(key="habitat", name="Moon and Mars habitats (planned)", short="Moon and Mars", o2=0.34, p=round(8.2 / 14.696, 3), psi=8.2,
         source="NASA's exploration atmosphere, 8.2 psi and 34% oxygen (NASA/TP-2010-216134, revised 2012)",
         url="https://www.nasa.gov/wp-content/uploads/2023/03/henninger-8.2-34-atm-tp216134-2010.pdf"),
]


def pbin(p):
    return "0.5 atm" if p < 0.6 else "0.7 atm" if p < 0.85 else "1 atm" if p < 1.5 else "2 to 3 atm"


def obin(o):
    return "under 15%" if o < 0.15 else "15 to 18%" if o < 0.18 else "18 to 21%" if o <= 0.215 else "22 to 29%" if o < 0.30 else "30 to 40%" if o <= 0.40 else "over 40%"


def tally(g):
    c = Counter(t["end"] for t in g)
    return dict(tests=len(g) - c["noign"], out=c["out"], alive=c["burned"] + c["stopped"], broke=c["broke"], noign=c["noign"])


def build():
    meta = {m["psi"]: m for m in json.load(open(ROOT / "data/experiments-meta.json"))}
    tests, exps = [], []
    for key, psi, name, unit, what, parse in EXPERIMENTS:
        ts = parse()
        for i, t in enumerate(ts):
            t["id"] = f"{key}:{i + 1}"
        m = meta[psi]
        years = sorted({t["date"][:4] for t in ts if t["date"]})
        exps.append(dict(key=key, psi=psi, name=name, unit=unit, what=what, rows=len(ts), flames=sum(t["flames"] or 0 for t in ts) or None,
                         kind=ts[0]["kind"], years=[years[0], years[-1]] if years else None, with_outcome=sum(t["end"] is not None for t in ts),
                         doi=m["doi"], url=f"https://doi.org/{m['doi']}", title=m["title"], objective=m["objective"], hardware=m["hardware"],
                         publications=m["publications"], license=m["license"]))
        tests += ts

    groups = defaultdict(list)
    for t in tests:
        if t["end"] and t["o2"] and t["p"]:
            groups[(t["exp"], t["fuel"], t["dil"], pbin(t["p"]), obin(t["o2"]))].append(t)
    ranking = []
    for (exp, fuel, dil, p, o), g in groups.items():
        if sum(t["end"] in ("out", "burned", "stopped") for t in g) < 5:
            continue
        b = [t["burned"] for t in g if t.get("burned") is not None]
        ranking.append(dict(exp=exp, fuel=fuel, dil=dil, pressure=p, oxygen=o, **tally(g), ids=[t["id"] for t in g],
                            median_burn_s=round(st.median([t["burn_s"] for t in g if t["burn_s"] is not None]), 1) if any(t["burn_s"] is not None for t in g) else None,
                            median_fuel_burned=round(st.median(b), 2) if b else None))
    ranking.sort(key=lambda r: (r["out"] / (r["out"] + r["alive"]), -(r["out"] + r["alive"])))

    fx = [t for t in tests if t["exp"] == "FLEX" and t["dil"] == "N2"]
    station = [t for t in fx if pbin(t["p"]) == "1 atm" and 0.18 <= t["o2"] <= 0.215]
    habitat = [t for t in fx if pbin(t["p"]) == "0.7 atm" and t["o2"] >= 0.30]
    finding = dict(
        station=dict(label="Station-like air", detail="1 atm, 18 to 21% oxygen, nitrogen", **tally(station), ids=[t["id"] for t in station],
                     d0=round(st.median(t["d0"] for t in station if t["d0"]), 1)),
        habitat=dict(label="Nearest tests to habitat air", detail="0.7 atm, 30 to 34% oxygen, nitrogen", **tally(habitat), ids=[t["id"] for t in habitat],
                     d0=round(st.median(t["d0"] for t in habitat if t["d0"]), 1),
                     o2_range=[min(t["o2"] for t in habitat), max(t["o2"] for t in habitat)], p_range=[min(t["p"] for t in habitat), max(t["p"] for t in habitat)]),
        caveats=[
            "In the habitat-like group most burns ended because the droplet broke up, so they don't show what the flame would have done to the end.",
            "The habitat-like droplets were a little bigger.",
            "NASA's planned habitat air is 8.2 psi (0.56 atm). The nearest FLEX tests ran at 0.7 atm, so this is the closest data, not the exact air.",
            "These are droplets a few millimetres across. They say how the air treats a flame, not how a cabin fire would grow.",
            "\"Went out\" means the flame you can see went out. NASA found that some large droplets kept burning afterwards as a faint cool flame, which this table doesn't record.",
        ])

    totals = dict(rows=len(tests), experiments=len(exps), single_tests=sum(1 for t in tests if t["flames"] is None),
                  day_rows=sum(1 for t in tests if t["flames"] is not None), flames_by_day=sum(t["flames"] or 0 for t in tests),
                  with_outcome=sum(t["end"] is not None for t in tests), with_air=sum(t["o2"] is not None and t["p"] is not None for t in tests),
                  outcomes={k: sum(t["end"] == k for t in tests) for k in OUTCOMES},
                  flex=tally([t for t in tests if t["exp"] == "FLEX"]))

    assert totals["single_tests"] + totals["day_rows"] == totals["rows"]
    assert sum(e["rows"] for e in exps) == totals["rows"]
    assert sum(totals["outcomes"].values()) == totals["with_outcome"]
    for r in ranking + [finding["station"], finding["habitat"]]:
        assert r["out"] + r["alive"] + r["broke"] == r["tests"] == len(r["ids"]) - r["noign"], r
    assert totals["flex"] == dict(tests=274, out=186, alive=27, broke=61, noign=0), totals["flex"]
    assert (finding["station"]["tests"], finding["station"]["out"]) == (36, 20) and (finding["habitat"]["tests"], finding["habitat"]["out"]) == (17, 0)
    assert len({t["id"] for t in tests}) == len(tests)

    OUT.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    dump("tests.json", tests)
    dump("summary.json", dict(outcomes=OUTCOMES, experiments=exps, not_tests=NOT_TESTS, cabins=CABINS,
                              totals=totals, ranking=ranking, finding=finding))
    return tests, exps, totals, ranking, finding


if __name__ == "__main__":
    tests, exps, totals, ranking, finding = build()
    print(f"{totals['rows']} rows from {totals['experiments']} experiments: {totals['single_tests']} single tests, {totals['day_rows']} test days covering {totals['flames_by_day']} flames")
    print(f"with an outcome {totals['with_outcome']} {totals['outcomes']} | with oxygen and pressure {totals['with_air']}")
    for e in exps:
        print(f"  {e['key']:15s}{e['psi']:8s}{e['rows']:5d} rows  outcome {e['with_outcome']:4d}  {e['unit']:18s}{e['years']}")
    for k in ("station", "habitat"):
        f = finding[k]
        print(f"{f['label']} ({f['detail']}): {f['tests']} tests, out {f['out']}, still burning {f['alive']}, broke up {f['broke']}, median droplet {f['d0']} mm")
    print(f"ranking: {len(ranking)} groups of 5 or more flames with a clear ending")
    for r in ranking:
        print(f"  {r['exp']:6s}{r['fuel'][:22]:23s}{r['dil']:4s}{r['pressure']:11s}{r['oxygen']:10s} n={r['tests']:3d} out {r['out']:3d} alive {r['alive']:3d} broke {r['broke']:3d} no ign {r['noign']:3d}")
