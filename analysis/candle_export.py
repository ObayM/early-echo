import glob
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SF = Path.home() / "Projects/sound-fire"
RUN = next((SF / "data/track").glob("*-flame1"))
sys.path.insert(0, str(SF))
import lines

t, diff, amp = lines.read(RUN)
frames = sorted(glob.glob(str(RUN / "cam/*.jpg")))
glow = np.array([np.asarray(Image.open(f).convert("L"), float)[640:720, 640:860].mean() for f in frames])
lo, hi = np.percentile(glow, 10), np.percentile(glow, 90)
thr = float(sys.argv[1]) if len(sys.argv) > 1 else 173.0
lit = glow > thr
tg = np.arange(len(glow)) + 0.5
edges = np.nonzero(np.diff(lit.astype(int)))[0] + 1

sec = np.arange(int(t[0]) + 1, int(t[-1]))
mean = np.array([diff[(t >= s) & (t < s + 1)].mean(0) for s in sec])
shake = np.array([diff[(t >= s) & (t < s + 1)].std(0) for s in sec])
state = np.array([lit[min(int(s), len(lit) - 1)] for s in sec])
near = np.array([np.min(np.abs(tg[edges] - s - 0.5)) < 5 for s in sec])
blocked = shake.max(1) >= 3
clean = ~near & ~blocked

stats = {}
for ch in range(2):
    a, b = mean[clean & state, ch], mean[clean & ~state, ch]
    cut = (a.mean() + b.mean()) / 2
    stats[f"mic{ch}"] = dict(lit_us=round(float(a.mean()), 2), lit_sd=round(float(a.std()), 2), lit_n=int(len(a)),
                             out_us=round(float(b.mean()), 2), out_sd=round(float(b.std()), 2), out_n=int(len(b)),
                             shift_us=round(float(b.mean() - a.mean()), 2), threshold_us=round(float(cut), 2),
                             right=int(((mean[clean, ch] < cut) == state[clean]).sum()), clean_seconds=int(clean.sum()),
                             shake_lit_us=round(float(shake[clean & state, ch].mean()), 2), shake_out_us=round(float(shake[clean & ~state, ch].mean()), 2))
segs = np.split(np.arange(len(sec)), np.nonzero(np.diff(state.astype(int)))[0] + 1)
periods = [dict(state="lit" if state[s[0]] else "out", start=int(sec[s[0]]), end=int(sec[s[-1]]) + 1,
                mic1_us=round(float(mean[s][clean[s], 1].mean()), 2) if clean[s].any() else None) for s in segs]

out = dict(
    recording="flame1", seconds=int(sec[-1]) + 1, glow_threshold=round(thr, 1),
    setup="Soundbar on a book stack about 0.9 m from the laptop. Candle under the middle of the sound line, flame tip 10 to 15 cm below it. Only the flame changed.",
    truth="A webcam frame every second. The flame counts as lit when the patch of the frame around it is bright.",
    t=[int(s) for s in sec], lit=[bool(x) for x in state], clean=[bool(x) for x in clean], blocked=[bool(x) for x in blocked],
    mic1_us=[round(float(v), 2) for v in mean[:, 1]], mic0_us=[round(float(v), 2) for v in mean[:, 0]],
    mic1_shake_us=[round(float(v), 2) for v in shake[:, 1]], mic0_shake_us=[round(float(v), 2) for v in shake[:, 0]],
    changes=[int(tg[e]) for e in edges], starts="lit" if lit[0] else "out", periods=periods, stats=stats)
dst = Path(__file__).resolve().parent.parent / "public/data/candle.json"
dst.write_text(json.dumps(out, separators=(",", ":")))
print("glow 10th/90th pct", round(lo, 1), round(hi, 1), "threshold", round(thr, 1), "| changes at", out["changes"], "starts", out["starts"])
for k, v in stats.items():
    print(k, v)
print("periods", [(p["state"], p["start"], p["end"], p["mic1_us"]) for p in periods])
