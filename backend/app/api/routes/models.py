import os

from fastapi import APIRouter

router = APIRouter(prefix="/models", tags=["models"])

MODEL_MANIFEST = {
    "id": "gemma-4-q4",
    "format": "gguf",
    "quantization": "Q4_K_M",
    "bytes": 3462680032,
    "sha256": os.getenv(
        "MODEL_SHA256",
        "923c4c86177d2ee173a7f5b4fa3d0ac65f5962ab15e6d6a5bc250aec4fd7bf7e",
    ),
    "url": "https://models.creepy.im/models/gemma-4/q4_k_m/model.gguf",
}

@router.get("/recommended")
async def recommended() -> dict:
    return MODEL_MANIFEST
