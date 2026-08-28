import urllib.request
import json

url = "http://localhost:8000/api/recommend?province=%E5%B9%BF%E4%B8%9C&spicy=1&sweet=3&count=3"
r = urllib.request.urlopen(url)
d = json.loads(r.read())

print(f"省份: {d['data']['province']} | 季节: {d['data']['season']} | 节气: {d['data']['solar_term']}")
print("-" * 40)
for i, x in enumerate(d["data"]["dishes"]):
    print(f"{i+1}. {x['name']} ({x['cuisine']}) - 匹配 {x['match_score']}")
    print(f"   难度:{x['difficulty']} | 时间:{x['cook_time']}min | 热量:{x['calories']}kcal")
    print()

url2 = "http://localhost:8000/api/search?keyword=%E8%B1%86%E8%85%90"
r2 = urllib.request.urlopen(url2)
d2 = json.loads(r2.read())
print(f"搜索「豆腐」: 找到 {d2['data']['total']} 道菜")
for x in d2["data"]["dishes"]:
    print(f"  - {x['name']} ({x['cuisine']})")
