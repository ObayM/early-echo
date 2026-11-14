#!/usr/bin/env python3
import csv, fcntl, json, os, shutil, subprocess, sys, tarfile, time, urllib.parse, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}
API = "https://psi.nasa.gov/geode-py/ws/studies/PSI-159/download?"
HERE = os.path.dirname(os.path.abspath(__file__))


def sh(cmd, timeout=600):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)


def setup():
    sudo = "" if os.geteuid() == 0 else "sudo "
    if not shutil.which("ffmpeg"):
        sh(f"{sudo}apt-get update -qq && {sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg", 900)
    try:
        import numpy
    except ImportError:
        r = sh(f"{sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-numpy", 900)
        if r.returncode:
            sh(f"{sys.executable} -m pip install -q --break-system-packages numpy", 900)
    ok = bool(shutil.which("ffmpeg")) and sh(f"{sys.executable} -c 'import numpy'").returncode == 0
    if not ok:
        sys.exit("SETUP_FAILED ffmpeg or numpy missing")


def download(name, dest, size):
    q = urllib.parse.urlencode({"file": name, "redirect": "true"})
    last = ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + q, headers=UA), timeout=120) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f, 4 << 20)
            got = os.path.getsize(dest)
            if size and got != int(size):
                raise IOError(f"size {got} != {size}")
            return ""
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
            time.sleep(5 * (attempt + 1))
    return last


CLIP_BEFORE_S = 2
CLIP_AFTER_S = 6
CLIP_MAX_S = 8
STORY = {"21174C3": 65, "21102B1": 50}


def clip(video, row, dest):
    start, end = row.get("ignition_s"), row.get("extinction_s") or row.get("last_flame_s")
    if start is None or end is None or end <= start:
        return None
    t0 = max(0.0, float(start) - CLIP_BEFORE_S)
    dur = float(end) + CLIP_AFTER_S - t0
    speed = max(1.0, dur / CLIP_MAX_S)
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.2f}", "-t", f"{dur:.2f}", "-i", video, "-an",
         "-vf", f"setpts=PTS/{speed:.4f},fps=15,scale=320:240", "-c:v", "libx264", "-crf", "30",
         "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest],
        capture_output=True, text=True, timeout=300)
    if p.returncode or not os.path.exists(dest):
        return {"error": p.stderr[-200:]}
    info = {"file": os.path.basename(dest), "from_s": round(t0, 1), "seconds": round(dur, 1),
            "speed": round(speed, 2), "kb": os.path.getsize(dest) // 1024}
    first = row.get("first_flame_s")
    at = min(float(first) + 3, float(end) - 1) if first is not None else (float(start) + float(end)) / 2
    poster = dest[:-4] + "-poster.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{at:.2f}", "-i", video, "-frames:v", "1",
                    "-vf", "scale=320:240", "-q:v", "6", poster], capture_output=True, timeout=120)
    if os.path.exists(poster):
        info["poster"] = os.path.basename(poster)
    name = os.path.basename(dest)[:-4]
    if name in STORY:
        s0 = max(0.0, float(start) - 3)
        story = os.path.join(os.path.dirname(dest), f"story-{name}.mp4")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s0:.2f}", "-t", str(STORY[name] + 3), "-i", video,
                        "-an", "-c:v", "libx264", "-crf", "26", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", story], capture_output=True, timeout=600)
        if os.path.exists(story):
            info["story"] = {"file": os.path.basename(story), "from_s": round(s0, 1), "seconds": STORY[name] + 3}
    return info


def main():
    shard = sys.argv[1]
    lock = open(os.path.join(HERE, "job.lock"), "w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    rows = [r for r in csv.DictReader(open(os.path.join(HERE, "shards.csv"))) if r["shard"] == shard]
    if limit:
        rows = rows[:limit]
    setup()
    out = os.path.join(HERE, f"out-{shard}")
    tmp = os.path.join(HERE, "tmp")
    os.makedirs(out, exist_ok=True)
    os.makedirs(tmp, exist_ok=True)
    log = []
    ok = failed = 0
    t_start = time.time()
    for r in rows:
        test, name = r["test"], r["file_name"]
        video = os.path.join(tmp, "video" + os.path.splitext(name)[1])
        entry = {"test": test, "file_name": name}
        if os.path.exists(os.path.join(out, f"{test}.json")):
            ok += 1
            log.append({**entry, "resumed": True})
            continue
        t0 = time.time()
        err = download(name, video, r.get("size_bytes"))
        entry["download_s"] = round(time.time() - t0, 1)
        if err:
            entry["error"] = "download: " + err
        else:
            entry["mb_per_s"] = round(os.path.getsize(video) / 1e6 / max(entry["download_s"], 0.1), 1)
            t1 = time.time()
            try:
                p = subprocess.run(
                    [sys.executable, os.path.join(HERE, "read.py"), video, "--out", out, "--name", test],
                    capture_output=True, text=True, timeout=900)
                entry["read_s"] = round(time.time() - t1, 1)
                line = p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ""
                row = json.loads(line)
                row["clip"] = clip(video, row, os.path.join(out, f"{test}.mp4"))
                open(os.path.join(out, f"{test}.json"), "w").write(json.dumps(row) + "\n")
                if p.returncode:
                    entry["error"] = f"read exit {p.returncode}: {p.stderr[-300:]}"
            except Exception as e:
                entry["error"] = f"read: {type(e).__name__}: {str(e)[:300]}"
        if os.path.exists(video):
            os.remove(video)
        if "error" in entry:
            failed += 1
        else:
            ok += 1
        log.append(entry)
        print(json.dumps(entry), file=sys.stderr, flush=True)
    json.dump(log, open(os.path.join(out, f"shard-{shard}-log.json"), "w"), indent=1)
    tgz = os.path.join(HERE, f"results-{shard}.tgz")
    with tarfile.open(tgz, "w:gz") as t:
        t.add(out, arcname=f"out-{shard}")
    url = ""
    for attempt in range(4):
        p = sh(f"curl -sS -m 300 -F 'file=@{tgz}' https://tmpfiles.org/api/v1/upload", 320)
        try:
            url = json.loads(p.stdout)["data"]["url"]
            break
        except Exception:
            time.sleep(10)
    print(f"RESULT shard={shard} ok={ok} failed={failed} videos={len(rows)} "
          f"minutes={round((time.time() - t_start) / 60, 1)} mb={round(os.path.getsize(tgz) / 1e6, 2)} url={url or 'UPLOAD_FAILED'}")


if __name__ == "__main__":
    main()
