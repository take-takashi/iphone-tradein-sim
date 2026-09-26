(function (root) {
  'use strict';

  function estimateForAge(estimates, age) {
    const value = estimates && estimates[String(age)];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`購入後${age}年の期末残価の仮定を入力してください。`);
    }
    return value;
  }

  function simulate(policy, config, profile) {
    const horizon = Number(config.horizon);
    const currentQuote = Number(config.currentQuote);
    const currentAge = Number(config.currentAge);
    const repairFactor = Number(profile.repairFactor);
    const tradeInFactor = Number(profile.tradeInFactor);
    const purchaseFactor = Number(profile.purchaseFactor);
    if (!(horizon > 0) || !Number.isInteger(horizon)) throw new Error('評価期間は1年以上の整数で入力してください。');
    if (![currentQuote, currentAge, repairFactor, tradeInFactor, purchaseFactor].every(Number.isFinite)) {
      throw new Error('金額・使用年数・シナリオ倍率を確認してください。');
    }

    const events = [];
    const totals = { openingAsset: currentQuote, purchases: 0, tradeIns: 0, battery: 0, repairs: 0, terminalValue: 0 };
    events.push({ year: 0, kind: 'opening', label: '開始時の保有端末価値（全方針共通）', amount: currentQuote });

    const add = (year, kind, label, amount) => {
      const safeAmount = Number(amount);
      if (!Number.isFinite(safeAmount)) throw new Error('入力値の計算に失敗しました。');
      events.push({ year, kind, label, amount: safeAmount });
      if (Object.prototype.hasOwnProperty.call(totals, kind)) {
        if (kind === 'tradeIns' || kind === 'terminalValue') totals[kind] += Math.abs(safeAmount);
        else totals[kind] += safeAmount;
      }
    };

    let upfrontOutlay = 0;
    let terminalAge = null;
    let terminalModel = null;

    if (policy.type === 'keep') {
      const model = 'pro';
      const annualRepair = Number(config.proRepairPerYear) * repairFactor;
      const repairTotal = annualRepair * horizon;
      if (repairTotal) add(horizon, 'repairs', `修理費予備費（${yenText(annualRepair)}円/年 × ${horizon}年）`, repairTotal);

      const batteryAge = Number(config.batteryAge);
      const batteryCost = Number(config.proBatteryCost) * repairFactor;
      if (batteryAge >= currentAge && batteryAge < currentAge + horizon) {
        const atYear = batteryAge - currentAge;
        if (batteryCost) add(atYear, 'battery', `iPhone 15 Proの電池交換（使用${batteryAge}年目の仮定）`, batteryCost);
      }

      const residual = Number(config.currentTerminalValue) * tradeInFactor;
      terminalAge = currentAge + horizon;
      terminalModel = '現在のiPhone 15 Pro';
      add(horizon, 'terminalValue', `${terminalModel}の期末残価（使用約${terminalAge}年・仮定）`, -residual);
    } else {
      const model = policy.model;
      const cycle = Number(policy.cycle);
      const modelName = model === 'pro' ? 'Pro' : '無印';
      const initialPrice = Number(model === 'pro' ? config.proPrice : config.standardPrice);
      const annualRepair = Number(model === 'pro' ? config.proRepairPerYear : config.standardRepairPerYear) * repairFactor;
      const batteryCost = Number(model === 'pro' ? config.proBatteryCost : config.standardBatteryCost) * repairFactor;
      const ageEstimates = config.tradeIns[model];
      if (!(cycle >= 3 && cycle <= 6)) throw new Error('買い替え周期は3〜6年にしてください。');

      // 売却は開始時に一度だけ計上し、購入済み端末の過去の購入代金は含めない。
      add(0, 'tradeIns', 'iPhone 15 Proの本人見積もりで売却（個別見積もり）', -currentQuote);
      add(0, 'purchases', `新しい${modelName}を購入（現在の価格仮定）`, initialPrice);
      upfrontOutlay = initialPrice - currentQuote;

      let purchaseYear = 0;
      while (purchaseYear < horizon) {
        const plannedTradeYear = purchaseYear + cycle;
        const hasReplacement = plannedTradeYear < horizon;
        const endYear = hasReplacement ? plannedTradeYear : horizon;
        const heldYears = endYear - purchaseYear;
        const batteryAge = Number(config.batteryAge);

        if (annualRepair && heldYears > 0) {
          const repairTotal = annualRepair * heldYears;
          add(endYear, 'repairs', `${modelName}の修理費予備費（${yenText(annualRepair)}円/年 × ${heldYears}年）`, repairTotal);
        }
        // 交換・評価期間の終了時点ちょうどに発生する交換費は計上しない。
        if (batteryCost && batteryAge > 0 && batteryAge < heldYears) {
          add(purchaseYear + batteryAge, 'battery', `${modelName}の電池交換（購入後${batteryAge}年・仮定）`, batteryCost);
        }

        if (hasReplacement) {
          const proceeds = estimateForAge(ageEstimates, cycle) * tradeInFactor;
          add(plannedTradeYear, 'tradeIns', `${modelName}を購入後${cycle}年で下取り（仮定）`, -proceeds);
          const nextPrice = initialPrice * purchaseFactor;
          add(plannedTradeYear, 'purchases', `${modelName}を再購入（将来価格の仮定）`, nextPrice);
          purchaseYear = plannedTradeYear;
        } else {
          terminalAge = heldYears;
          terminalModel = modelName;
          const residual = estimateForAge(ageEstimates, terminalAge) * tradeInFactor;
          add(horizon, 'terminalValue', `${modelName}の期末残価（購入後${terminalAge}年・仮定）`, -residual);
          break;
        }
      }
    }

    events.sort((a, b) => a.year - b.year || eventOrder(a.kind) - eventOrder(b.kind));
    const netCost = totals.openingAsset + totals.purchases - totals.tradeIns + totals.battery + totals.repairs - totals.terminalValue;
    return {
      id: policy.id,
      name: policy.name,
      type: policy.type,
      model: policy.model || 'pro',
      cycle: policy.cycle || null,
      horizon,
      netCost,
      annualCost: netCost / horizon,
      monthlyCost: netCost / (horizon * 12),
      upfrontOutlay,
      terminalAge,
      terminalModel,
      totals,
      events
    };
  }

  function eventOrder(kind) {
    const order = { opening: 0, tradeIns: 1, purchases: 2, battery: 3, repairs: 4, terminalValue: 5 };
    return order[kind] || 0;
  }

  function yenText(value) {
    return Math.round(value).toLocaleString('ja-JP');
  }

  const api = { simulate, estimateForAge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPhoneSimulator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
