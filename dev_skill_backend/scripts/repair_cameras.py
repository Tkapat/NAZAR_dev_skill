from pymongo import ASCENDING as A, DESCENDING as D
from app.db.mongo import db


def repair_duplicate_camera_names():
    """Merge or rename existing duplicate cameras per centre (case-insensitive)."""
    changes = 0
    for centre in db.centres.find({}, {"_id": 1}):
        cid = centre["_id"]
        pipeline = [
            {"$match": {"centre_id": cid}},
            {"$project": {"name": 1, "name_lower": {"$toLower": "$name"}}},
            {"$group": {"_id": "$name_lower", "ids": {"$push": "$_id"}, "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
        ]
        for group in db.cameras.aggregate(pipeline):
            ids = group["ids"]
            keep_id = ids[0]
            for dup_id in ids[1:]:
                dup = db.cameras.find_one({"_id": dup_id})
                if not dup:
                    continue
                new_name = f"{dup['name']} (2)"
                counter = 2
                while db.cameras.find_one({"centre_id": cid, "name_lower": new_name.lower()}):
                    counter += 1
                    new_name = f"{dup['name']} ({counter})"
                db.cameras.update_one(
                    {"_id": dup_id},
                    {"$set": {"name": new_name, "name_lower": new_name.lower()}},
                )
                print(f"Renamed camera {dup['_id']} to '{new_name}' (was '{dup['name']}')")
                changes += 1
    if changes == 0:
        print("No duplicate camera names found.")
    else:
        print(f"Fixed {changes} duplicate camera names.")


if __name__ == "__main__":
    repair_duplicate_camera_names()