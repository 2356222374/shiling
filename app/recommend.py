"""
食令 - 推荐算法核心模块
基于城市、季节、口味偏好的三维推荐引擎
"""

import json
import random
import math
from datetime import datetime
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"

_dishes: list[dict] = []
_seasons: dict = {}


def _load_data():
    global _dishes, _seasons
    if not _dishes or not _seasons:
        with open(DATA_DIR / "dishes.json", "r", encoding="utf-8") as f:
            _dishes = json.load(f)
        with open(DATA_DIR / "seasons.json", "r", encoding="utf-8") as f:
            _seasons = json.load(f)


def get_current_season() -> str:
    _load_data()
    month = datetime.now().month
    return _seasons["month_to_season"][str(month)]


def get_current_solar_term() -> tuple[str, str]:
    _load_data()
    month = datetime.now().month
    for name, info in _seasons["solar_terms"].items():
        if month in info["month"]:
            return name, info["desc"]
    return "未知", ""


def _taste_distance(user_taste: dict, dish_taste: dict) -> float:
    """计算口味偏好与菜品口味的欧氏距离，距离越小越匹配"""
    keys = ["spicy", "sweet", "salty", "sour", "umami"]
    dist_sq = 0
    for k in keys:
        u = user_taste.get(k, 3)
        d = dish_taste.get(k, 0)
        dist_sq += (u - d) ** 2
    return math.sqrt(dist_sq)


def _score_dish(
    dish: dict,
    season: str,
    user_taste: dict,
    province: Optional[str] = None,
) -> float:
    score = 0.0

    if season in dish.get("seasons", []):
        score += 40

    max_dist = math.sqrt(5 * 25)
    dist = _taste_distance(user_taste, dish.get("taste", {}))
    taste_score = (1 - dist / max_dist) * 35
    score += max(taste_score, 0)

    if province:
        if dish.get("province") == province or dish.get("province") == "全国":
            score += 15
        elif dish.get("cuisine") in _get_province_cuisines(province):
            score += 8

    score += random.uniform(0, 10)

    return round(score, 2)


def _get_province_cuisines(province: str) -> list[str]:
    mapping = {
        "广东": ["粤菜"], "四川": ["川菜"], "重庆": ["川菜"],
        "湖南": ["湘菜"], "山东": ["鲁菜"], "浙江": ["浙菜"],
        "江苏": ["苏菜"], "福建": ["闽菜"], "北京": ["京菜"],
        "安徽": ["徽菜"], "河南": ["地方小吃"], "湖北": ["地方小吃"],
        "海南": ["地方小吃"], "新疆": ["西北菜"], "陕西": ["西北菜"],
        "甘肃": ["西北菜"], "黑龙江": ["东北菜"], "吉林": ["东北菜"],
        "辽宁": ["东北菜"], "贵州": ["云贵菜"], "云南": ["云贵菜"],
        "广西": ["地方小吃"],
    }
    return mapping.get(province, [])


def recommend_dishes(
    city: str = "全国",
    province: Optional[str] = None,
    spicy: int = 3,
    sweet: int = 3,
    salty: int = 3,
    sour: int = 3,
    count: int = 5,
) -> dict:
    _load_data()

    season = get_current_season()
    solar_term, solar_desc = get_current_solar_term()
    user_taste = {
        "spicy": spicy, "sweet": sweet,
        "salty": salty, "sour": sour, "umami": 3,
    }

    scored = []
    for dish in _dishes:
        s = _score_dish(dish, season, user_taste, province)
        scored.append((s, dish))

    scored.sort(key=lambda x: x[0], reverse=True)

    seen_cuisines = set()
    results = []
    for s, dish in scored:
        cuisine = dish.get("cuisine", "")
        if len(results) < count:
            if cuisine not in seen_cuisines or len(results) >= count - 1:
                results.append({**dish, "match_score": s})
                seen_cuisines.add(cuisine)

    return {
        "city": city,
        "province": province or "全国",
        "season": season,
        "solar_term": solar_term,
        "solar_term_desc": solar_desc,
        "dishes": results[:count],
    }


def get_all_cuisines() -> list[str]:
    _load_data()
    return sorted(set(d["cuisine"] for d in _dishes))


def get_all_provinces() -> list[str]:
    _load_data()
    provinces = sorted(set(d["province"] for d in _dishes))
    return [p for p in provinces if p != "全国"] + ["全国"]


def search_dishes(keyword: str, limit: int = 20) -> list[dict]:
    _load_data()
    results = []
    kw = keyword.lower()
    for dish in _dishes:
        if (kw in dish["name"].lower()
            or kw in dish.get("cuisine", "").lower()
            or kw in dish.get("province", "").lower()
            or any(kw in tag for tag in dish.get("tags", []))
            or any(kw in ing for ing in dish.get("ingredients", []))):
            results.append(dish)
        if len(results) >= limit:
            break
    return results


def get_dishes_by_province(province: str, limit: int = 20) -> list[dict]:
    _load_data()
    results = [d for d in _dishes if d.get("province") == province]
    return results[:limit]


def get_solar_terms_data() -> list[dict]:
    _load_data()
    season_cn = {"spring": "春", "summer": "夏", "autumn": "秋", "winter": "冬"}
    current_term, _ = get_current_solar_term()
    terms = []
    for name, info in _seasons["solar_terms"].items():
        terms.append({
            "name": name,
            "season": info["season"],
            "season_cn": season_cn.get(info["season"], ""),
            "month": info["month"][0],
            "desc": info["desc"],
            "is_current": name == current_term,
        })
    return terms


def get_dishes_by_season(season: str, count: int = 10) -> list[dict]:
    _load_data()
    matched = [d for d in _dishes if season in d.get("seasons", [])]
    random.shuffle(matched)
    return matched[:count]
