from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    import akshare as ak
except ImportError:  # pragma: no cover
    ak = None

try:
    import ccxt
except ImportError:  # pragma: no cover
    ccxt = None


ROOT = Path(__file__).resolve().parents[1] / "public" / "hedge-demo"
CATALOG_PATH = ROOT / "data" / "assets.catalog.json"


@dataclass
class FetchWindow:
    start: datetime
    end: datetime


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch offline market data for the hedge demo.")
    parser.add_argument(
        "--catalog",
        type=Path,
        default=CATALOG_PATH,
        help="Path to assets.catalog.json",
    )
    parser.add_argument(
        "--asset-ids",
        nargs="*",
        default=None,
        help="Optional subset of asset ids to refresh",
    )
    parser.add_argument(
        "--years",
        type=int,
        default=3,
        help="Number of years of daily candles to fetch",
    )
    return parser.parse_args()


def load_catalog(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def to_iso_date(value: Any) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def write_payload(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def filter_rows(rows: list[dict[str, Any]], window: FetchWindow) -> list[dict[str, Any]]:
    start_str = window.start.strftime("%Y-%m-%d")
    end_str = window.end.strftime("%Y-%m-%d")
    return [row for row in rows if start_str <= row["date"] <= end_str]


def normalise_dataframe(df: Any) -> list[dict[str, Any]]:
    frame = df.reset_index() if "date" not in df.columns else df.copy()
    frame.columns = [str(column) for column in frame.columns]

    column_map = {
        "date": "date",
        "日期": "date",
        "open": "open",
        "开盘": "open",
        "high": "high",
        "最高": "high",
        "low": "low",
        "最低": "low",
        "close": "close",
        "收盘": "close",
        "volume": "volume",
        "成交量": "volume",
    }

    renamed = {}
    for source, target in column_map.items():
        if source in frame.columns:
            renamed[source] = target

    frame = frame.rename(columns=renamed)
    required = ["date", "open", "high", "low", "close"]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise RuntimeError(f"缺少列: {', '.join(missing)}")

    records = []
    for _, row in frame.iterrows():
        records.append(
            {
                "date": to_iso_date(row["date"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row["volume"]) if "volume" in frame.columns else 0.0,
            }
        )

    return records


def fetch_ccxt_asset(asset: dict[str, Any], window: FetchWindow) -> list[dict[str, Any]]:
    if ccxt is None:
        raise RuntimeError("缺少 ccxt，请先安装: pip install ccxt")

    exchange_id = asset["exchange"]
    exchange_class = getattr(ccxt, exchange_id)
    exchange = exchange_class({"enableRateLimit": True})
    since_ms = int(window.start.timestamp() * 1000)
    end_ms = int(window.end.timestamp() * 1000)
    candle_ms = 24 * 60 * 60 * 1000
    rows: list[dict[str, Any]] = []

    try:
        while since_ms <= end_ms:
            batch = exchange.fetch_ohlcv(
                asset["symbol"],
                timeframe=asset.get("timeframe", "1d"),
                since=since_ms,
                limit=1000,
            )
            if not batch:
                break

            for ts, open_, high, low, close, volume in batch:
                if ts > end_ms:
                    break
                rows.append(
                    {
                        "date": datetime.fromtimestamp(ts / 1000, tz=UTC).strftime("%Y-%m-%d"),
                        "open": float(open_),
                        "high": float(high),
                        "low": float(low),
                        "close": float(close),
                        "volume": float(volume),
                    }
                )

            next_since = batch[-1][0] + candle_ms
            if next_since <= since_ms:
                break
            since_ms = next_since
            time.sleep(max(getattr(exchange, "rateLimit", 200), 200) / 1000)
    finally:
        close_method = getattr(exchange, "close", None)
        if callable(close_method):
            close_method()

    deduped = {row["date"]: row for row in rows}
    ordered = [deduped[date] for date in sorted(deduped)]
    return filter_rows(ordered, window)


def fetch_akshare_asset(asset: dict[str, Any], window: FetchWindow) -> list[dict[str, Any]]:
    if ak is None:
        raise RuntimeError("缺少 akshare，请先安装: pip install akshare")

    fetcher = asset.get("fetcher", "stock_us_daily")
    if fetcher == "stock_us_daily":
        frame = ak.stock_us_daily(symbol=asset["symbol"], adjust=asset.get("adjust", "qfq"))
    elif fetcher == "stock_zh_a_hist":
        frame = ak.stock_zh_a_hist(
            symbol=asset["symbol"],
            period="daily",
            start_date=window.start.strftime("%Y%m%d"),
            end_date=window.end.strftime("%Y%m%d"),
            adjust=asset.get("adjust", "qfq"),
        )
    elif fetcher == "fund_etf_hist_em":
        frame = ak.fund_etf_hist_em(
            symbol=asset["symbol"],
            period="daily",
            start_date=window.start.strftime("%Y%m%d"),
            end_date=window.end.strftime("%Y%m%d"),
            adjust=asset.get("adjust", "qfq"),
        )
    else:
        raise RuntimeError(f"不支持的 akshare fetcher: {fetcher}")

    return filter_rows(normalise_dataframe(frame), window)


def fetch_asset(asset: dict[str, Any], window: FetchWindow) -> list[dict[str, Any]]:
    provider = asset["provider"]
    if provider == "ccxt":
        return fetch_ccxt_asset(asset, window)
    if provider == "akshare":
        return fetch_akshare_asset(asset, window)
    raise RuntimeError(f"不支持的数据提供方: {provider}")


def main() -> int:
    args = parse_args()
    catalog = load_catalog(args.catalog)
    selected_ids = set(args.asset_ids or [])
    window = FetchWindow(
        start=datetime.now(tz=UTC) - timedelta(days=365 * args.years),
        end=datetime.now(tz=UTC),
    )

    assets = catalog.get("assets", [])
    if selected_ids:
        assets = [asset for asset in assets if asset["id"] in selected_ids]

    if not assets:
        print("没有匹配到任何标的。", file=sys.stderr)
        return 1

    for asset in assets:
        print(f"[fetch] {asset['id']} ({asset['provider']})")
        candles = fetch_asset(asset, window)
        if not candles:
            raise RuntimeError(f"{asset['id']} 没有拿到任何行情")

        payload = {
            "version": 1,
            "meta": {
                "id": asset["id"],
                "label": asset["label"],
                "assetClass": asset["assetClass"],
                "provider": asset["provider"],
                "symbol": asset["symbol"],
                "currency": asset.get("currency", "USD"),
                "windowStart": window.start.strftime("%Y-%m-%d"),
                "windowEnd": window.end.strftime("%Y-%m-%d"),
                "updatedAt": datetime.now(tz=UTC).isoformat(),
            },
            "candles": candles,
        }

        output_path = ROOT / "data" / asset["cacheFile"]
        write_payload(output_path, payload)
        print(f"[saved] {output_path.relative_to(ROOT)} ({len(candles)} rows)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
