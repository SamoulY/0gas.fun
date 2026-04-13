# Hedge Demo

独立静态演示页，演示两个标的之间的对冲调仓逻辑。

## 功能

- 两个标的分别显示日 K
- 每个标的下面显示持仓加权平均成本曲线
- 图上标记买入 `B` 和卖出 `S`
- 顶部可设置触发百分比、起始日期、结束日期、初始金额
- 支持分数股 / 分数币
- 使用本地离线行情 JSON，减少演示过程中的网络变量

## 目录

- `index.html`: 静态入口页
- `styles.css`: 样式
- `app.js`: UI 与状态管理
- `lib/`: 数据读取、仿真器、图表渲染
- `data/assets.catalog.json`: 候选标的清单
- `data/presets.json`: 预设组合
- `data/market/*.json`: 离线日线缓存
- `vendor/echarts.min.js`: 本地图表库
- `dist/hedge-demo.single.html`: 可双击打开的单文件版本

## 运行

开发模式：

```bash
cd frontend
npm run hedge:dev
```

打开：

```text
http://localhost:5173/hedge-demo/index.html
```

## 数据刷新

刷新全部候选标的：

```bash
npm run hedge:data
```

只刷新指定标的：

```bash
python scripts/fetch_market_data.py --asset-ids BTC-USD QQQ GLD
```

## 构建

标准前端构建：

```bash
npm run build
```

生成单文件 HTML：

```bash
npm run hedge:single
```

一键完成前端构建和单文件导出：

```bash
npm run hedge:build
```

## 输出

- `frontend/dist/`
- `frontend/public/hedge-demo/dist/hedge-demo.single.html`
