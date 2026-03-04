from fastapi import FastAPI, HTTPException, Depends, Request, Response, status, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import motor.motor_asyncio
from bson import ObjectId
import os
import shutil
import base64
import mimetypes
from datetime import datetime, timedelta
import asyncio
from typing import Optional, Dict, List
import jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
db = client["seq_safety"]

# Secret (change in production!)
JWT_SECRET = "your-secret-key-change-me"
security = HTTPBearer()

# Upload folders
UPLOAD_DIR = "uploads"
os.makedirs(f"{UPLOAD_DIR}/video", exist_ok=True)
os.makedirs(f"{UPLOAD_DIR}/audio", exist_ok=True)
os.makedirs(f"{UPLOAD_DIR}/photos", exist_ok=True)

MEDIA_URL_PREFIX = "/media"

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except:
        raise HTTPException(status_code=401, detail="Invalid authentication")

async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await get_current_user(credentials)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

class PanicActivate(BaseModel):
    latitude: float
    longitude: float
    user_id: str

class PanicDeactivate(BaseModel):
    panic_id: str

@app.post("/panic/activate")
async def activate_panic(data: PanicActivate, current_user = Depends(get_current_user)):
    panic_doc = {
        "user_id": ObjectId(data.user_id),
        "location": {"type": "Point", "coordinates": [data.longitude, data.latitude]},
        "timestamp": datetime.utcnow(),
        "active": True,
        "status": "active"
    }
    result = await db.active_panics.insert_one(panic_doc)
    return {"panic_id": str(result.inserted_id), "message": "Panic activated"}

@app.post("/panic/deactivate")
async def deactivate_panic(data: PanicDeactivate, current_user = Depends(get_current_user)):
    result = await db.active_panics.update_one(
        {"_id": ObjectId(data.panic_id), "user_id": current_user["_id"]},
        {"$set": {"active": False, "status": "resolved", "resolved_at": datetime.utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Panic not found or not yours")
    # Optional: remove instead of mark resolved
    # await db.active_panics.delete_one({"_id": ObjectId(data.panic_id)})
    return {"message": "Panic deactivated"}

@app.get("/security/active-panics")
async def get_active_panics(current_user = Depends(get_current_user)):
    if current_user.get("role") not in ["security", "admin"]:
        raise HTTPException(403, "Not authorized")
    cursor = db.active_panics.find({"active": True})
    panics = await cursor.to_list(length=100)
    for p in panics:
        user = await db.users.find_one({"_id": p["user_id"]})
        if user:
            p["user_name"] = user.get("full_name", "Unknown User")
            p["email"] = user.get("email", "N/A")
            p["phone"] = user.get("phone", "N/A")
        else:
            p["user_name"] = "Unknown User"
    return panics

@app.post("/report/upload-video")
async def upload_video_report(file: UploadFile = File(...), current_user = Depends(get_current_user)):
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['mp4', 'mov', 'avi']:
        raise HTTPException(400, "Invalid video format")
    filename = f"{ObjectId()}.{ext}"
    path = f"{UPLOAD_DIR}/video/{filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    url = f"{MEDIA_URL_PREFIX}/video/{filename}"
    report = {
        "user_id": current_user["_id"],
        "type": "video",
        "file_url": url,
        "created_at": datetime.utcnow(),
        "status": "ready"
    }
    await db.civil_reports.insert_one(report)
    return {"url": url, "message": "Video uploaded"}

@app.get("/media/video/{filename}")
async def stream_video(filename: str, request: Request):
    path = f"{UPLOAD_DIR}/video/{filename}"
    if not os.path.exists(path):
        raise HTTPException(404, "Video not found")
    range_header = request.headers.get("Range")
    file_size = os.path.getsize(path)
    if range_header:
        # Partial content (range request support for video seeking)
        start, end = 0, None
        range_str = range_header.replace("bytes=", "")
        ranges = range_str.split("-")
        start = int(ranges[0]) if ranges[0] else 0
        end = int(ranges[1]) if ranges[1] else file_size - 1
        length = end - start + 1
        def iterfile():
            with open(path, "rb") as f:
                f.seek(start)
                while chunk := f.read(8192):
                    if (f.tell() - start) >= length:
                        break
                    yield chunk
        return StreamingResponse(
            iterfile(),
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Type": "video/mp4"
            }
        )
    else:
        def iterfile():
            with open(path, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk
        return StreamingResponse(
            iterfile(),
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes"}
        )

@app.post("/user/profile-photo")
async def upload_profile_photo(base64_data: str, mime_type: str = "image/jpeg", current_user = Depends(get_current_user)):
    try:
        # Remove data URI prefix if present
        if base64_data.startswith("data:"):
            base64_data = base64_data.split(",")[1]
        img_data = base64.b64decode(base64_data)
        ext = mimetypes.guess_extension(mime_type) or ".jpg"
        filename = f"{current_user['_id']}{ext}"
        path = f"{UPLOAD_DIR}/photos/{filename}"
        with open(path, "wb") as f:
            f.write(img_data)
        url = f"{MEDIA_URL_PREFIX}/photos/{filename}"
        await db.users.update_one(
            {"_id": current_user["_id"]},
            {"$set": {"profile_photo": url, "updated_at": datetime.utcnow()}}
        )
        return {"url": url}
    except Exception as e:
        raise HTTPException(400, f"Upload failed: {str(e)}")

@app.delete("/admin/clear-uploads", dependencies=[Depends(get_admin_user)])
async def clear_all_uploads():
    # Delete DB entries
    await db.civil_reports.delete_many({"type": {"$in": ["video", "audio"]}})
    # Delete physical files
    for folder in ["video", "audio"]:
        path = f"{UPLOAD_DIR}/{folder}"
        if os.path.exists(path):
            for f in os.listdir(path):
                os.remove(os.path.join(path, f))
    # Audit log
    await db.audit_logs.insert_one({
        "action": "clear_uploads",
        "performed_by": "admin",
        "timestamp": datetime.utcnow()
    })
    return {"message": "All user-generated audio/video uploads cleared"}

# Add your other endpoints here (ETA, escort, etc.) as previously implemented

@app.on_event("startup")
async def startup():
    print("Backend started - uploads dir ready")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
