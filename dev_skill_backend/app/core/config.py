from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongodb_uri: str
    mongodb_db: str
    jwt_secret: str
    fernet_key: str
    edge_signing_key_hex: str
    file_url_secret: str
    device_id: str = "edge-001"
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"
    local_db_path: str = "data/edge.db"
    evidence_dir: str = "data/evidence"
    force_offline: bool = False
    live_default_interval_s: int = 10
    live_timeline_gap_s: int = 30
    live_snapshot_ttl_days: int = 14
    routine_evidence_every_min: int = 15
    consolidate_every_snapshots: int = 5
    run_timeout_intervals: int = 3
    schedule_horizon_days: int = 60
    models_dir: str = "models"
    detector_model: str = "yolo11s"
    detector_imgsz: int = 960
    face_backend: str = "auto"
    face_threshold: float | None = None
    face_liveness: bool = False
    gov_live_thumbs: bool = False
    record_provisional: bool = True
    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
