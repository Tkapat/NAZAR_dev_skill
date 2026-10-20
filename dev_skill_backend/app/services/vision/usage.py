import cv2
import numpy as np

SCREEN_CLASSES = {"monitor", "laptop", "tv"}

def _near(item_box, person_box, pad=0.15):
    pw = person_box[2] - person_box[0]
    ph = person_box[3] - person_box[1]
    x1 = person_box[0] - pad * pw
    y1 = person_box[1] - pad * ph
    x2 = person_box[2] + pad * pw
    y2 = person_box[3] + pad * ph
    return min(x2, item_box[2]) > max(x1, item_box[0]) and min(y2, item_box[3]) > max(y1, item_box[1])

def screen_on(frame, box) -> bool:
    x1, y1, x2, y2 = [max(0, int(v)) for v in box[:4]]
    r = frame[y1:y2, x1:x2]
    if r.size == 0:
        return False
    g = cv2.cvtColor(r, cv2.COLOR_BGR2GRAY)
    return bool(g.mean() > 70 or g.std() > 35)

def item_usage(frame, items, people, rules: dict) -> dict:
    """
    items: non-person dets (x1,y1,x2,y2,conf,name) inside ROI
    people: ALL person boxes in ROI
    rules: {class: operability}
    -> {class:{present,in_use,idle,off}}
    """
    out = {}
    for it in items:
        c = it[5]
        s = out.setdefault(c, {"present": 0, "in_use": 0, "idle": 0, "off": 0})
        s["present"] += 1
        mode = rules.get(c, "none")
        if mode == "none":
            continue
        if mode == "screen_on" and c in SCREEN_CLASSES and not screen_on(frame, it):
            s["off"] += 1
        elif any(_near(it, p) for p in people):
            s["in_use"] += 1
        else:
            s["idle"] += 1
    return out

def compute_in_use_pct(eq_dict: dict) -> dict:
    """Add in_use_pct to each equipment class in eq_dict."""
    for cls, v in eq_dict.items():
        total = max(1, v.get("present", 0) + v.get("in_use", 0) + v.get("idle", 0) + v.get("off", 0))
        in_use = v.get("in_use", 0)
        v["in_use_pct"] = round(100 * in_use / total)
    return eq_dict