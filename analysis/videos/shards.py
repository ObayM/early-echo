#!/usr/bin/env python3
import csv, sys

n, dest = int(sys.argv[1]), sys.argv[2]
rows = [r for r in csv.DictReader(open("results/videos-match.csv")) if r["pick"] == "1"]
rows.sort(key=lambda r: -int(r["size_bytes"]))
load = [0] * n
out = []
for r in rows:
    i = load.index(min(load))
    load[i] += int(r["size_bytes"])
    out.append({"shard": i, "test": r["test"], "file_name": r["file_name"], "size_bytes": r["size_bytes"]})
with open(dest, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["shard", "test", "file_name", "size_bytes"])
    w.writeheader()
    w.writerows(out)
print(f"{len(out)} videos in {n} shards, GB per shard {min(load) / 1e9:.2f} to {max(load) / 1e9:.2f}")
