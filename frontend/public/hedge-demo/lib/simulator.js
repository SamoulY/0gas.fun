(function attachSimulator(global) {
  const EPSILON = 1e-9;
  const DEFAULT_INITIAL_CAPITAL = 100000;

  function round(value, digits) {
    return Number(value.toFixed(digits));
  }

  function asNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normaliseCandles(payload) {
    return (payload.candles || [])
      .map((candle) => ({
        date: String(candle.date),
        open: asNumber(candle.open),
        high: asNumber(candle.high),
        low: asNumber(candle.low),
        close: asNumber(candle.close),
        volume: asNumber(candle.volume) ?? 0,
      }))
      .filter((candle) =>
        candle.date &&
        candle.open !== null &&
        candle.high !== null &&
        candle.low !== null &&
        candle.close !== null
      )
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function buildMap(candles) {
    return new Map(candles.map((candle) => [candle.date, candle]));
  }

  function getOverlapWindow(candlesA, candlesB) {
    const start = candlesA[0].date > candlesB[0].date ? candlesA[0].date : candlesB[0].date;
    const end =
      candlesA[candlesA.length - 1].date < candlesB[candlesB.length - 1].date
        ? candlesA[candlesA.length - 1].date
        : candlesB[candlesB.length - 1].date;

    return start <= end ? { start, end } : null;
  }

  function clampWindow(overlapWindow, requestedStart, requestedEnd) {
    const start = requestedStart && requestedStart > overlapWindow.start ? requestedStart : overlapWindow.start;
    const end = requestedEnd && requestedEnd < overlapWindow.end ? requestedEnd : overlapWindow.end;
    return { start, end };
  }

  function filterByWindow(candles, window) {
    return candles.filter((candle) => candle.date >= window.start && candle.date <= window.end);
  }

  function intersectDates(candlesA, candlesB) {
    const datesA = new Set(candlesA.map((candle) => candle.date));
    return candlesB.map((candle) => candle.date).filter((date) => datesA.has(date));
  }

  function unionDates(candlesA, candlesB, startDate) {
    const seen = new Set();
    const ordered = [];

    for (const candle of [...candlesA, ...candlesB].sort((left, right) => left.date.localeCompare(right.date))) {
      if (candle.date < startDate || seen.has(candle.date)) {
        continue;
      }

      seen.add(candle.date);
      ordered.push(candle.date);
    }

    return ordered;
  }

  function nextCommonDate(commonDates, currentDate) {
    for (const date of commonDates) {
      if (date > currentDate) {
        return date;
      }
    }

    return null;
  }

  function createPosition(initialCash, initialPrice) {
    const shares = initialCash / initialPrice;
    return {
      shares,
      netCost: initialCash,
      avgCost: shares > EPSILON ? initialCash / shares : null,
    };
  }

  function applyTradeToPosition(position, side, quantity, price) {
    const cash = quantity * price;

    if (side === "buy") {
      position.shares += quantity;
      position.netCost += cash;
    } else {
      position.shares -= quantity;
      position.netCost -= cash;
    }

    if (position.shares <= EPSILON) {
      position.shares = 0;
      position.netCost = 0;
      position.avgCost = null;
    } else {
      position.avgCost = position.netCost / position.shares;
    }

    return cash;
  }

  function createMarker(side, date, price, reason) {
    return {
      side,
      label: side === "buy" ? "B" : "S",
      date,
      price: round(price, 4),
      reason,
    };
  }

  function parseOptions(thresholdOrOptions) {
    if (typeof thresholdOrOptions === "object" && thresholdOrOptions !== null) {
      return {
        thresholdPercent: Number(thresholdOrOptions.thresholdPercent),
        startDate: thresholdOrOptions.startDate || null,
        endDate: thresholdOrOptions.endDate || null,
        initialCapital: Number(thresholdOrOptions.initialCapital ?? DEFAULT_INITIAL_CAPITAL),
      };
    }

    return {
      thresholdPercent: Number(thresholdOrOptions),
      startDate: null,
      endDate: null,
      initialCapital: DEFAULT_INITIAL_CAPITAL,
    };
  }

  function buildSummary({
    assetAId,
    assetBId,
    state,
    transactions,
    portfolioCurve,
    configuredCapital,
    thresholdPercent,
    requestedRange,
    overlap,
  }) {
    const finalPoint = portfolioCurve[portfolioCurve.length - 1];
    const rebalanceCount = transactions.filter(
      (transaction) => transaction.phase === "rebalance" && transaction.type === "sell"
    ).length;

    return {
      thresholdPercent,
      requestedRange,
      overlap,
      initialCapital: configuredCapital,
      latestDate: finalPoint.date,
      portfolioValue: round(finalPoint.value, 2),
      totalReturnPct: round(finalPoint.returnPct, 2),
      rebalanceCount,
      assetValueA: round(state.positionA.shares * state.lastCloseA, 2),
      assetValueB: round(state.positionB.shares * state.lastCloseB, 2),
      assetAId,
      assetBId,
    };
  }

  function runSimulation(assetAPayload, assetBPayload, thresholdOrOptions) {
    const options = parseOptions(thresholdOrOptions);
    const thresholdValue = options.thresholdPercent;
    const configuredCapital = options.initialCapital;

    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
      throw new Error("触发百分比必须大于 0");
    }

    if (!Number.isFinite(configuredCapital) || configuredCapital <= 0) {
      throw new Error("初始金额必须大于 0");
    }

    if (options.startDate && options.endDate && options.startDate > options.endDate) {
      throw new Error("起始日期不能晚于结束日期");
    }

    const thresholdRate = thresholdValue / 100;
    const candlesA = normaliseCandles(assetAPayload);
    const candlesB = normaliseCandles(assetBPayload);

    if (!candlesA.length || !candlesB.length) {
      throw new Error("离线行情不足，无法回测");
    }

    const fullOverlap = getOverlapWindow(candlesA, candlesB);
    if (!fullOverlap) {
      throw new Error("两个标的没有重叠时间窗口");
    }

    const requestedRange = clampWindow(fullOverlap, options.startDate, options.endDate);
    if (requestedRange.start > requestedRange.end) {
      throw new Error("所选日期区间超出可回测范围");
    }

    const scopedA = filterByWindow(candlesA, requestedRange);
    const scopedB = filterByWindow(candlesB, requestedRange);
    const commonDates = intersectDates(scopedA, scopedB);

    if (commonDates.length < 2) {
      throw new Error("所选区间的共同交易日不足，无法完成买卖配平");
    }

    const startDate = commonDates[0];
    const dates = unionDates(scopedA, scopedB, startDate);
    const mapA = buildMap(scopedA);
    const mapB = buildMap(scopedB);
    const commonDateSet = new Set(commonDates);

    const initialCandleA = mapA.get(startDate);
    const initialCandleB = mapB.get(startDate);

    const state = {
      positionA: createPosition(configuredCapital / 2, initialCandleA.close),
      positionB: createPosition(configuredCapital / 2, initialCandleB.close),
      lastCloseA: initialCandleA.close,
      lastCloseB: initialCandleB.close,
      pendingTransfer: null,
    };

    const series = {
      A: {
        meta: assetAPayload.meta,
        candles: scopedA,
        costHistory: [[startDate, round(state.positionA.avgCost, 4)]],
        markers: [createMarker("buy", startDate, initialCandleA.close, "初始建仓")],
      },
      B: {
        meta: assetBPayload.meta,
        candles: scopedB,
        costHistory: [[startDate, round(state.positionB.avgCost, 4)]],
        markers: [createMarker("buy", startDate, initialCandleB.close, "初始建仓")],
      },
    };

    const transactions = [
      {
        type: "buy",
        phase: "initial",
        assetKey: "A",
        assetId: assetAPayload.meta.id,
        assetLabel: assetAPayload.meta.label,
        date: startDate,
        price: round(initialCandleA.close, 4),
        quantity: round(state.positionA.shares, 6),
        cash: round(configuredCapital / 2, 2),
      },
      {
        type: "buy",
        phase: "initial",
        assetKey: "B",
        assetId: assetBPayload.meta.id,
        assetLabel: assetBPayload.meta.label,
        date: startDate,
        price: round(initialCandleB.close, 4),
        quantity: round(state.positionB.shares, 6),
        cash: round(configuredCapital / 2, 2),
      },
    ];

    const portfolioCurve = [
      {
        date: startDate,
        value: configuredCapital,
        returnPct: 0,
      },
    ];

    for (const date of dates.slice(1)) {
      const candleA = mapA.get(date);
      const candleB = mapB.get(date);
      const tradedA = Boolean(candleA);
      const tradedB = Boolean(candleB);

      if (tradedA) {
        state.lastCloseA = candleA.close;
      }

      if (tradedB) {
        state.lastCloseB = candleB.close;
      }

      let executedPendingBuyToday = false;

      if (state.pendingTransfer && commonDateSet.has(date) && date > state.pendingTransfer.sellDate) {
        const targetKey = state.pendingTransfer.targetKey;
        const targetCandle = targetKey === "A" ? candleA : candleB;
        const targetSeries = series[targetKey];
        const targetPosition = targetKey === "A" ? state.positionA : state.positionB;
        const targetPrice = targetCandle.close;
        const buyQuantity = state.pendingTransfer.cash / targetPrice;

        applyTradeToPosition(targetPosition, "buy", buyQuantity, targetPrice);

        targetSeries.markers.push(
          createMarker("buy", date, targetPrice, "共同交易日完成对冲买入")
        );
        transactions.push({
          type: "buy",
          phase: "rebalance",
          assetKey: targetKey,
          assetId: targetSeries.meta.id,
          assetLabel: targetSeries.meta.label,
          date,
          price: round(targetPrice, 4),
          quantity: round(buyQuantity, 6),
          cash: round(state.pendingTransfer.cash, 2),
          linkedSellDate: state.pendingTransfer.sellDate,
        });

        state.pendingTransfer = null;
        executedPendingBuyToday = true;
      }

      if (!executedPendingBuyToday && !state.pendingTransfer) {
        const valueA = state.positionA.shares * state.lastCloseA;
        const valueB = state.positionB.shares * state.lastCloseB;
        const largerKey = valueA >= valueB ? "A" : "B";
        const smallerKey = largerKey === "A" ? "B" : "A";
        const largerValue = Math.max(valueA, valueB);
        const diffValue = Math.abs(valueA - valueB);
        const largerTradesToday = largerKey === "A" ? tradedA : tradedB;

        if (largerTradesToday && largerValue > EPSILON) {
          const triggerRatio = diffValue / largerValue;
          const scheduledBuyDate = nextCommonDate(commonDates, date);

          if (scheduledBuyDate && triggerRatio + EPSILON >= thresholdRate) {
            const sellAmount = diffValue / 2;
            const sellCandle = largerKey === "A" ? candleA : candleB;
            const sellPosition = largerKey === "A" ? state.positionA : state.positionB;
            const sellSeries = series[largerKey];
            const sellPrice = sellCandle.close;
            const sellQuantity = Math.min(sellPosition.shares, sellAmount / sellPrice);

            if (sellQuantity > EPSILON) {
              const cash = applyTradeToPosition(sellPosition, "sell", sellQuantity, sellPrice);

              sellSeries.markers.push(
                createMarker("sell", date, sellPrice, "超出阈值后卖出差额的一半")
              );
              transactions.push({
                type: "sell",
                phase: "rebalance",
                assetKey: largerKey,
                assetId: sellSeries.meta.id,
                assetLabel: sellSeries.meta.label,
                date,
                price: round(sellPrice, 4),
                quantity: round(sellQuantity, 6),
                cash: round(cash, 2),
                diffValue: round(diffValue, 2),
                triggerRatioPct: round(triggerRatio * 100, 4),
                scheduledBuyDate,
                targetAssetId: series[smallerKey].meta.id,
                targetAssetLabel: series[smallerKey].meta.label,
              });

              state.pendingTransfer = {
                targetKey: smallerKey,
                cash,
                sellDate: date,
              };
            }
          }
        }
      }

      if (tradedA) {
        series.A.costHistory.push([
          date,
          state.positionA.shares > EPSILON && state.positionA.avgCost !== null
            ? round(state.positionA.avgCost, 4)
            : null,
        ]);
      }

      if (tradedB) {
        series.B.costHistory.push([
          date,
          state.positionB.shares > EPSILON && state.positionB.avgCost !== null
            ? round(state.positionB.avgCost, 4)
            : null,
        ]);
      }

      const portfolioValue =
        state.positionA.shares * state.lastCloseA +
        state.positionB.shares * state.lastCloseB +
        (state.pendingTransfer ? state.pendingTransfer.cash : 0);

      portfolioCurve.push({
        date,
        value: round(portfolioValue, 2),
        returnPct: round(((portfolioValue / configuredCapital) - 1) * 100, 4),
      });
    }

    const actualRange = {
      start: startDate,
      end: dates[dates.length - 1],
    };

    return {
      overlap: actualRange,
      availableRange: fullOverlap,
      requestedRange,
      series,
      transactions,
      portfolioCurve,
      summary: buildSummary({
        assetAId: assetAPayload.meta.id,
        assetBId: assetBPayload.meta.id,
        state,
        transactions,
        portfolioCurve,
        configuredCapital,
        thresholdPercent: thresholdValue,
        requestedRange,
        overlap: actualRange,
      }),
    };
  }

  global.HedgeDemoSimulator = {
    DEFAULT_INITIAL_CAPITAL,
    applyTradeToPosition,
    runSimulation,
  };
})(window);
