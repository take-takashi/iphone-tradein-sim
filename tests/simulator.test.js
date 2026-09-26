const test = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../simulator.js');

const config = {
  horizon: 12,
  currentQuote: 74000,
  currentAge: 3,
  currentTerminalValue: 10000,
  standardPrice: 150000,
  proPrice: 200000,
  batteryAge: 4,
  standardBatteryCost: 20000,
  proBatteryCost: 25000,
  standardRepairPerYear: 2000,
  proRepairPerYear: 2500,
  tradeIns: {
    standard: { 1: 75000, 2: 57000, 3: 40000, 4: 28000, 5: 18000, 6: 10000 },
    pro: { 1: 100000, 2: 76000, 3: 55000, 4: 38000, 5: 24000, 6: 14000 }
  }
};
const base = { purchaseFactor: 1, tradeInFactor: 1, repairFactor: 1 };
const policy = (model, cycle) => ({
  id: `${model}-${cycle}`, name: `${model}-${cycle}`, type: 'cycle', model, cycle
});

test('all policies compare across the same horizon and include a terminal asset value', () => {
  const result = simulate(policy('standard', 3), config, base);
  assert.equal(result.horizon, 12);
  assert.equal(result.totals.purchases, 600000);
  assert.equal(result.totals.tradeIns, 194000); // 74,000 now + 3 x 40,000
  assert.equal(result.totals.terminalValue, 40000);
  assert.equal(result.netCost, 464000);
  assert.equal(result.monthlyCost, 464000 / 144);
  assert.deepEqual(result.events.filter(event => event.kind === 'purchases' && event.year > 0).map(event => event.year), [3, 6, 9]);
});

test('opening value is common; selling now credits the same serial quote exactly once', () => {
  const sold = simulate(policy('standard', 3), config, base);
  const kept = simulate({ id: 'keep', name: 'keep', type: 'keep' }, config, base);
  assert.equal(sold.totals.openingAsset, 74000);
  assert.equal(sold.totals.tradeIns - 120000, 74000); // initial quote plus later trade-ins
  assert.equal(sold.upfrontOutlay, 150000 - 74000);
  assert.equal(kept.totals.openingAsset, 74000);
  assert.equal(kept.totals.tradeIns, 0);
  assert.equal(kept.upfrontOutlay, 0);
  assert.equal(kept.totals.terminalValue, 10000);
});

test('changing the current quote does not distort buy-now costs, but changes the keep-phone opportunity cost', () => {
  const originalSale = simulate(policy('standard', 3), config, base);
  const originalKeep = simulate({ id: 'keep', name: 'keep', type: 'keep' }, config, base);
  const revised = { ...config, currentQuote: 84000 };
  const revisedSale = simulate(policy('standard', 3), revised, base);
  const revisedKeep = simulate({ id: 'keep', name: 'keep', type: 'keep' }, revised, base);
  assert.equal(revisedSale.netCost, originalSale.netCost);
  assert.equal(revisedSale.upfrontOutlay, 150000 - 84000);
  assert.equal(revisedKeep.netCost - originalKeep.netCost, 10000);
});

test('holding the current phone and buying a Pro have distinct outlays and expenses', () => {
  const kept = simulate({ id: 'keep', name: 'keep', type: 'keep' }, config, base);
  const pro = simulate(policy('pro', 3), config, base);
  assert.equal(kept.netCost, 119000); // 74k opening + 25k battery + 30k repairs - 10k terminal value
  assert.equal(pro.netCost, 610000);
  assert.equal(pro.upfrontOutlay, 200000 - 74000);
  assert.equal(pro.totals.purchases, 800000);
  assert.equal(pro.totals.terminalValue, 55000);
});

test('future multipliers change future assumptions but not the initial quote or first purchase', () => {
  const highPrice = simulate(policy('standard', 3), config, {
    purchaseFactor: 1.1, tradeInFactor: 0.8, repairFactor: 1.3
  });
  assert.equal(highPrice.upfrontOutlay, 76000);
  assert.equal(highPrice.events.find(event => event.kind === 'purchases').amount, 150000);
  assert.equal(highPrice.events.find(event => event.kind === 'tradeIns').amount, -74000);
  assert.equal(highPrice.events.filter(event => event.kind === 'purchases')[1].amount, 165000);
});

test('battery replacement is included only when a device is kept beyond the assumed replacement age', () => {
  const threeYear = simulate(policy('standard', 3), config, base);
  const sixYear = simulate(policy('standard', 6), config, base);
  assert.equal(threeYear.totals.battery, 0);
  assert.equal(sixYear.totals.battery, 40000);
});
