# 食令 - 今天吃什么？

基于全国菜系数据 + 时令季节算法的智能选菜助手 MVP。

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python run.py

# 打开浏览器访问
# http://localhost:8000
```

## 功能

- 基于城市/省份 + 季节 + 口味偏好的智能推荐
- 50 道覆盖 8 大菜系的标准化菜品数据
- 菜品搜索（按菜名、食材、菜系）
- 完整的配方和做法步骤
- 移动端友好的 H5 界面

## 技术栈

- **后端:** Python 3.10 + FastAPI
- **前端:** 原生 HTML/CSS/JS（移动端适配）
- **数据:** JSON 文件（MVP 阶段）

## API

- `GET /api/recommend` - 智能推荐
- `GET /api/search?keyword=xxx` - 搜索菜品
- `GET /api/cuisines` - 菜系列表
- `GET /api/provinces` - 省份列表
