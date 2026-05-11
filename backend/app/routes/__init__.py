from fastapi import APIRouter

from app.routes import analyze as analyze_routes
from app.routes import download as download_routes
from app.routes import health as health_routes

api_router = APIRouter()
api_router.include_router(health_routes.router, tags=["health"])
api_router.include_router(analyze_routes.router, tags=["analyze"])
api_router.include_router(download_routes.router, tags=["download"])

__all__ = ["api_router"]
