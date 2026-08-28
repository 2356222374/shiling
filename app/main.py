"""
食令 - FastAPI 应用入口
MVP v0.2: 口味档案 + 时令日历 + 菜系地图
"""

from datetime import datetime, timezone
from collections import defaultdict
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path

from app.recommend import (
    recommend_dishes,
    get_all_cuisines,
    get_all_provinces,
    search_dishes,
    get_current_season,
    get_current_solar_term,
    get_dishes_by_province,
    get_solar_terms_data,
    get_dishes_by_season,
)

BASE_DIR = Path(__file__).parent

app = FastAPI(title="食令 - 智能选菜助手", version="0.2.0")

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# --- 访问统计（内存级，重启清零） ---
_stats = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "page_views": 0,
    "unique_ips": set(),
    "api_calls": defaultdict(int),
    "daily_pv": defaultdict(int),
}


def _track(request: Request, endpoint: str = "page"):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown").split(",")[0].strip()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    _stats["page_views"] += 1
    _stats["unique_ips"].add(ip)
    _stats["api_calls"][endpoint] += 1
    _stats["daily_pv"][today] += 1


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    _track(request, "home")
    season = get_current_season()
    solar_term, solar_desc = get_current_solar_term()
    provinces = get_all_provinces()
    cuisines = get_all_cuisines()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "season": season,
            "solar_term": solar_term,
            "solar_desc": solar_desc,
            "provinces": provinces,
            "cuisines": cuisines,
        },
    )


@app.get("/api/recommend")
async def api_recommend(
    request: Request,
    city: str = Query("全国", description="城市"),
    province: str = Query(None, description="省份"),
    spicy: int = Query(3, ge=0, le=5, description="辣度偏好 0-5"),
    sweet: int = Query(3, ge=0, le=5),
    salty: int = Query(3, ge=0, le=5),
    sour: int = Query(3, ge=0, le=5),
    count: int = Query(5, ge=1, le=20),
):
    _track(request, "recommend")
    result = recommend_dishes(
        city=city, province=province,
        spicy=spicy, sweet=sweet, salty=salty, sour=sour,
        count=count,
    )
    return {"code": 0, "data": result}


@app.get("/api/search")
async def api_search(
    keyword: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(20, ge=1, le=50),
):
    results = search_dishes(keyword, limit)
    return {"code": 0, "data": {"dishes": results, "total": len(results)}}


@app.get("/api/cuisines")
async def api_cuisines():
    return {"code": 0, "data": get_all_cuisines()}


@app.get("/api/provinces")
async def api_provinces():
    return {"code": 0, "data": get_all_provinces()}


@app.get("/api/province/{province}")
async def api_province_dishes(province: str, limit: int = Query(20, ge=1, le=50)):
    dishes = get_dishes_by_province(province, limit)
    return {"code": 0, "data": {"province": province, "dishes": dishes, "total": len(dishes)}}


@app.get("/api/solar-terms")
async def api_solar_terms():
    data = get_solar_terms_data()
    return {"code": 0, "data": data}


@app.get("/api/season/{season}")
async def api_season_dishes(season: str, count: int = Query(10, ge=1, le=30)):
    dishes = get_dishes_by_season(season, count)
    return {"code": 0, "data": {"season": season, "dishes": dishes}}


@app.get("/api/stats")
async def api_stats(request: Request, key: str = Query(None)):
    if key != "shiling2026":
        return {"code": 403, "msg": "需要密钥，访问 /api/stats?key=shiling2026"}
    daily = dict(sorted(_stats["daily_pv"].items(), reverse=True)[:7])
    return {
        "code": 0,
        "data": {
            "started_at": _stats["started_at"],
            "total_page_views": _stats["page_views"],
            "unique_visitors": len(_stats["unique_ips"]),
            "api_calls": dict(_stats["api_calls"]),
            "daily_pv_last_7days": daily,
        },
    }
