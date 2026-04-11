const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const simulatorPath = path.resolve(
  __dirname,
  "../public/hedge-demo/lib/simulator.js"
);

const context = {
  window: {},
  console,
};
context.window = context;

vm.runInNewContext(fs.readFileSync(simulatorPath, "utf8"), context, {
  filename: simulatorPath,
});

const { applyTradeToPosition, runSimulation } = context.HedgeDemoSimulator;

const costExample = {
  shares: 10,
  netCost: 100,
  avgCost: 10,
};

applyTradeToPosition(costExample, "sell", 2, 12);
applyTradeToPosition(costExample, "buy", 1, 11);
applyTradeToPosition(costExample, "buy", 1, 10);

assert.equal(costExample.shares, 10);
assert.equal(Number(costExample.avgCost.toFixed(1)), 9.7, "expected diluted average cost to be 9.7");

const assetA = {
  meta: { id: "A", label: "Asset A" },
  candles: [
    { date: "2026-01-01", open: 100, high: 100, low: 100, close: 100, volume: 1 },
    { date: "2026-01-02", open: 100, high: 100, low: 100, close: 100, volume: 1 },
    { date: "2026-01-03", open: 100, high: 100, low: 100, close: 100, volume: 1 }
  ]
};

const assetB = {
  meta: { id: "B", label: "Asset B" },
  candles: [
    { date: "2026-01-01", open: 100, high: 100, low: 100, close: 100, volume: 1 },
    { date: "2026-01-02", open: 99.5, high: 99.5, low: 99.5, close: 99.5, volume: 1 },
    { date: "2026-01-03", open: 99.5, high: 99.5, low: 99.5, close: 99.5, volume: 1 }
  ]
};

const result = runSimulation(assetA, assetB, {
  thresholdPercent: 0.5,
  startDate: "2026-01-01",
  endDate: "2026-01-03",
  initialCapital: 200000,
});
const sellTrades = result.transactions.filter(
  (transaction) => transaction.phase === "rebalance" && transaction.type === "sell"
);
const buyTrades = result.transactions.filter(
  (transaction) => transaction.phase === "rebalance" && transaction.type === "buy"
);

assert.equal(sellTrades.length, 1, "expected one rebalance sell trade");
assert.equal(buyTrades.length, 1, "expected one rebalance buy trade");
assert.equal(sellTrades[0].date, "2026-01-02");
assert.equal(buyTrades[0].date, "2026-01-03");
assert.equal(result.summary.rebalanceCount, 1);
assert.equal(result.summary.initialCapital, 200000);
assert.equal(result.summary.overlap.start, "2026-01-01");
assert.equal(result.summary.overlap.end, "2026-01-03");
assert.equal(result.series.A.markers.filter((marker) => marker.side === "sell").length, 1);
assert.equal(result.series.B.markers.filter((marker) => marker.side === "buy").length, 2);

console.log("simulator smoke test passed");
