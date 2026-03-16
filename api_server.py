#!/usr/bin/env python3
"""Banner persistence server — saves uploaded banner images and position to disk."""
import json
import base64
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

DATA_DIR = Path(__file__).parent / "banner_data"
DATA_DIR.mkdir(exist_ok=True)
POSITION_FILE = DATA_DIR / "position.json"
IMAGE_FILE = DATA_DIR / "banner_upload.jpg"

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/banner")
def get_banner():
    result = {}
    if POSITION_FILE.exists():
        result["position"] = json.loads(POSITION_FILE.read_text())
    if IMAGE_FILE.exists():
        result["image"] = "api/banner/image"
    return result

@app.get("/api/banner/image")
def get_banner_image():
    if IMAGE_FILE.exists():
        return FileResponse(IMAGE_FILE, media_type="image/jpeg")
    return JSONResponse({"error": "no image"}, status_code=404)

@app.post("/api/banner")
async def save_banner(request: Request):
    data = await request.json()
    # Save position
    if "position" in data:
        POSITION_FILE.write_text(json.dumps(data["position"]))
    # Save image if provided (base64 data URI)
    if "imageData" in data and data["imageData"]:
        img_data = data["imageData"]
        # Strip data:image/...;base64, prefix
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]
        img_bytes = base64.b64decode(img_data)
        IMAGE_FILE.write_bytes(img_bytes)
    result = {"ok": True}
    if IMAGE_FILE.exists():
        result["image"] = "api/banner/image"
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
