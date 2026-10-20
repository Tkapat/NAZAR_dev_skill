"""Generate sample demo videos for /edge/demo/run from a source still.

Writes into sample_videos/:
  lab_normal.mp4        full classroom (all people visible)
  lab_few.mp4           right-side crop (fewer students)
  lab_no_equipment.mp4  people + chairs, no laptops/monitors (equipment removed)
  lab_covered.mp4       flat grey feed (quality gate: covered)
  lab_frozen.mp4        frozen feed (static frames)
  lab_dark.mp4          under-exposed feed (quality gate: dark)

Source image: sample_videos/_src/lab2.jpg
(Wikimedia Commons: "Makmal komputer 3.jpg", CC-BY-SA)
Run from the backend root:  python -m scripts.make_sample_videos
"""

import os

import cv2
import numpy as np

SRC = "sample_videos/_src/lab2.jpg"
OUT_DIR = "sample_videos"
FPS = 15
SECONDS = 6
SIZE = (1280, 720)


def _read():
    img = cv2.imread(SRC)
    if img is None:
        raise SystemExit(
            f"Missing source image: {SRC} "
            "(download it into sample_videos/_src/ first)"
        )
    return img


def _crop_norm(img, x1, y1, x2, y2):
    h, w = img.shape[:2]
    return img[int(y1 * h) : int(y2 * h), int(x1 * w) : int(x2 * w)]


def _writer(name):
    path = os.path.join(OUT_DIR, name)
    return cv2.VideoWriter(
        path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, SIZE
    ), path


def _zoom_frames(base, zoom_from=1.0, zoom_to=1.03, pan=(0.0, 0.0)):
    """Slow zoom/pan so frames differ slightly (not 'frozen') but detections stay stable."""
    base = cv2.resize(base, SIZE)
    h, w = SIZE[1], SIZE[0]
    total = FPS * SECONDS
    frames = []
    for i in range(total):
        t = i / max(1, total - 1)
        z = zoom_from + (zoom_to - zoom_from) * t
        cx = w / 2 + pan[0] * w * t
        cy = h / 2 + pan[1] * h * t
        cw, ch = int(w / z), int(h / z)
        x0 = int(max(0, min(w - cw, cx - cw / 2)))
        y0 = int(max(0, min(h - ch, cy - ch / 2)))
        frame = base[y0 : y0 + ch, x0 : x0 + cw]
        frames.append(cv2.resize(frame, SIZE))
    return frames


def _write(name, frames, darken=None, grey=False, frozen=False):
    vw, path = _writer(name)
    for i in range(len(frames)):
        f = frames[i].copy()
        if grey:
            rng = np.random.default_rng(7)
            f = np.full((SIZE[1], SIZE[0], 3), 128, np.uint8).astype(np.int16)
            f = np.clip(f + rng.normal(0, 3, f.shape), 0, 255).astype(np.uint8)
        elif darken is not None:
            f = np.clip(f.astype(np.float32) * darken, 0, 255).astype(np.uint8)
        elif frozen:
            f = frames[0]
        vw.write(f)
    vw.release()
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    img = _read()
    full = cv2.resize(img, SIZE)

    made = []
    made.append(_write("lab_normal.mp4", _zoom_frames(full, 1.0, 1.03)))
    right = _crop_norm(img, 0.56, 0.18, 1.0, 1.0)
    made.append(_write("lab_few.mp4", _zoom_frames(right, 1.0, 1.02)))
    noeq = _crop_norm(img, 0.55, 0.25, 1.0, 0.95)
    made.append(_write("lab_no_equipment.mp4", _zoom_frames(noeq, 1.0, 1.02)))
    made.append(_write("lab_covered.mp4", [full] * (FPS * SECONDS), grey=True))
    made.append(_write("lab_frozen.mp4", [full] * (FPS * SECONDS), frozen=True))
    made.append(_write("lab_dark.mp4", _zoom_frames(full), darken=0.10))

    for p in made:
        print("wrote", p)


if __name__ == "__main__":
    main()
