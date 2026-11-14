#!/usr/bin/env python3
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time
import numpy as np

READER_VERSION = "read-1.0"
FROZEN_AT = "2026-11-13 18:43 UTC"

FPS = 10
AW, AH = 320, 240
LIGHT_SPLIT = 0.35
MIN_LIGHT_CONTRAST = 12
MIN_DARK_RUN_S = 4
DARK_SETTLE_S = 2
BRIGHT_LEVEL = 200
IGNITE_FRAC = 0.02
IGNITER_BRIDGE_S = 15
IGNITER_LIT_FRAC = 0.3
FLASH_GAP_S = 3
FLAME_AFTER_FLASH_S = 0
K_SIGMA = 4.0
K_BLUE = 2.0
MIN_NEIGHBOURS = 3
MIN_FLAME_PX = 70
ZONE_FRAC = 0.45
CENTRE_SECS = 15
TAIL_MIN_R = 6
TAIL_MARGIN = 4
TAIL_BASE_START = 8
TAIL_K = 4.0
TAIL_MIN_STD = 0.05
GAP_S = 2
WINDOW_S = 10
FINE_FPS = 30
FINE_BEFORE_S = 15
FINE_AFTER_S = 6
FINE_K = 5.0
SUDDEN_RATIO = 0.35
SHEET_STEP_S = 3
SHEET_COLS = 10
SHEET_TILE_W = 160
SHEET_MAX_TILES = 120
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf",
         "/usr/share/fonts/dejavu/DejaVuSans.ttf"]
BURNER_PX = None


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def probe(ff, path):
    r = subprocess.run([ff, "-hide_banner", "-i", path], capture_output=True, text=True, errors="replace")
    err = r.stderr
    dur = None
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Video: .*?(\d{2,5})x(\d{2,5})", err)
    if not m:
        tail = err.strip().splitlines()[-1][:200] if err.strip() else "no output"
        raise RuntimeError("no video stream: " + tail)
    return dur, int(m.group(1)), int(m.group(2))


def frames(ff, path, vf, w, h, ss=None, t=None):
    cmd = [ff, "-v", "error", "-threads", "2"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.2f}"]
    if t is not None:
        cmd += ["-t", f"{t:.2f}"]
    cmd += ["-i", path, "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", vf,
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-threads", "2", "-"]
    fsize = w * h * 3
    with tempfile.TemporaryFile() as errf:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errf, bufsize=fsize * 4)
        n = 0
        while True:
            buf = p.stdout.read(fsize)
            if len(buf) < fsize:
                break
            n += 1
            yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        p.stdout.close()
        p.wait()
        if n == 0:
            errf.seek(0)
            raise RuntimeError("ffmpeg gave no frames: " + errf.read().decode(errors="replace").strip()[-300:])


def decode(ff, path):
    luma, bright = [], []
    sec_B, sec_E = [], []
    accB = np.zeros((AH, AW), np.float32)
    accE = np.zeros((AH, AW), np.float32)
    n = 0
    vf = f"fps={FPS},scale={AW}:{AH}:flags=area"
    for f in frames(ff, path, vf, AW, AH):
        r = f[:, :, 0].astype(np.int16)
        g = f[:, :, 1].astype(np.int16)
        b = f[:, :, 2].astype(np.int16)
        rg = np.maximum(r, g)
        mx = np.maximum(rg, b)
        luma.append(0.299 * float(r.mean()) + 0.587 * float(g.mean()) + 0.114 * float(b.mean()))
        bright.append(float(np.count_nonzero(mx > BRIGHT_LEVEL)) / (AW * AH))
        accB += b
        accE += b - rg
        n += 1
        if n == FPS:
            sec_B.append((accB / n).astype(np.float16))
            sec_E.append((accE / n).astype(np.float16))
            accB[:] = 0
            accE[:] = 0
            n = 0
    if n:
        sec_B.append((accB / n).astype(np.float16))
        sec_E.append((accE / n).astype(np.float16))
    return np.array(luma), np.array(bright), sec_B, sec_E


