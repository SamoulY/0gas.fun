# GasFree Frontend

这个目录包含两部分：

- React + Vite 前端示例
- `hedge-demo` 静态对冲算法演示页

## 安装

```bash
cd frontend
npm install
```

## React 前端示例

开发模式：

```bash
npm run dev
```

默认地址：

```text
http://localhost:5173
```

环境变量：

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Hedge Demo

开发查看：

```bash
npm run hedge:dev
```

默认地址：

```text
http://localhost:5173/hedge-demo/index.html
```

刷新离线数据：

```bash
npm run hedge:data
```

只刷新指定标的：

```bash
python scripts/fetch_market_data.py --asset-ids BTC-USD QQQ GLD
```

构建前端：

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

输出位置：

- `frontend/dist/`
- `frontend/public/hedge-demo/dist/hedge-demo.single.html`
