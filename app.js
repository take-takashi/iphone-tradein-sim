(() => {
  'use strict';

  const DEFAULTS = {
    currentAge: 3,
    currentQuote: 74000,
    quoteDate: '2026-09-01',
    currentTerminalValue: 10000,
    horizon: 12,
    startDate: '2026-09-01',
    standardPrice: 150000,
    proPrice: 200000,
    earlyCycle: 3,
    lateCycle: 6,
    proCompareCycle: 3,
    proCycle: 3,
    batteryAge: 4,
    standardBatteryCost: 20000,
    proBatteryCost: 25000,
    standardRepairPerYear: 2000,
    proRepairPerYear: 2500,
    activeProfile: 'base',
    tradeIns: {
      standard: { 1: 75000, 2: 57000, 3: 40000, 4: 28000, 5: 18000, 6: 10000 },
      pro: { 1: 100000, 2: 76000, 3: 55000, 4: 38000, 5: 24000, 6: 14000 }
    },
    profiles: {
      low: { purchaseFactor: 0.9, tradeInFactor: 1.1, repairFactor: 0.8 },
      base: { purchaseFactor: 1, tradeInFactor: 1, repairFactor: 1 },
      high: { purchaseFactor: 1.1, tradeInFactor: 0.8, repairFactor: 1.3 }
    }
  };
  const PROFILE_LABELS = { low: '低コスト', base: '基準', high: '高コスト' };
  const STORAGE_KEY = 'iphone-upgrade-simulator-v1';
  const yen = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function mountEstimateInputs() {
    const ages = [1, 2, 3, 4, 5, 6];
    $('#tradein-inputs').innerHTML = `
      <table class="trade-table" aria-label="購入後の年数別・下取り額仮定">
        <thead><tr><th scope="col">購入後</th><th scope="col">無印 <span class="tag tag-assumption">仮定値</span></th><th scope="col">Pro <span class="tag tag-assumption">仮定値</span></th></tr></thead>
        <tbody>${ages.map(age => `<tr><th scope="row" class="age-cell">${age}年</th>
          <td><input type="number" min="0" step="1000" value="${DEFAULTS.tradeIns.standard[age]}" data-key="tradeIns.standard.${age}" aria-label="無印、購入後${age}年の下取り仮定額（円）"></td>
          <td><input type="number" min="0" step="1000" value="${DEFAULTS.tradeIns.pro[age]}" data-key="tradeIns.pro.${age}" aria-label="Pro、購入後${age}年の下取り仮定額（円）"></td></tr>`).join('')}</tbody>
      </table>`;

    $('#active-profile').innerHTML = Object.entries(PROFILE_LABELS)
      .map(([key, label]) => `<option value="${key}">${label}ケース</option>`).join('');
    $('#profile-inputs').innerHTML = `
      <div class="profile-grid" role="group" aria-label="編集可能な将来シナリオ倍率">
        <span>倍率</span><span>低コスト</span><span>基準</span><span>高コスト</span>
        ${[
          ['purchaseFactor', '将来購入価格'],
          ['tradeInFactor', '将来下取り額'],
          ['repairFactor', '修理費']
        ].map(([key, label]) => `<label class="profile-name">${label}</label>${Object.keys(PROFILE_LABELS).map(profile => `<input type="number" min="0" max="5" step="0.05" value="${DEFAULTS.profiles[profile][key]}" data-key="profiles.${profile}.${key}" aria-label="${PROFILE_LABELS[profile]}ケースの${label}倍率">`).join('')}`).join('')}
      </div>`;
  }

  function restoreSavedValues() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      $$('[data-key]').forEach(input => {
        if (Object.prototype.hasOwnProperty.call(saved, input.dataset.key)) input.value = saved[input.dataset.key];
      });
    } catch (_) {
      // Private browsing or invalid saved data: use the editable example values.
    }
  }

  function readSavedValues() {
    const saved = {};
    $$('[data-key]').forEach(input => { saved[input.dataset.key] = input.value; });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (_) { /* Storage is optional. */ }
  }

  function value(key) {
    const input = $(`[data-key="${key}"]`);
    if (!input || input.value.trim() === '') throw new Error('未入力の項目があります。金額・年数を入力してください。');
    const parsed = input.type === 'number' ? Number(input.value) : input.value;
    if (typeof parsed === 'number' && !Number.isFinite(parsed)) throw new Error('数値を確認してください。');
    return parsed;
  }

  function collectConfig() {
    const numberKeys = [
      'currentAge', 'currentQuote', 'currentTerminalValue', 'horizon', 'standardPrice', 'proPrice',
      'earlyCycle', 'lateCycle', 'proCompareCycle', 'proCycle', 'batteryAge', 'standardBatteryCost',
      'proBatteryCost', 'standardRepairPerYear', 'proRepairPerYear'
    ];
    const config = {};
    numberKeys.forEach(key => { config[key] = Number(value(key)); });
    config.quoteDate = value('quoteDate');
    config.startDate = value('startDate');
    config.activeProfile = value('activeProfile');
    config.tradeIns = { standard: {}, pro: {} };
    ['standard', 'pro'].forEach(model => {
      for (let age = 1; age <= 6; age++) config.tradeIns[model][age] = Number(value(`tradeIns.${model}.${age}`));
    });
    config.profiles = {};
    Object.keys(PROFILE_LABELS).forEach(profile => {
      config.profiles[profile] = {
        purchaseFactor: Number(value(`profiles.${profile}.purchaseFactor`)),
        tradeInFactor: Number(value(`profiles.${profile}.tradeInFactor`)),
        repairFactor: Number(value(`profiles.${profile}.repairFactor`))
      };
    });
    if (!Number.isInteger(config.horizon) || config.horizon < 6 || config.horizon > 20) throw new Error('評価期間は6〜20年の整数で入力してください。');
    if (config.currentAge < 0 || config.currentAge > 20) throw new Error('現在の端末の使用年数を確認してください。');
    if (!Number.isInteger(config.batteryAge) || config.batteryAge < 1 || config.batteryAge > 15) throw new Error('電池交換を見込む使用年数は1〜15年で入力してください。');
    if (!config.startDate || !config.quoteDate) throw new Error('日付を入力してください。');
    if (config.earlyCycle >= config.lateCycle) throw new Error('買い替えを早める周期は、長く使う周期より短く設定してください。');
    for (const key of ['currentQuote', 'currentTerminalValue', 'standardPrice', 'proPrice', 'standardBatteryCost', 'proBatteryCost', 'standardRepairPerYear', 'proRepairPerYear']) {
      if (config[key] < 0) throw new Error('金額は0円以上で入力してください。');
    }
    for (const model of ['standard', 'pro']) {
      for (let age = 1; age <= 6; age++) if (config.tradeIns[model][age] < 0) throw new Error('下取り額は0円以上で入力してください。');
    }
    Object.values(config.profiles).forEach(profile => Object.values(profile).forEach(factor => {
      if (factor < 0 || factor > 5) throw new Error('将来シナリオの倍率は0〜5の範囲で入力してください。');
    }));
    return config;
  }

  function fmtYen(amount) {
    const rounded = Math.round(amount);
    return `${rounded < 0 ? '−' : ''}¥${yen.format(Math.abs(rounded))}`;
  }

  function fmtSignedYen(amount) {
    const rounded = Math.round(amount);
    if (rounded === 0) return '¥0';
    return `${rounded > 0 ? '＋' : '−'}¥${yen.format(Math.abs(rounded))}`;
  }

  function dateAtYear(dateString, years) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setFullYear(date.getFullYear() + years);
    return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit' }).format(date);
  }

  function makePolicies(config) {
    const policies = [{ id: 'keep', name: '今のiPhone 15 Proを使い続ける', type: 'keep' }];
    [3, 4, 5, 6].forEach(cycle => policies.push({
      id: `standard-${cycle}`, name: `無印・${cycle}年ごと`, type: 'cycle', model: 'standard', cycle
    }));
    policies.push({
      id: `pro-${config.proCycle}`, name: `Pro・${config.proCycle}年ごと`, type: 'cycle', model: 'pro', cycle: config.proCycle
    });
    return policies;
  }

  function policyDescription(result, config) {
    if (result.type === 'keep') return `買い替えなし ／ 期末残価 ${fmtYen(result.totals.terminalValue)}（${config.currentAge + config.horizon}年使用の仮定）`;
    const replacements = result.events.filter(event => event.kind === 'purchases' && event.year > 0).map(event => dateAtYear(config.startDate, event.year));
    const schedule = replacements.length ? replacements.join('・') : '期間内なし';
    return `買い替え時点 ${schedule} ／ 期末残価 ${fmtYen(result.totals.terminalValue)}（${result.terminalAge}年使用の仮定）`;
  }

  function eventTiming(year, config) {
    if (year === 0) return '開始時';
    if (year === config.horizon) return `期末（${dateAtYear(config.startDate, year)}）`;
    return `${dateAtYear(config.startDate, year)}（${year}年目）`;
  }

  function resultRow(result, config, highlighted = false) {
    return `<tr class="${highlighted ? 'focus-row' : ''}">
      <td><span class="policy-name">${result.name}</span><div class="sub-cell">${policyDescription(result, config)}</div></td>
      <td class="cost-cell">${fmtYen(result.netCost)}</td>
      <td>${fmtYen(result.monthlyCost)}</td>
      <td>${fmtYen(result.annualCost)}</td>
      <td>${fmtYen(result.totals.terminalValue)}</td>
      <td><span class="outlay-pill">${fmtYen(result.upfrontOutlay)}</span></td>
    </tr>`;
  }

  function renderCard(title, caption, results, highlightedIds = []) {
    return `<article class="result-card ${highlightedIds.length ? 'featured' : ''}">
      <div class="result-card-head"><div><h3>${title}</h3><p>${caption}</p></div>${highlightedIds.length ? '<span class="tag tag-assumption">全額、仮定を含む</span>' : ''}</div>
      <div class="result-table-wrap"><table class="result-table" aria-label="${title}">
        <thead><tr><th scope="col">買い替え方針</th><th scope="col">期間純費用</th><th scope="col">月額</th><th scope="col">年額</th><th scope="col">期末残価</th><th scope="col">今必要な支払額</th></tr></thead>
        <tbody>${results.map(result => resultRow(result, window.__resultsConfig, highlightedIds.includes(result.id))).join('')}</tbody>
      </table></div>
      <div class="timeline">${results.map(result => `<details><summary>${result.name} — 計算の内訳</summary>${breakdownTable(result, window.__resultsConfig)}</details>`).join('')}</div>
    </article>`;
  }

  function breakdownTable(result, config) {
    const rows = result.events.map(event => `<tr>
      <td>${event.label}</td><td>${eventTiming(event.year, config)}</td>
      <td class="${event.amount < 0 ? 'negative' : ''}">${fmtSignedYen(event.amount)}</td>
    </tr>`).join('');
    return `<table class="breakdown"><thead><tr><th>項目</th><th>時点</th><th>費用／受取</th></tr></thead><tbody>${rows}
      <tr class="total-row"><td>期間純費用</td><td>${config.horizon}年間</td><td>${fmtYen(result.netCost)}</td></tr>
      <tr><td>今必要な支払額（購入価格−個別見積もり）</td><td>開始時</td><td>${fmtYen(result.upfrontOutlay)}</td></tr>
    </tbody></table>`;
  }

  function deltaCard(label, title, a, b, note, emphasis = false) {
    const delta = a.netCost - b.netCost;
    return `<article class="delta-card ${emphasis ? 'emphasis' : ''}">
      <p class="delta-label">${label}</p><h3>${title}</h3>
      <p class="delta-value">${fmtSignedYen(delta / (a.horizon * 12))}<small> / 月</small></p>
      <p>${fmtSignedYen(delta / a.horizon)} / 年 ・ ${fmtSignedYen(delta)} / ${a.horizon}年間</p>
      <p>${note}</p>
    </article>`;
  }

  function render(config) {
    const profile = config.profiles[config.activeProfile];
    const policies = makePolicies(config);
    const results = policies.map(policy => window.IPhoneSimulator.simulate(policy, config, profile));
    const byId = Object.fromEntries(results.map(result => [result.id, result]));
    window.__resultsConfig = config;
    $('#horizon-label').textContent = config.horizon;

    const selectedProfileName = PROFILE_LABELS[config.activeProfile];
    const currentQuoteText = `${fmtYen(config.currentQuote)}・${config.quoteDate || '日付未入力'}`;
    const quoteAge = config.quoteDate ? `本人申告・serial_quote / ${config.quoteDate}` : '本人申告・serial_quote';
    const compareStandard = byId[`standard-${config.proCompareCycle}`];
    const comparePro = byId[`pro-${config.proCycle}`];
    const early = byId[`standard-${config.earlyCycle}`];
    const late = byId[`standard-${config.lateCycle}`];
    const sellNow = byId[`standard-${config.proCompareCycle}`];
    const keep = byId.keep;

    $('#results').innerHTML = `
      <div class="active-assumption"><span>使用中の将来シナリオ：<strong>${selectedProfileName}ケース</strong></span><span>購入 ${profile.purchaseFactor.toFixed(2)}× ・下取り ${profile.tradeInFactor.toFixed(2)}× ・修理 ${profile.repairFactor.toFixed(2)}×</span></div>
      ${renderCard('買い替え方針ごとの費用', `${config.horizon}年間を同じ開始日から比較。今の端末価値を全方針に共通計上しています。`, results, [`standard-${config.earlyCycle}`, `standard-${config.lateCycle}`, `pro-${config.proCycle}`])}
      <div class="delta-grid">
        ${deltaCard('買い替えを早める追加費用', `無印${config.earlyCycle}年ごと − 無印${config.lateCycle}年ごと`, early, late, 'プラスなら、早く買い替える方がその分高い計算です。', true)}
        ${deltaCard('Proを選ぶ追加費用', `Pro${config.proCycle}年ごと − 無印${config.proCompareCycle}年ごと`, comparePro, compareStandard, '機種グレード以外の条件（期間・シナリオ）をそろえた差です。')}
        ${deltaCard('今売る／使い続ける', `無印を今買う − 現在のProを継続`, sellNow, keep, `今の見積もり ${currentQuoteText} を使って比較。プラスなら今買う方が高い計算です。`)}
      </div>
      <div class="source-detail"><details><summary>この計算に使ったデータと出典区分</summary>
        <ul>
          <li><span class="tag tag-observed">本人申告</span> iPhone 15 Proの${quoteAge}：${fmtYen(config.currentQuote)}。本人の見積もりで、公開上限額・確定した最終査定額ではありません。容量・状態・元資料URLは未確認です。</li>
          <li><span class="tag tag-assumption">仮定値</span> 購入価格、将来の下取り額、期末残価、電池交換・修理費、シナリオ倍率は入力例です。公式発売価格や実測履歴として扱っていません。</li>
          <li><span class="tag tag-unknown">公開データ未収録</span> 出典URL付きの公開最大額（public_max）・確定額（actual_final）の観測データはこのMVPに含めていません。</li>
        </ul>
        <p>下取り表にある金額は容量・状態を特定した実査定ではなく、将来を試算するための編集可能な仮定です。入力した条件と倍率はブラウザーのローカルストレージに保存されます。</p>
      </details></div>`;
  }

  function showError(error) {
    $('#horizon-label').textContent = '—';
    $('#results').innerHTML = `<p class="validation-message" role="alert">${error.message || '入力を確認してください。'}</p>`;
  }

  function update() {
    try {
      const config = collectConfig();
      render(config);
    } catch (error) {
      showError(error);
    }
  }

  function reset() {
    $$('[data-key]').forEach(input => {
      const path = input.dataset.key.split('.');
      let item = DEFAULTS;
      path.forEach(part => { item = item[part]; });
      input.value = item;
    });
    readSavedValues();
    update();
  }

  mountEstimateInputs();
  restoreSavedValues();
  document.addEventListener('input', event => {
    if (event.target.matches('[data-key]')) {
      readSavedValues();
      update();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-key]')) {
      readSavedValues();
      update();
    }
  });
  $('#reset-button').addEventListener('click', reset);
  update();
})();