def runs(mask):
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask)))
    return out


def neighbours(m):
    p = np.pad(m.astype(np.uint8), 1)
    s = np.zeros(m.shape, np.uint8)
    h, w = m.shape
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            if dy != 1 or dx != 1:
                s += p[dy:dy + h, dx:dx + w]
    return s


def mad_sigma(x):
    x = np.asarray(x, np.float32).ravel()
    return 1.4826 * float(np.median(np.abs(x - np.median(x))))


def f32(a):
    return a.astype(np.float32)


def find_tests(luma_f, bright_f, nsec):
    luma_s = np.array([luma_f[s * FPS:(s + 1) * FPS].mean() for s in range(nsec)])
    bright_s = np.array([bright_f[s * FPS:(s + 1) * FPS].max() for s in range(nsec)])
    lo, hi = np.percentile(luma_s, 5), np.percentile(luma_s, 95)
    if hi - lo < MIN_LIGHT_CONTRAST:
        dark = np.full(nsec, hi < 60)
    else:
        dark = luma_s < lo + LIGHT_SPLIT * (hi - lo)
    bridged = dark.copy()
    for a, b in runs(~dark):
        if a == 0 or b == nsec:
            continue
        if b - a <= FLASH_GAP_S or (b - a <= IGNITER_BRIDGE_S and bright_s[a:b].max() > IGNITER_LIT_FRAC):
            bridged[a:b] = True
    dark_runs = [r for r in runs(bridged) if r[1] - r[0] >= MIN_DARK_RUN_S]
    cands = []
    for a, b in dark_runs:
        a1 = (a + 1) * FPS
        seg = bright_f[a1:b * FPS]
        on = seg > max(IGNITE_FRAC, np.median(seg) + IGNITE_FRAC)
        prev_end = -10 ** 9
        for r0, r1 in runs(on):
            if r0 - prev_end > FLASH_GAP_S * FPS:
                cands.append((a, b, (a1 + r0) / FPS, (a1 + r1) / FPS))
            prev_end = r1
    return luma_s, bright_s, dark, dark_runs, cands


