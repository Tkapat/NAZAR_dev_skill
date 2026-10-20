import base64
import os
import threading
import cv2
import numpy as np
from cryptography.fernet import Fernet
from app.core.config import settings

_fernet = Fernet(settings.fernet_key.encode())
_lock, _engine, _err = threading.Lock(), None, None


class FaceError(Exception):
    def __init__(self, code, msg, advice="", status=422):
        self.code, self.msg, self.advice, self.status = code, msg, advice, status


class OpenCVEngine:
    name = "opencv"
    threshold = 0.363

    def __init__(self):
        d = os.path.join(settings.models_dir, "face_detection_yunet_2023mar.onnx")
        r = os.path.join(settings.models_dir, "face_recognition_sface_2021dec.onnx")
        if not (os.path.exists(d) and os.path.exists(r)):
            raise RuntimeError("Face models missing. Run: python -m scripts.download_models")
        self.det = cv2.FaceDetectorYN.create(d, "", (320, 320), 0.7, 0.3, 5000)
        self.rec = cv2.FaceRecognizerSF.create(r, "")

    def faces(self, img):
        h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, f = self.det.detect(img)
        return [] if f is None else [(r[0], r[1], r[0] + r[2], r[1] + r[3], float(r[14]), r) for r in f]

    def embed(self, img, face):
        return self.rec.feature(self.rec.alignCrop(img, face[5])).flatten().astype(np.float32)


class InsightEngine:
    name = "insightface"
    threshold = 0.45

    def __init__(self):
        from insightface.app import FaceAnalysis
        self.app = FaceAnalysis(name="buffalo_s", providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=-1, det_size=(640, 640))

    def faces(self, img):
        return [(*f.bbox.tolist(), float(f.det_score), f) for f in self.app.get(img)]

    def embed(self, img, face):
        return face[5].normed_embedding.astype(np.float32)


def engine():
    global _engine, _err
    if _engine:
        return _engine
    with _lock:
        if _engine:
            return _engine
        order = {"opencv": [OpenCVEngine], "insightface": [InsightEngine]}.get(
            settings.face_backend, [OpenCVEngine, InsightEngine]
        )
        for cls in order:
            try:
                _engine = cls()
                _err = None
                return _engine
            except Exception as e:
                _err = f"{cls.__name__}: {e}"
        raise FaceError("FACE_ENGINE_UNAVAILABLE", "Face engine is not available", _err or "", 503)


def health():
    try:
        e = engine()
        return {"ready": True, "backend": e.name, "error": None}
    except FaceError:
        return {"ready": False, "backend": None, "error": _err}


def decode(b64: str):
    try:
        img = cv2.imdecode(np.frombuffer(base64.b64decode(b64.split(",")[-1]), np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        img = None
    if img is None:
        raise FaceError("BAD_FILE", "Unreadable image", "Try again.")
    if max(img.shape[:2]) > 1280:
        s = 1280 / max(img.shape[:2])
        img = cv2.resize(img, None, fx=s, fy=s)
    return img


def _single(img):
    e = engine()
    fs = [f for f in e.faces(img) if f[4] >= 0.7]
    if not fs:
        raise FaceError("NO_FACE", "No face found", "Face the camera in good light.")
    if len(fs) > 1:
        raise FaceError("MULTIPLE_FACES", "More than one face", "Only one person in the picture.")
    f = fs[0]
    if (f[2] - f[0]) < 0.12 * img.shape[1]:
        raise FaceError("FACE_TOO_SMALL", "Face too small", "Move closer to the camera.")
    x1, y1, x2, y2 = [max(0, int(v)) for v in f[:4]]
    if cv2.Laplacian(cv2.cvtColor(img[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 30:
        raise FaceError("FACE_BLURRY", "Picture is blurry", "Hold still and clean the lens.")
    return e.embed(img, f), f


def _unit(v):
    return v / (np.linalg.norm(v) + 1e-9)


def enrol_embedding(frames_b64):
    embs = [_unit(_single(decode(b))[0]) for b in frames_b64[:5]]
    return _unit(np.mean(embs, axis=0)), engine().name


def encrypt(e):
    return _fernet.encrypt(e.astype(np.float32).tobytes())


def decrypt(b):
    return np.frombuffer(_fernet.decrypt(bytes(b)), dtype=np.float32)


def verify(frames_b64, stored_doc):
    e = engine()
    if stored_doc.get("backend") != e.name:
        raise FaceError("FACE_BACKEND_CHANGED", "Enrolment is outdated", "Please enrol your face again.")
    ref = _unit(decrypt(stored_doc["embedding_enc"]))
    scores, centres = [], []
    for b in frames_b64[:5]:
        img = decode(b)
        emb, f = _single(img)
        scores.append(float(np.dot(_unit(emb), ref)))
        centres.append(((f[0] + f[2]) / 2 / img.shape[1], (f[1] + f[3]) / 2 / img.shape[0]))
    thr = settings.face_threshold if settings.face_threshold else e.threshold
    if settings.face_liveness and len(centres) >= 3:
        move = max(
            abs(centres[i][0] - centres[0][0]) + abs(centres[i][1] - centres[0][1])
            for i in range(1, len(centres))
        )
        if move < 0.01:
            raise FaceError("LIVENESS_FAILED", "No movement detected", "Turn your head slightly while scanning.")
    best = max(scores)
    return best >= thr, best