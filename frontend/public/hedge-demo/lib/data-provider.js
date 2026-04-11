(function attachDataProvider(global) {
  const EMBEDDED_KEY = "__HEDGE_DEMO_EMBEDDED__";

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function fetchJson(relativePath) {
    const url = new URL(relativePath, global.location.href);
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`无法读取离线数据: ${relativePath} (${response.status})`);
    }

    return response.json();
  }

  class DemoDataProvider {
    constructor() {
      this.embedded = global[EMBEDDED_KEY] || null;
      this.catalogPromise = null;
      this.presetsPromise = null;
      this.assetCache = new Map();
    }

    async loadCatalog() {
      if (!this.catalogPromise) {
        this.catalogPromise = this.embedded?.catalog
          ? Promise.resolve(this.embedded.catalog)
          : fetchJson("./data/assets.catalog.json");
      }

      return cloneJson(await this.catalogPromise);
    }

    async loadPresets() {
      if (!this.presetsPromise) {
        this.presetsPromise = this.embedded?.presets
          ? Promise.resolve(this.embedded.presets)
          : fetchJson("./data/presets.json");
      }

      return cloneJson(await this.presetsPromise);
    }

    async loadAsset(assetId) {
      if (this.assetCache.has(assetId)) {
        return cloneJson(this.assetCache.get(assetId));
      }

      const catalog = await this.loadCatalog();
      const asset = (catalog.assets || []).find((item) => item.id === assetId);
      if (!asset) {
        throw new Error(`候选标的不存在: ${assetId}`);
      }

      let payload;
      if (this.embedded?.marketData?.[assetId]) {
        payload = this.embedded.marketData[assetId];
      } else {
        payload = await fetchJson(`./data/${asset.cacheFile}`);
      }

      if (!payload?.candles?.length) {
        throw new Error(`离线行情为空: ${asset.label}`);
      }

      const mergedPayload = {
        ...payload,
        meta: {
          ...asset,
          ...(payload.meta || {}),
        },
      };

      this.assetCache.set(assetId, mergedPayload);
      return cloneJson(mergedPayload);
    }
  }

  global.HedgeDemoDataProvider = {
    createProvider() {
      return new DemoDataProvider();
    },
  };
})(window);
