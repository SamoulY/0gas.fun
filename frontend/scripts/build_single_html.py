from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "public" / "hedge-demo"
INDEX_PATH = ROOT / "index.html"
OUTPUT_PATH = ROOT / "dist" / "hedge-demo.single.html"


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_embedded_payload() -> dict:
    catalog = json.loads(load_text(ROOT / "data" / "assets.catalog.json"))
    presets = json.loads(load_text(ROOT / "data" / "presets.json"))
    market_data = {}

    for asset in catalog.get("assets", []):
        market_path = ROOT / "data" / asset["cacheFile"]
        market_data[asset["id"]] = json.loads(load_text(market_path))

    return {
        "catalog": catalog,
        "presets": presets,
        "marketData": market_data,
    }


def main() -> int:
    html = load_text(INDEX_PATH)
    embedded_payload = json.dumps(load_embedded_payload(), ensure_ascii=False)

    replacements = {
        '<link rel="stylesheet" href="./styles.css" />': f"<style>\n{load_text(ROOT / 'styles.css')}\n</style>",
        '<script src="./vendor/echarts.min.js"></script>': f"<script>\n{load_text(ROOT / 'vendor' / 'echarts.min.js')}\n</script>",
        '<script src="./lib/data-provider.js"></script>': (
            f"<script>\nwindow.__HEDGE_DEMO_EMBEDDED__ = {embedded_payload};\n</script>\n"
            f"<script>\n{load_text(ROOT / 'lib' / 'data-provider.js')}\n</script>"
        ),
        '<script src="./lib/simulator.js"></script>': f"<script>\n{load_text(ROOT / 'lib' / 'simulator.js')}\n</script>",
        '<script src="./lib/renderers.js"></script>': f"<script>\n{load_text(ROOT / 'lib' / 'renderers.js')}\n</script>",
        '<script src="./app.js"></script>': f"<script>\n{load_text(ROOT / 'app.js')}\n</script>",
    }

    for source, target in replacements.items():
        html = html.replace(source, target)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(html, encoding="utf-8")
    print(f"generated: {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