def measure(a, b, f0, f1, sec_B, sec_E, bright_s, src_w):
    nsec = len(sec_B)
    quiet = lambda s: bright_s[s] < IGNITE_FRAC
    pre = [s for s in range(a + DARK_SETTLE_S, int(f0)) if quiet(s)] or [s for s in range(a, int(f0)) if quiet(s)]
    if not pre:
        return None
    pre = pre[-8:]
    dB = np.mean([f32(sec_B[s]) for s in pre], axis=0)
    dE = np.mean([f32(sec_E[s]) for s in pre], axis=0)
    if len(pre) >= 2:
        noise = mad_sigma((f32(sec_B[pre[-1]]) - f32(sec_B[pre[-2]])) / np.sqrt(2))
    else:
        noise = 0.0
    noise = max(noise, 0.15)
    if len(pre) >= 2:
        noiseE = mad_sigma((f32(sec_E[pre[-1]]) - f32(sec_E[pre[-2]])) / np.sqrt(2))
    else:
        noiseE = 0.0
    noiseE = max(noiseE, 0.15)

    start = int(np.ceil(f1 + FLAME_AFTER_FLASH_S))
    stop = min(b, nsec)
    yy, xx = np.mgrid[0:AH, 0:AW]
    raw = []
    for s in range(start, stop):
        DB = f32(sec_B[s]) - dB
        off = float(np.median(DB))
        sig = max(noise, mad_sigma(DB))
        DB -= off
        DE = f32(sec_E[s]) - dE
        DE -= float(np.median(DE))
        m = (DB > K_SIGMA * sig) & (DE > K_BLUE * max(noiseE, mad_sigma(DE)))
        m &= neighbours(m) >= MIN_NEIGHBOURS
        raw.append((s, m, DB, off, sig))
    if not raw:
        return {"flame_secs": 0, "ignition_s": round(f0, 1)}, {}, None

    tot = np.zeros((AH, AW), np.float32)
    for s, m, DB, _, _ in raw[:CENTRE_SECS]:
        tot += m * np.clip(DB, 0, None)
    if tot.sum() > 0:
        cx = float((tot * xx).sum() / tot.sum())
        cy = float((tot * yy).sum() / tot.sum())
    else:
        cx, cy = AW / 2, AH / 2
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    zone = dist <= ZONE_FRAC * AH
    rbin = np.minimum(dist.astype(int), int(ZONE_FRAC * AH))
    nb = np.bincount(rbin.ravel())
    k = src_w / AW

    t, px, edge, half, bri, blue, off_l, sig_l = [], [], [], [], [], [], [], []
    for s, m, DB, off, sig in raw:
        m = m & zone
        npx = int(m.sum())
        t.append(s)
        px.append(npx)
        off_l.append(off)
        sig_l.append(sig)
        if npx >= MIN_FLAME_PX:
            edge.append(float(np.percentile(dist[m], 90)) * k)
            prof = np.bincount(rbin.ravel(), weights=np.where(zone, DB, 0).ravel()) / np.maximum(nb, 1)
            prof = np.convolve(prof, np.ones(3) / 3, mode="same")
            rp = int(np.argmax(prof))
            hm = prof[rp] / 2
            j = rp
            while j + 1 < len(prof) and prof[j + 1] > hm:
                j += 1
            if j + 1 < len(prof) and prof[j] != prof[j + 1]:
                rr = j + (prof[j] - hm) / (prof[j] - prof[j + 1])
            else:
                rr = j
            half.append(float(rr) * k)
            bri.append(float(DB[m].mean()))
            E = f32(sec_E[s]) - dE
            blue.append(float(E[m].mean() / max(DB[m].mean(), 1e-3)))
        else:
            edge.append(0.0)
            half.append(0.0)
            bri.append(0.0)
            blue.append(0.0)
    t = np.array(t)
    vis = np.array(px) >= MIN_FLAME_PX
    edge, half, bri = np.array(edge), np.array(half), np.array(bri)
    ser = {"t": t, "flame_px": np.array(px), "visible": vis.astype(int), "radius_px": half,
           "edge_px": edge, "brightness": bri, "blue_share": np.array(blue),
           "bg_offset": np.array(off_l), "noise": np.array(sig_l)}
    idx = np.nonzero(vis)[0]
    if len(idx) == 0 or idx[0] > 5:
        return {"flame_secs": 0, "ignition_s": round(f0, 1), "igniter_end_s": round(f1, 1),
                "dark_noise": round(noise, 3)}, ser, None
    first = last = idx[0]
    for j in idx[1:]:
        if j - last > GAP_S + 1:
            break
        last = j

    rlast = max(edge[max(first, last - 2):last + 1].max() / k, TAIL_MIN_R)
    disc = dist <= rlast + TAIL_MARGIN
    outer = dist > 2 * rlast + TAIL_MARGIN

    def disc_sig(s):
        D = f32(sec_B[s]) - dB
        return float(D[disc].mean() - np.median(D[outer]))

    T = np.array([disc_sig(s) for s in t])
    base = [T[j] for j in range(last + TAIL_BASE_START, min(len(t), last + TAIL_BASE_START + 20))]
    base += [disc_sig(s) for s in pre]
    tail = 0
    tail_thr = None
    if len(base) >= 4:
        tail_thr = float(np.mean(base) + TAIL_K * max(np.std(base), TAIL_MIN_STD))
        for j in range(last + 1, min(len(t), last + TAIL_BASE_START)):
            if T[j] > tail_thr:
                tail = j - last
            elif j - (last + tail) > GAP_S:
                break
    ser["disc_signal"] = T
    last_px = last
    last += tail
    sl = slice(first, last_px + 1)
    pk = first + int(np.argmax(half[sl]))
    out = {
        "ignition_s": round(f0, 1),
        "igniter_end_s": round(f1, 1),
        "first_flame_s": int(t[first]),
        "last_flame_s": int(t[last]),
        "flame_secs": int(vis[first:last + 1].sum()),
        "tail_s": int(t[last] - t[last_px]),
        "peak_radius_px": round(float(half[pk]), 1),
        "peak_radius_at_s": int(t[pk]),
        "peak_edge_px": round(float(edge[sl].max()), 1),
        "start_radius_px": round(float(np.median(half[first:first + 3])), 1),
        "peak_brightness": round(float(bri[sl].max()), 2),
        "mean_brightness": round(float(bri[sl][vis[sl]].mean()), 2),
        "blue_share": round(float(np.median(np.array(blue)[sl][vis[sl]])), 2),
        "centre_px": [round(cx * k, 1), round(cy * k, 1)],
        "dark_noise": round(noise, 3),
        "dark_secs": len(pre),
        "tail_threshold": None if tail_thr is None else round(tail_thr, 3),
    }
    ww = [j for j in range(max(first, last_px - WINDOW_S + 1), last_px + 1) if vis[j]]
    if len(ww) >= 3:
        out["shrink_px_per_s"] = round(-float(np.polyfit(t[ww], half[ww], 1)[0]), 2)
    vv = [j for j in range(first, last_px + 1) if vis[j]]
    if len(vv) >= 3:
        out["growth_px_per_s"] = round(float(np.polyfit(t[vv], half[vv], 1)[0]), 2)
    wf = list(range(max(first, last - WINDOW_S + 1), last + 1))
    if len(wf) >= 3:
        fit = np.polyfit(t[wf], T[wf], 1)
        start_level = np.polyval(fit, t[wf[0]])
        if start_level > 0:
            out["fade_pct_per_s"] = round(-100 * float(fit[0]) / float(start_level), 1)
    return out, ser, (cx * k, cy * k, rlast * k)


