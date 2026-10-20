import cv2
import numpy as np


CLASS_COLORS = {
    "person": (166, 70, 67),
    "chair": (70, 130, 180),
    "desk": (34, 139, 34),
    "monitor": (255, 140, 0),
    "laptop": (128, 0, 128),
    "keyboard": (255, 20, 147),
    "mouse": (255, 255, 0),
    "cell phone": (0, 255, 255),
    "bench": (139, 69, 19),
    "couch": (255, 165, 0),
    "book": (75, 0, 130),
    "bottle": (0, 191, 255),
    "keyboard": (128, 128, 128),
    "mouse": (192, 192, 192),
    "cell phone": (255, 20, 147),
}


def _color_for(cls):
    return CLASS_COLORS.get(cls, (255, 255, 255))


def blurred_thumbnail(frame, person_boxes, labelled_boxes=(), width=640) -> bytes:
    """
    person_boxes: list of (x1,y1,x2,y2) for head blurring
    labelled_boxes: list of (x1,y1,x2,y2,class_name) for drawing boxes + labels
    """
    out = frame.copy()
    H, W = out.shape[:2]

    # Blur head regions (top 28% of person boxes)
    for x1, y1, x2, y2 in person_boxes:
        x1, y1, x2, y2 = max(0, int(x1)), max(0, int(y1)), min(W, int(x2)), min(H, int(y2))
        hy2 = y1 + int(0.28 * (y2 - y1))
        roi = out[y1:hy2, x1:x2]
        if roi.size:
            k = max(9, ((x2 - x1) // 5) | 1)
            out[y1:hy2, x1:x2] = cv2.GaussianBlur(roi, (k, k), 0)

    # Draw labelled boxes
    for x1, y1, x2, y2, cls in labelled_boxes:
        x1, y1, x2, y2 = max(0, int(x1)), max(0, int(y1)), min(W, int(x2)), min(H, int(y2))
        color = _color_for(cls)
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            out, cls, (x1, max(15, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA
        )

    scale = width / out.shape[1]
    out = cv2.resize(out, (width, int(out.shape[0] * scale)))

    # Shrink quality until <= 60 KB
    for q in (60, 50, 40, 30, 20, 10):
        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, q])
        if ok and len(buf) <= 60_000:
            return buf.tobytes()
    return buf.tobytes()