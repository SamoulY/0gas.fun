(function bootstrapDemo(global) {
  const provider = global.HedgeDemoDataProvider.createProvider();
  const simulator = global.HedgeDemoSimulator;
  const renderers = global.HedgeDemoRenderers;

  const state = {
    catalog: null,
    presets: null,
    charts: null,
    currentSimulation: null,
  };

  const dom = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    dom.presetSelect = $("presetSelect");
    dom.assetASelect = $("assetASelect");
    dom.assetBSelect = $("assetBSelect");
    dom.thresholdInput = $("thresholdInput");
    dom.startDateInput = $("startDateInput");
    dom.endDateInput = $("endDateInput");
    dom.initialCapitalInput = $("initialCapitalInput");
    dom.runSimulationButton = $("runSimulationButton");
    dom.resetViewButton = $("resetViewButton");
    dom.statusText = $("statusText");
    dom.statusDot = $("statusDot");
    dom.portfolioReturnValueWrap = $("portfolioReturnValueWrap");
    dom.portfolioReturnArrow = $("portfolioReturnArrow");
    dom.portfolioReturnValue = $("portfolioReturnValue");
    dom.portfolioValue = $("portfolioValue");
    dom.initialCapitalValue = $("initialCapitalValue");
    dom.rebalanceCount = $("rebalanceCount");
    dom.assetATitle = $("assetATitle");
    dom.assetBTitle = $("assetBTitle");
    dom.assetACostTitle = $("assetACostTitle");
    dom.assetBCostTitle = $("assetBCostTitle");
    dom.assetAMeta = $("assetAMeta");
    dom.assetBMeta = $("assetBMeta");
    dom.eventSummary = $("eventSummary");
    dom.eventList = $("eventList");
  }

  function setStatus(text, tone) {
    dom.statusText.textContent = text;
    dom.statusDot.className = "status-dot";
    if (tone) {
      dom.statusDot.classList.add(tone);
    }
  }

  function formatCurrency(value) {
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function disableActions(disabled) {
    const targets = [
      dom.runSimulationButton,
      dom.resetViewButton,
      dom.assetASelect,
      dom.assetBSelect,
      dom.thresholdInput,
      dom.startDateInput,
      dom.endDateInput,
      dom.initialCapitalInput,
      dom.presetSelect,
    ];

    for (const element of targets) {
      element.disabled = disabled;
    }
  }

  function populateAssetSelect(selectElement) {
    selectElement.innerHTML = "";
    for (const asset of state.catalog.assets) {
      const option = document.createElement("option");
      option.value = asset.id;
      option.textContent = `${asset.label} · ${asset.assetClass.toUpperCase()}`;
      selectElement.appendChild(option);
    }
  }

  function populatePresetSelect() {
    dom.presetSelect.innerHTML = "";

    const customOption = document.createElement("option");
    customOption.value = "";
    customOption.textContent = "自定义组合";
    dom.presetSelect.appendChild(customOption);

    for (const preset of state.presets.presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      dom.presetSelect.appendChild(option);
    }
  }

  function setSelectPair(assetAId, assetBId) {
    dom.assetASelect.value = assetAId;
    dom.assetBSelect.value = assetBId;
  }

  function applyPreset(presetId) {
    const preset = state.presets.presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setSelectPair(preset.assetA, preset.assetB);
    dom.thresholdInput.value = String(preset.thresholdPercent);
  }

  function syncPresetSelection() {
    const threshold = Number(dom.thresholdInput.value);
    const match = state.presets.presets.find(
      (preset) =>
        preset.assetA === dom.assetASelect.value &&
        preset.assetB === dom.assetBSelect.value &&
        Math.abs(Number(preset.thresholdPercent) - threshold) < 1e-6
    );

    dom.presetSelect.value = match ? match.id : "";
  }

  function ensureDifferentAssets(changedSide) {
    if (dom.assetASelect.value !== dom.assetBSelect.value) {
      return;
    }

    const fallback = state.catalog.assets.find((asset) => asset.id !== dom.assetASelect.value);
    if (!fallback) {
      return;
    }

    if (changedSide === "A") {
      dom.assetBSelect.value = fallback.id;
    } else {
      dom.assetASelect.value = fallback.id;
    }
  }

  function getDateBounds(assetPayload) {
    const candles = assetPayload.candles || [];
    return {
      start: candles[0]?.date ?? null,
      end: candles[candles.length - 1]?.date ?? null,
    };
  }

  function getOverlapWindow(boundsA, boundsB) {
    const start = boundsA.start > boundsB.start ? boundsA.start : boundsB.start;
    const end = boundsA.end < boundsB.end ? boundsA.end : boundsB.end;
    return start <= end ? { start, end } : null;
  }

  function clampDate(value, min, max, fallback) {
    if (!value) {
      return fallback;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  async function updateDateBounds(preserveSelection) {
    const [assetA, assetB] = await Promise.all([
      provider.loadAsset(dom.assetASelect.value),
      provider.loadAsset(dom.assetBSelect.value),
    ]);

    const overlap = getOverlapWindow(getDateBounds(assetA), getDateBounds(assetB));
    if (!overlap) {
      throw new Error("两个标的没有重叠时间窗口");
    }

    const nextStart = preserveSelection
      ? clampDate(dom.startDateInput.value, overlap.start, overlap.end, overlap.start)
      : overlap.start;
    const nextEnd = preserveSelection
      ? clampDate(dom.endDateInput.value, overlap.start, overlap.end, overlap.end)
      : overlap.end;

    dom.startDateInput.min = overlap.start;
    dom.startDateInput.max = overlap.end;
    dom.endDateInput.min = overlap.start;
    dom.endDateInput.max = overlap.end;
    dom.startDateInput.value = nextStart;
    dom.endDateInput.value = nextEnd < nextStart ? overlap.end : nextEnd;

    return overlap;
  }

  function updateReturnCard(summary) {
    const totalReturn = summary.totalReturnPct;
    let tone = "neutral";
    let arrow = "→";

    if (totalReturn > 0) {
      tone = "positive";
      arrow = "▲";
    } else if (totalReturn < 0) {
      tone = "negative";
      arrow = "▼";
    }

    dom.portfolioReturnValueWrap.className = `return-value ${tone}`;
    dom.portfolioReturnArrow.textContent = arrow;
    dom.portfolioReturnValue.textContent = renderers.formatPercent(totalReturn);
    dom.portfolioValue.textContent = `组合市值: ${formatCurrency(summary.portfolioValue)}`;
    dom.initialCapitalValue.textContent = `初始金额: ${formatCurrency(summary.initialCapital)}`;
    dom.rebalanceCount.textContent = `调仓次数: ${summary.rebalanceCount}`;
  }

  function updateAssetLabels(simulation) {
    const assetA = simulation.series.A.meta;
    const assetB = simulation.series.B.meta;
    const rangeText = `${simulation.overlap.start} 至 ${simulation.overlap.end}`;

    dom.assetATitle.textContent = assetA.label;
    dom.assetBTitle.textContent = assetB.label;
    dom.assetACostTitle.textContent = assetA.label;
    dom.assetBCostTitle.textContent = assetB.label;

    dom.assetAMeta.textContent = `${assetA.assetClass.toUpperCase()} · ${assetA.provider} · ${rangeText}`;
    dom.assetBMeta.textContent = `${assetB.assetClass.toUpperCase()} · ${assetB.provider} · ${rangeText}`;
  }

  function renderEvents(transactions) {
    const rows = transactions
      .filter((transaction) => transaction.phase === "rebalance")
      .slice()
      .reverse();

    dom.eventSummary.textContent = `买卖事件 ${rows.length} 条`;
    dom.eventList.innerHTML = "";

    if (!rows.length) {
      dom.eventList.innerHTML = '<div class="empty-state">当前阈值下没有触发新的对冲买卖。</div>';
      return;
    }

    for (const transaction of rows.slice(0, 12)) {
      const row = document.createElement("div");
      row.className = "event-row";

      const badge = transaction.type === "buy" ? "buy" : "sell";
      const badgeText = transaction.type === "buy" ? "B 买入" : "S 卖出";
      const title =
        transaction.type === "buy"
          ? `${transaction.assetLabel} 回补建仓`
          : `${transaction.assetLabel} 触发卖出`;
      const detail =
        transaction.type === "buy"
          ? `来自 ${transaction.linkedSellDate} 的待买现金`
          : `触发比例 ${transaction.triggerRatioPct.toFixed(2)}%，下一共同交易日买入 ${transaction.targetAssetLabel}`;

      row.innerHTML = `
        <div class="event-label">
          <span class="event-badge ${badge}">${badgeText}</span>
          <span class="event-date">${transaction.date}</span>
        </div>
        <div class="event-main">
          <div class="event-title">${title}</div>
          <div class="event-detail">${detail}</div>
        </div>
        <div class="event-main">
          <div class="event-title">价格 ${renderers.formatPrice(transaction.price)}</div>
          <div class="event-detail">数量 ${transaction.quantity.toLocaleString("en-US", {
            maximumFractionDigits: 6,
          })}</div>
        </div>
        <div class="event-value">
          <div class="event-title">${formatCurrency(transaction.cash)}</div>
          <div class="event-detail">${transaction.type === "sell" ? "卖出金额" : "买入金额"}</div>
        </div>
      `;

      dom.eventList.appendChild(row);
    }
  }

  async function rerun() {
    const assetAId = dom.assetASelect.value;
    const assetBId = dom.assetBSelect.value;
    const threshold = Number(dom.thresholdInput.value);
    const initialCapital = Number(dom.initialCapitalInput.value);
    let startDate = dom.startDateInput.value || null;
    let endDate = dom.endDateInput.value || null;

    if (!assetAId || !assetBId) {
      setStatus("请先选择两个标的", "error");
      return;
    }

    if (assetAId === assetBId) {
      setStatus("两个标的不能相同", "error");
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      const correctedEnd = startDate;
      dom.endDateInput.value = correctedEnd;
      endDate = correctedEnd;
    }

    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      setStatus("初始金额必须大于 0", "error");
      return;
    }

    disableActions(true);
    setStatus("读取离线行情并重新计算...", "loading");

    try {
      const [assetA, assetB] = await Promise.all([
        provider.loadAsset(assetAId),
        provider.loadAsset(assetBId),
      ]);

      const simulation = simulator.runSimulation(assetA, assetB, {
        thresholdPercent: threshold,
        startDate,
        endDate,
        initialCapital,
      });

      state.currentSimulation = simulation;
      updateReturnCard(simulation.summary);
      updateAssetLabels(simulation);
      renderers.renderCharts(state.charts, simulation);
      renderEvents(simulation.transactions);

      setStatus(
        `回测区间 ${simulation.overlap.start} 至 ${simulation.overlap.end}，阈值 ${threshold.toFixed(2)}%，初始金额 ${formatCurrency(initialCapital)}`,
        "success"
      );
    } catch (error) {
      state.currentSimulation = null;
      dom.eventSummary.textContent = "-";
      dom.eventList.innerHTML = `<div class="empty-state">${error.message}</div>`;
      setStatus(error.message, "error");
    } finally {
      disableActions(false);
    }
  }

  function bindEvents() {
    dom.runSimulationButton.addEventListener("click", rerun);
    dom.resetViewButton.addEventListener("click", () => renderers.resetCharts(state.charts));

    dom.presetSelect.addEventListener("change", async (event) => {
      if (!event.target.value) {
        return;
      }

      applyPreset(event.target.value);
      await updateDateBounds(false);
      await rerun();
    });

    dom.assetASelect.addEventListener("change", async () => {
      ensureDifferentAssets("A");
      syncPresetSelection();
      await updateDateBounds(false);
      await rerun();
    });

    dom.assetBSelect.addEventListener("change", async () => {
      ensureDifferentAssets("B");
      syncPresetSelection();
      await updateDateBounds(false);
      await rerun();
    });

    dom.thresholdInput.addEventListener("change", async () => {
      syncPresetSelection();
      await rerun();
    });
  }

  async function init() {
    cacheDom();
    dom.initialCapitalInput.value = String(simulator.DEFAULT_INITIAL_CAPITAL);

    state.charts = renderers.createCharts({
      klineA: "klineAChart",
      costA: "costAChart",
      klineB: "klineBChart",
      costB: "costBChart",
    });

    setStatus("加载候选标的与离线行情目录...", "loading");
    state.catalog = await provider.loadCatalog();
    state.presets = await provider.loadPresets();

    populateAssetSelect(dom.assetASelect);
    populateAssetSelect(dom.assetBSelect);
    populatePresetSelect();

    const initialPreset = state.presets.presets[0];
    if (initialPreset) {
      dom.presetSelect.value = initialPreset.id;
      applyPreset(initialPreset.id);
    } else if (state.catalog.assets.length >= 2) {
      setSelectPair(state.catalog.assets[0].id, state.catalog.assets[1].id);
    }

    await updateDateBounds(false);
    bindEvents();
    await rerun();
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
