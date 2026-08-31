"""
食令 - FastAPI 应用入口
MVP v0.2: 口味档案 + 时令日历 + 菜系地图
"""

from contextlib import asynccontextmanager

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
from app.stats import get_client_ip, get_stats_summary, init_db, record_visit

BASE_DIR = Path(__file__).parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="食令 - 智能选菜助手", version="0.2.0", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def _track(request: Request, endpoint: str = "page"):
    record_visit(
        ip=get_client_ip(request),
        endpoint=endpoint,
        user_agent=request.headers.get("user-agent", ""),
    )


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
    request: Request,
    keyword: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(20, ge=1, le=50),
):
    _track(request, "search")
    results = search_dishes(keyword, limit)
    return {"code": 0, "data": {"dishes": results, "total": len(results)}}


@app.get("/api/cuisines")
async def api_cuisines():
    return {"code": 0, "data": get_all_cuisines()}


@app.get("/api/provinces")
async def api_provinces():
    return {"code": 0, "data": get_all_provinces()}


@app.get("/api/province/{province}")
async def api_province_dishes(
    request: Request,
    province: str,
    limit: int = Query(20, ge=1, le=50),
):
    _track(request, "province")
    dishes = get_dishes_by_province(province, limit)
    return {"code": 0, "data": {"province": province, "dishes": dishes, "total": len(dishes)}}


@app.get("/api/solar-terms")
async def api_solar_terms(request: Request):
    _track(request, "solar-terms")
    data = get_solar_terms_data()
    return {"code": 0, "data": data}


@app.get("/api/season/{season}")
async def api_season_dishes(
    request: Request,
    season: str,
    count: int = Query(10, ge=1, le=30),
):
    _track(request, "season")
    dishes = get_dishes_by_season(season, count)
    return {"code": 0, "data": {"season": season, "dishes": dishes}}


@app.get("/api/stats")
async def api_stats(
    key: str = Query(None),
    recent: int = Query(50, ge=1, le=200),
    ips: int = Query(50, ge=1, le=200),
):
    if key != "shiling2026":
        return {"code": 403, "msg": "需要密钥，访问 /api/stats?key=shiling2026"}
    return {"code": 0, "data": get_stats_summary(recent_limit=recent, ip_limit=ips)}
