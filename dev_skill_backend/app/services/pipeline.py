import time

from app.services.consolidate import consolidate
from app.services.vision.cleanup import cleanup
from app.services.vision.privacy import blurred_thumbnail
from app.services.vision.quality import quality_gate
from app.services.vision.usage import item_usage


def analyse_hour(grab_frame, detector, tpl, cam, staff_subtract, ref_gray=None, sleep=0):
    counts, eq_counts, tamper, thumbs = [], {}, [], []
    usage_tot = {}
    taken, attempts, target = 0, 0, tpl["base_frames"]
    prev_gray, last_t = None, 0
    op_rules = {r["class"]: r.get("operability", "none") for r in tpl.get("equipment_rules", [])}
    while True:
        while taken < target and attempts < tpl["max_frames"] * 3:
            attempts += 1
            frame = grab_frame()
            if frame is None:
                tamper.append("no_frame")
                continue
            q = quality_gate(frame, prev_gray, time.time() - last_t if last_t else 0, ref_gray)
            prev_gray, last_t = q["gray"], time.time()
            if not q["ok"]:
                tamper.extend(q["reasons"])
                continue
            dets = detector.detect(frame)
            c = cleanup(
                dets,
                frame.shape,
                cam["roi_polygon"],
                cam["zones"],
                tpl["presence_rule"],
                staff_subtract,
            )
            counts.append(c["people_count"])
            people_boxes = [p[:4] for p in (c.get("all_people") or [])]
            used = item_usage(frame, c["equipment"], people_boxes, op_rules)
            for cls, st in used.items():
                eq_counts.setdefault(cls, []).append(st.get("present", 0))
                acc = usage_tot.setdefault(cls, {"present": 0, "in_use": 0})
                acc["present"] += st.get("present", 0)
                acc["in_use"] += st.get("in_use", 0)
            if len(thumbs) < 3:
                labelled = [(p[0], p[1], p[2], p[3], p[5]) for p in c["counted_boxes_full"]]
                thumbs.append(
                    blurred_thumbnail(
                        frame,
                        people_boxes,
                        labelled,
                    )
                )
            taken += 1
            if sleep:
                time.sleep(sleep)
        res = consolidate(counts, tpl["count_tolerance"], float(tpl["agree_ratio"]))
        if res["consistent"] or taken >= tpl["max_frames"] or attempts >= tpl["max_frames"] * 3:
            break
        target = min(taken + tpl["step_frames"], tpl["max_frames"])
    state = "ok" if res["consistent"] else "uncertain"
    equipment = {}
    for k, v in eq_counts.items():
        row = consolidate(v, tpl["count_tolerance"], float(tpl["agree_ratio"]), min_frames=3)
        acc = usage_tot.get(k, {"present": 0, "in_use": 0})
        row["in_use_pct"] = round(100 * acc["in_use"] / max(1, acc["present"]))
        equipment[k] = row
    return {
        "observed": res["observed"],
        "ci_low": res["ci_low"],
        "ci_high": res["ci_high"],
        "state": state,
        "frames_used": taken,
        "per_frame": counts,
        "equipment": equipment,
        "tamper": sorted(set(tamper)),
        "thumbs": thumbs,
    }
