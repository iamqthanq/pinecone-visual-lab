"""Read-only asset/profile comparison and explicit intentional-design pixel differences."""

import hashlib
import json
import statistics
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def load(name):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def bundle(label):
    report = load(f"bundle-{label}.json")
    graph = report["manifest"]
    files = {report["entry"]}
    if graph:
        visited = set()

        def visit(key):
            if key in visited:
                return
            visited.add(key)
            node = graph[key]
            if node["file"].endswith(".js"):
                files.add(Path(node["file"]).name)
            for imported in node.get("imports", []):
                visit(imported)

        visit("index.html")
    initial = [asset for asset in report["assets"] if asset["file"] in files]
    return {"initial_files": sorted(files), "initial_bytes": sum(a["bytes"] for a in initial),
            "initial_gzip_bytes": sum(a["gzip_bytes"] for a in initial),
            "total_js_bytes": report["total_js_bytes"], "total_js_gzip_bytes": report["total_js_gzip_bytes"],
            "maps": report["source_maps"]}


def profile(label):
    report = load(f"performance-{label}.json")
    samples = report["samples"]
    def median(values):
        return round(statistics.median(values), 3)
    return {"browser": report["browser"], "runs": len(samples),
            "initial_ready_median_ms": median([s["initialReadyMs"] for s in samples]),
            "architecture_ready_median_ms": median([s["routeReadyMs"] for s in samples]),
            "initial_js_decoded_bytes": [sum(r["decodedBodySize"] for r in s["initialResources"]) for s in samples],
            "long_task_counts": [len(s["longTasks"]) for s in samples],
            "long_task_total_median_ms": median([sum(t["duration"] for t in s["longTasks"]) for s in samples]),
            "frame_gap_median_per_run_ms": [median(s["frameGapsMs"]) for s in samples],
            "final_task_duration_median_s": median([next(m["value"] for m in s["finalMetrics"] if m["name"] == "TaskDuration") for s in samples])}


def main():
    before, after = bundle("before"), bundle("after")
    assert not after["maps"]
    assert after["initial_bytes"] < before["initial_bytes"]
    assert not any("ArchitectureLab" in name or "gsap-" in name for name in after["initial_files"])
    comparisons = {"bundle_before": before, "bundle_after": after,
                   "initial_bytes_reduction_percent": round(100 * (1 - after["initial_bytes"] / before["initial_bytes"]), 2),
                   "profile_before": profile("before"), "profile_after": profile("after"),
                   "scope": "Local five-sample observations only; no FPS/real-user/cloud benchmark claim"}
    (HERE / "performance-comparison.json").write_text(json.dumps(comparisons, indent=2) + "\n", encoding="utf-8")
    directory = HERE / "design-diffs"
    directory.mkdir(exist_ok=True)
    differences = []
    for source in sorted((HERE / "before/fixture").glob("*.png")):
        candidate = HERE / "after/fixture" / source.name
        with Image.open(source).convert("RGB") as left, Image.open(candidate).convert("RGB") as right:
            size = max(left.width, right.width), max(left.height, right.height)
            a, b = Image.new("RGB", size), Image.new("RGB", size)
            a.paste(left); b.paste(right)
            diff = ImageChops.difference(a, b)
            diff.save(directory / source.name)
            red, green, blue = diff.split()
            any_channel = ImageChops.lighter(red, ImageChops.lighter(green, blue))
            changed = size[0] * size[1] - any_channel.histogram()[0]
            differences.append({"file": source.name, "before_size": left.size, "after_size": right.size,
                                "different_pixels": changed, "padded_canvas_pixels": size[0] * size[1],
                                "interpretation": "Intentional design comparison; not a regression PASS/fail threshold"})
    (directory / "manifest.json").write_text(json.dumps(differences, indent=2) + "\n", encoding="utf-8")
    references = []
    for path in sorted((HERE / "after/fixture").glob("*.png")):
        if path.name.startswith("rag-chat-") and not path.name.startswith("rag-chat-visible-"):
            continue  # Original capture retained; clean paired supplement is the active RAG reference.
        with Image.open(path) as image:
            references.append({"file": path.name, "width": image.width, "height": image.height,
                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    (HERE / "visual-reference-manifest.json").write_text(json.dumps({
        "status": "PROPOSED; independent ChatGPT/owner visual approval pending", "references": references,
        "comparison": "Playwright screenshot threshold0.1, at most100 different pixels; fixed before verification; no auto update",
        "negative_oracle": "Deliberate red panel must be rejected by the same comparator",
        "rag_capture": "Visible-time-mask supplement replaces the four legacy hidden-details-mask RAG references; originals remain immutable",
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(comparisons, indent=2))
    print(f"Compared {len(differences)} BEFORE/AFTER fixture images; frozen {len(references)} proposed references")


if __name__ == "__main__":
    main()
