(function attachRenderers(global) {
  const UP_COLOR = "#138a4e";
  const DOWN_COLOR = "#c73434";
  const NEUTRAL_COLOR = "#4b5563";
  const COST_COLOR = "#1954d1";
  const BUY_MARKER_COLOR = "#4caf6c";
  const SELL_MARKER_COLOR = "#d96a5f";

  function formatPrice(value) {
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPercent(value) {
    const numeric = Number(value);
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${numeric.toFixed(2)}%`;
  }

  function markerSeries(name, data, color, labelPosition) {
    return {
      name,
      type: "scatter",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: data.map((item) => ({
        value: [item.date, item.price],
        label: {
          show: true,
          formatter: item.label,
          color: "#0b1220",
          fontWeight: 800,
          fontSize: 11,
          position: labelPosition,
        },
        itemStyle: {
          color,
          borderColor: color,
        },
      })),
      symbol: "roundRect",
      symbolSize: [22, 18],
      itemStyle: {
        shadowBlur: 8,
        shadowColor: "rgba(15, 23, 42, 0.12)",
      },
      tooltip: {
        valueFormatter: (value) => formatPrice(Array.isArray(value) ? value[1] : value),
      },
    };
  }

  function buildKlineOption(title, simulationSeries) {
    const dates = simulationSeries.candles.map((candle) => candle.date);
    const values = simulationSeries.candles.map((candle) => [
      candle.open,
      candle.close,
      candle.low,
      candle.high,
    ]);
    const buys = simulationSeries.markers.filter((marker) => marker.side === "buy");
    const sells = simulationSeries.markers.filter((marker) => marker.side === "sell");

    return {
      animation: false,
      backgroundColor: "transparent",
      grid: {
        left: 48,
        right: 18,
        top: 18,
        bottom: 60,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(17, 24, 39, 0.92)",
        borderWidth: 0,
        textStyle: { color: "#f8fafc" },
        formatter(params) {
          const candleItem = params.find((item) => item.seriesType === "candlestick");
          if (!candleItem) {
            return "";
          }

          const [open, close, low, high] = candleItem.data;
          return [
            `<strong>${title}</strong>`,
            candleItem.axisValue,
            `开盘: ${formatPrice(open)}`,
            `收盘: ${formatPrice(close)}`,
            `最低: ${formatPrice(low)}`,
            `最高: ${formatPrice(high)}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: "#9aa6b2" } },
        axisLabel: { color: NEUTRAL_COLOR },
      },
      yAxis: {
        scale: true,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e7edf5" } },
        axisLabel: { color: NEUTRAL_COLOR },
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "filter",
        },
        {
          type: "slider",
          xAxisIndex: 0,
          height: 18,
          bottom: 16,
          fillerColor: "rgba(25, 84, 209, 0.15)",
          borderColor: "#c9d4e2",
        },
      ],
      series: [
        {
          type: "candlestick",
          data: values,
          itemStyle: {
            color: UP_COLOR,
            color0: DOWN_COLOR,
            borderColor: UP_COLOR,
            borderColor0: DOWN_COLOR,
          },
        },
        markerSeries("买入", buys, BUY_MARKER_COLOR, "bottom"),
        markerSeries("卖出", sells, SELL_MARKER_COLOR, "top"),
      ],
    };
  }

  function buildCostOption(title, simulationSeries) {
    const dates = simulationSeries.costHistory.map((point) => point[0]);
    const values = simulationSeries.costHistory.map((point) => point[1]);

    return {
      animation: false,
      backgroundColor: "transparent",
      grid: {
        left: 48,
        right: 18,
        top: 24,
        bottom: 42,
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(17, 24, 39, 0.92)",
        borderWidth: 0,
        textStyle: { color: "#f8fafc" },
        formatter(params) {
          const value = params[0]?.data;
          return [
            `<strong>${title}</strong>`,
            params[0]?.axisValue ?? "",
            value == null ? "空仓" : `成本: ${formatPrice(value)}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: "#9aa6b2" } },
        axisLabel: { color: NEUTRAL_COLOR },
      },
      yAxis: {
        scale: true,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e7edf5" } },
        axisLabel: { color: NEUTRAL_COLOR },
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "filter",
        },
        {
          type: "slider",
          xAxisIndex: 0,
          height: 16,
          bottom: 8,
          fillerColor: "rgba(25, 84, 209, 0.12)",
          borderColor: "#c9d4e2",
        },
      ],
      series: [
        {
          name: "平均成本",
          type: "line",
          data: values,
          connectNulls: false,
          symbol: "circle",
          symbolSize: 5,
          showSymbol: false,
          lineStyle: {
            color: COST_COLOR,
            width: 2.6,
          },
          itemStyle: {
            color: COST_COLOR,
          },
          areaStyle: {
            color: "rgba(25, 84, 209, 0.08)",
          },
        },
      ],
    };
  }

  function bindColumnZoom(source, target) {
    let syncing = false;
    source.on("dataZoom", (payload) => {
      if (syncing) {
        return;
      }

      const event = payload.batch ? payload.batch[0] : payload;
      syncing = true;
      target.dispatchAction({
        type: "dataZoom",
        start: event.start,
        end: event.end,
        startValue: event.startValue,
        endValue: event.endValue,
      });
      syncing = false;
    });
  }

  function createCharts(domIds) {
    const instances = {
      klineA: echarts.init(document.getElementById(domIds.klineA), null, { renderer: "canvas" }),
      costA: echarts.init(document.getElementById(domIds.costA), null, { renderer: "canvas" }),
      klineB: echarts.init(document.getElementById(domIds.klineB), null, { renderer: "canvas" }),
      costB: echarts.init(document.getElementById(domIds.costB), null, { renderer: "canvas" }),
    };

    bindColumnZoom(instances.klineA, instances.costA);
    bindColumnZoom(instances.costA, instances.klineA);
    bindColumnZoom(instances.klineB, instances.costB);
    bindColumnZoom(instances.costB, instances.klineB);

    const resizeAll = () => {
      Object.values(instances).forEach((chart) => chart.resize());
    };

    global.addEventListener("resize", resizeAll);

    return {
      ...instances,
      resizeAll,
    };
  }

  function renderCharts(charts, simulation) {
    charts.klineA.setOption(buildKlineOption(simulation.series.A.meta.label, simulation.series.A), true);
    charts.costA.setOption(buildCostOption(simulation.series.A.meta.label, simulation.series.A), true);
    charts.klineB.setOption(buildKlineOption(simulation.series.B.meta.label, simulation.series.B), true);
    charts.costB.setOption(buildCostOption(simulation.series.B.meta.label, simulation.series.B), true);
  }

  function resetCharts(charts) {
    for (const chart of [charts.klineA, charts.costA, charts.klineB, charts.costB]) {
      chart.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
      });
    }
  }

  global.HedgeDemoRenderers = {
    createCharts,
    renderCharts,
    resetCharts,
    formatPrice,
    formatPercent,
  };
})(window);
