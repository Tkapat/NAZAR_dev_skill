"""Create/refresh the hardcoded demo super-admin for the govt portal.

Login ID : admin@govt
Password : devskilladmin
"""

from datetime import datetime, timezone

from app.core.security import hash_pw
from app.db.mongo import db

LOGIN_ID = "admin@govt"
EMAIL = "admin.govt@gmail.com"
PASSWORD = "devskilladmin"
FULL_NAME = "Govt Admin"


def main():
    db.users.update_one(
        {"login_id": LOGIN_ID},
        {
            "$set": {
                "password_hash": hash_pw(PASSWORD),
                "role": "super_admin",
                "centre_id": None,
                "full_name": FULL_NAME,
                "email": EMAIL,
                "must_change_password": False,
                "temp_password_expires_at": None,
                "active": True,
                "token_version": 0,
                "failed_attempts": 0,
                "locked_until": None,
                "mfa_enabled": False,
            },
            "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
    print(f"Demo admin ready: login_id={LOGIN_ID}  password={PASSWORD}  email={EMAIL}")


if __name__ == "__main__":
    main()