def fine_end(ff, path, last_s, cx, cy, r, src_w, src_h, video_len):
    half = int(min(max(2.5 * r, 40), src_h / 2))
    x0 = int(min(max(cx - half, 0), src_w - 2 * half))
    y0 = int(min(max(cy - half, 0), src_h - 2 * half))
    side = 2 * half
    sz = 120
    ss = max(0.0, last_s - FINE_BEFORE_S)
    dur = FINE_BEFORE_S + 1 + FINE_AFTER_S
    vf = f"fps={FINE_FPS}:start_time=0,crop={side}:{side}:{x0}:{y0},scale={sz}:{sz}:flags=area"
    yy, xx = np.mgrid[0:sz, 0:sz]
    sc = sz / side
    d = np.sqrt((xx - (cx - x0) * sc) ** 2 + (yy - (cy - y0) * sc) ** 2)
    disc = d <= (r + 8) * sc
    outer = d > (1.6 * r + 8) * sc
    if outer.sum() < 200:
        outer = d > d.max() * 0.85
    S = []
    for f in frames(ff, path, vf, sz, sz, ss=ss, t=dur):
        bl = f[:, :, 2].astype(np.float32)
        S.append(float(bl[disc].mean() - np.median(bl[outer])))
    S = np.array(S)
    tt = ss + np.arange(len(S)) / FINE_FPS
    post = S[tt >= last_s + 2]
    if len(post) < FINE_FPS:
        return {"cut_off": True}
    base, sd = float(np.mean(post)), max(float(np.std(post)), 0.02)
    x = np.convolve(S - base, np.ones(3) / 3, mode="same")
    on = np.nonzero((x > FINE_K * sd) & (tt < last_s + 2))[0]
    if len(on) == 0:
        return {}
    ie = on[-1]
    ext = float(tt[ie]) + 1 / FINE_FPS
    out = {"extinction_s": round(ext, 2)}
    ref = x[(tt >= ext - 10) & (tt < ext - 3)]
    fin = x[(tt >= ext - 0.5) & (tt < ext)]
    if len(ref) > FINE_FPS and np.mean(ref) > 0:
        ratio = float(np.mean(fin) / np.mean(ref))
        out["end_ratio"] = round(ratio, 2)
        out["end_kind"] = "sudden" if ratio > SUDDEN_RATIO else "gradual"
        w = x[(tt >= ext - WINDOW_S) & (tt < ext - 0.2)]
        if len(w) > 2 * FINE_FPS:
            smooth = np.convolve(w, np.ones(FINE_FPS) / FINE_FPS, mode="same")
            hp = (w - smooth)[FINE_FPS // 2:-FINE_FPS // 2]
            out["flicker"] = round(float(np.std(hp) / max(np.mean(w), 1e-3)), 3)
            lvl = 0.5 * float(np.mean(ref))
            above = np.nonzero((x >= lvl) & (tt < ext))[0]
            if len(above):
                out["final_drop_s"] = round(ext - float(tt[above[-1]]), 2)
    return out


def write_series(path, ser_top, ser, nsec):
    cols = ["t", "dark", "luma", "bright", "visible", "flame_px", "radius_px", "edge_px", "brightness",
            "blue_share", "disc_signal", "bg_offset", "noise"]
    byt = {int(s): j for j, s in enumerate(ser.get("t", []))}
    with open(path, "w") as f:
        f.write(",".join(cols) + "\n")
        for s in range(nsec):
            j = byt.get(s)
            row = [s, int(ser_top["dark"][s]), round(float(ser_top["luma"][s]), 2), round(float(ser_top["bright"][s]), 5)]
            for c in cols[4:]:
                row.append("" if j is None or c not in ser else round(float(ser[c][j]), 3))
            f.write(",".join(str(x) for x in row) + "\n")


def contact_sheet(ff, path, out, t0, t1, crop):
    n = int(min(SHEET_MAX_TILES, max(1, np.ceil((t1 - t0) / SHEET_STEP_S))))
    rows = int(np.ceil(n / SHEET_COLS))
    cols = min(SHEET_COLS, n)
    th = SHEET_TILE_W * 3 // 4
    cr = "" if crop is None else "crop={}:{}:{}:{},".format(*crop)
    base = f"fps=1/{SHEET_STEP_S}:start_time=0,{cr}scale={SHEET_TILE_W}:{th},eq=gamma=1.6:saturation=1.6"
    font = next((f for f in FONTS if os.path.exists(f)), None)
    label = (f"drawtext={'fontfile=' + font + ':' if font else ''}"
             f"text='%{{pts\\:hms\\:{t0:.0f}}}':x=2:y=2:fontsize=10:fontcolor=white")
    for vf in (f"{base},{label},tile={cols}x{rows}", f"{base},tile={cols}x{rows}"):
        cmd = [ff, "-v", "error", "-y", "-ss", f"{t0:.1f}", "-t", f"{n * SHEET_STEP_S:.1f}", "-i", path,
               "-map", "0:v:0", "-vf", vf, "-frames:v", "1", "-q:v", "7", out]
        r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
            return {"sheet": os.path.basename(out), "sheet_start_s": round(t0, 1), "sheet_step_s": SHEET_STEP_S,
                    "sheet_tiles": n, "sheet_labels": "drawtext" in vf, "sheet_kb": os.path.getsize(out) // 1024}
        log("sheet attempt failed:", r.stderr.strip()[-200:])
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", required=True)
    ap.add_argument("--name")
    ap.add_argument("--ffmpeg", default=os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "ffmpeg")
    ap.add_argument("--no-sheet", action="store_true")
    a = ap.parse_args()
    name = a.name or os.path.splitext(os.path.basename(a.video))[0]
    name = re.sub(r"[^A-Za-z0-9_.-]", "", name.replace(" ", ""))
    os.makedirs(a.out, exist_ok=True)
    t_start = time.time()
    row = {"name": name, "file": os.path.basename(a.video), "reader_version": READER_VERSION, "status": "error"}
    try:
        dur, w, h = probe(a.ffmpeg, a.video)
        row.update({"duration_s": round(dur, 1) if dur else None, "width": w, "height": h})
        luma_f, bright_f, sM, sE = decode(a.ffmpeg, a.video)
        nsec = len(sM)
        row["decoded_s"] = nsec
        row["decode_time_s"] = round(time.time() - t_start, 1)
        luma_s, bright_s, dark, dark_runs, cands = find_tests(luma_f, bright_f, nsec)
        top = {"luma": luma_s, "dark": dark.astype(int), "bright": bright_s}
        row["dark_runs"] = [[x, y] for x, y in dark_runs]
        row["n_ignitions"] = len(cands)
        best, ser, win, geo = None, {}, None, None
        if not dark_runs:
            row["status"] = "no_dark"
        elif not cands:
            row["status"] = "no_ignition"
            row["lights_off_s"] = float(dark_runs[0][0])
            win = dark_runs[0]
        else:
            for c in cands:
                m = measure(c[0], c[1], c[2], c[3], sM, sE, bright_s, w)
                if m is not None and (best is None or m[0].get("flame_secs", 0) > best[0].get("flame_secs", 0)):
                    best = m + (c,)
            if best is None:
                row["status"] = "no_dark"
                row["lights_off_s"] = float(cands[0][0])
                row["ignition_s"] = round(cands[0][2], 1)
                win = cands[0][:2]
            else:
                res, ser, geo, c = best
                row.update(res)
                row["lights_off_s"] = float(c[0])
                win = c[:2]
                row["status"] = "ok" if res.get("flame_secs", 0) > 0 else "no_flame"
        del sM, sE
        if row["status"] == "ok":
            last = row["last_flame_s"]
            fine = fine_end(a.ffmpeg, a.video, last, geo[0], geo[1], geo[2], w, h, nsec)
            row.update({k: v for k, v in fine.items() if k != "cut_off"})
            end = fine.get("extinction_s", last + 1.0)
            row["burn_time_s"] = round(end - row["ignition_s"], 1)
            if "extinction_s" in fine:
                row["last_px_s"] = last
                row["last_flame_s"] = int(np.ceil(end) - 1)
            if fine.get("cut_off") or row["last_flame_s"] >= nsec - 2:
                row["status"] = "cut_off"
        write_series(os.path.join(a.out, name + ".csv"), top, ser, nsec)
        row["series"] = name + ".csv"
        row["burner_px"] = BURNER_PX
        if not a.no_sheet:
            crop = None
            if geo is not None:
                hh = int(min(max(3.0 * max(row.get("peak_radius_px", 0), 40), 160), h)) // 2 * 2
                ww = int(min(hh * 4 // 3, w)) // 2 * 2
                x0 = int(min(max(geo[0] - ww / 2, 0), w - ww))
                y0 = int(min(max(geo[1] - hh / 2, 0), h - hh))
                crop = (ww, hh, x0, y0)
            if row.get("last_flame_s") is not None:
                t0, t1 = row["lights_off_s"] - 6, row["last_flame_s"] + 10
            elif win:
                t0, t1 = win[0] - 6, win[1] + 3
            else:
                t0, t1 = 0, nsec
            t0 = max(0.0, t0)
            if (t1 - t0) / SHEET_STEP_S > SHEET_MAX_TILES and row.get("ignition_s") is not None:
                t0 = max(t0, row["ignition_s"] - 12)
            row.update(contact_sheet(a.ffmpeg, a.video, os.path.join(a.out, name + ".jpg"), t0, t1, crop))
    except Exception as e:
        row["status"] = "error"
        row["error"] = f"{type(e).__name__}: {e}"[:300]
    row["proc_s"] = round(time.time() - t_start, 1)
    print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main()
