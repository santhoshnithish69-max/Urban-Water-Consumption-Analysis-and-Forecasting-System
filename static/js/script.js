/**
 * Urban Water Consumption Analysis and Forecasting System
 * Client-Side JavaScript Logic & Universal Time-Series Engine
 * 
 * Works seamlessly in both environments:
 * 1. GitHub Pages (Pure Client-Side Static Mode - 100% in-browser math engine)
 * 2. Flask / Vercel (Backend REST API Mode)
 */

// Global state variables
let globalData = null;
let consumptionChart = null;
let seasonalChart = null;
let selectedFile = null;
let currentTimeframe = 'all';
let isStaticMode = false;

// Formatter utilities
const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/**
 * Format date string YYYY-MM into readable month and year (e.g., 'Jan 2024')
 */
function formatMonthName(monthStr) {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month - 1]} ${year}`;
}

/**
 * Show a floating alert / toast message
 */
function showAlert(message, type = 'info') {
  const container = document.getElementById('alert-container');
  const content = document.getElementById('alert-content');
  const messageEl = document.getElementById('alert-message');
  const icon = document.getElementById('alert-icon');

  if (!container || !content) return;

  content.className = `alert-content ${type}`;
  messageEl.textContent = message;

  if (type === 'success') {
    icon.className = 'fa-solid fa-circle-check';
  } else if (type === 'error') {
    icon.className = 'fa-solid fa-triangle-exclamation';
  } else {
    icon.className = 'fa-solid fa-circle-info';
  }

  container.style.display = 'block';

  clearTimeout(window.alertTimer);
  window.alertTimer = setTimeout(() => {
    closeAlert();
  }, 6500);
}

function closeAlert() {
  const container = document.getElementById('alert-container');
  if (container) container.style.display = 'none';
}

/* ==========================================================================
   Client-Side Time-Series Forecasting Engine (For GitHub Pages Static Hosting)
   Matches forecasting.py logic 100%
   ========================================================================== */

function generateSampleDataClient() {
  const seasonalPattern = [-12, -10, -4, 2, 8, 14, 17, 15, 8, 2, -5, -10];
  const values = [];
  const today = new Date();
  const currentMonthIdx = today.getFullYear() * 12 + today.getMonth();
  const firstMonthIdx = currentMonthIdx - 47;

  for (let i = 0; i < 48; i++) {
    const totalMonth = firstMonthIdx + i;
    const year = Math.floor(totalMonth / 12);
    const month = (totalMonth % 12) + 1;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const consumption = 500 + 2 * i + seasonalPattern[month - 1] + (i % 5 - 2);
    values.push({
      dateStr: monthStr,
      year: year,
      month: month,
      consumption: parseFloat(consumption.toFixed(2))
    });
  }
  return values;
}

function getNextMonthDate(year, month) {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year: year, month: month + 1 };
}

function fitModelClient(history) {
  const n = history.length;
  const xValues = history.map((_, idx) => idx);
  const yValues = history.map(item => item.consumption);

  const xMean = xValues.reduce((a, b) => a + b, 0) / n;
  const yMean = yValues.reduce((a, b) => a + b, 0) / n;

  let denominator = 0;
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    const xDiff = xValues[i] - xMean;
    numerator += xDiff * (yValues[i] - yMean);
    denominator += xDiff * xDiff;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  // Monthly residuals 1..12
  const monthlyResiduals = {};
  for (let m = 1; m <= 12; m++) monthlyResiduals[m] = [];

  history.forEach((item, idx) => {
    const trend = intercept + slope * idx;
    monthlyResiduals[item.month].push(item.consumption - trend);
  });

  const seasonalEffects = {};
  let seasonalSum = 0;
  for (let m = 1; m <= 12; m++) {
    const res = monthlyResiduals[m];
    const avg = res.length > 0 ? res.reduce((a, b) => a + b, 0) / res.length : 0;
    seasonalEffects[m] = avg;
    seasonalSum += avg;
  }

  const seasonalAvg = seasonalSum / 12;
  for (let m = 1; m <= 12; m++) {
    seasonalEffects[m] = seasonalEffects[m] - seasonalAvg;
  }

  return { intercept, slope, seasonalEffects };
}

function predictClient(history, futureDates, modelParams) {
  const { intercept, slope, seasonalEffects } = modelParams;
  const baseLen = history.length;

  return futureDates.map((item, offset) => {
    const pred = intercept + slope * (baseLen + offset) + (seasonalEffects[item.month] || 0);
    return {
      month: `${item.year}-${String(item.month).padStart(2, '0')}`,
      year: item.year,
      monthNum: item.month,
      consumption: Math.max(0, parseFloat(pred.toFixed(2)))
    };
  });
}

function evaluateModelMAEClient(history, testMonths = 6) {
  const total = history.length;
  const effectiveTest = Math.min(testMonths, Math.max(2, Math.floor(total / 4)));
  const trainData = history.slice(0, total - effectiveTest);
  const testData = history.slice(total - effectiveTest);

  const model = fitModelClient(trainData);
  const testFuture = testData.map(item => ({ year: item.year, month: item.month }));
  const testPredictions = predictClient(trainData, testFuture, model);

  const comparisons = [];
  let errorSum = 0;
  let pctErrorSum = 0;

  for (let i = 0; i < testData.length; i++) {
    const act = testData[i].consumption;
    const pred = testPredictions[i].consumption;
    const absErr = Math.abs(act - pred);
    const pctErr = act > 0 ? (absErr / act) * 100 : 0;
    errorSum += absErr;
    pctErrorSum += pctErr;

    comparisons.push({
      month: testData[i].dateStr,
      actual: act,
      predicted: pred,
      absolute_error: parseFloat(absErr.toFixed(2)),
      percentage_error: parseFloat(pctErr.toFixed(2))
    });
  }

  const mae = parseFloat((errorSum / testData.length).toFixed(2));
  const mape = parseFloat((pctErrorSum / testData.length).toFixed(2));

  return { mae, mape, test_months_count: effectiveTest, test_comparisons: comparisons };
}

function parseCSVClient(csvContent) {
  if (!csvContent || !csvContent.trim()) {
    throw new Error('Uploaded file is empty.');
  }

  const lines = csvContent.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must contain a header and at least 12 rows of data.');
  }

  const delimiter = lines[0].includes(';') && (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
  const header = lines[0].split(delimiter).map(c => c.trim().toLowerCase());

  let monthCol = header.findIndex(c => ['month', 'date', 'period', 'timestamp'].some(term => c.includes(term)));
  let valCol = header.findIndex(c => ['consumption', 'megaliters', 'usage', 'volume', 'value'].some(term => c.includes(term)));

  if (monthCol === -1 && header.length >= 2) monthCol = 0;
  if (valCol === -1 && header.length >= 2) valCol = 1;

  if (monthCol === -1 || valCol === -1) {
    throw new Error("CSV header must contain 'month' and 'consumption_megaliters' columns.");
  }

  const recordsMap = new Map();
  const dateRegex = /^(\d{4})[-/](0[1-9]|1[0-2])(?:[-/](0[1-9]|[12]\d|3[01]))?$/;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter).map(p => p.trim());
    if (parts.length <= Math.max(monthCol, valCol)) continue;

    const rawMonth = parts[monthCol];
    const rawVal = parts[valCol];

    if (!rawMonth || !rawVal) {
      throw new Error(`Line ${i + 1}: Missing values detected.`);
    }

    const match = rawMonth.match(dateRegex);
    if (!match) {
      throw new Error(`Line ${i + 1}: Invalid date '${rawMonth}'. Expected 'YYYY-MM' (e.g., 2022-01).`);
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const dateKey = `${year}-${String(month).padStart(2, '0')}`;

    const numVal = parseFloat(rawVal.replace(/[$,]/g, ''));
    if (isNaN(numVal) || numVal <= 0) {
      throw new Error(`Line ${i + 1}: Invalid consumption value '${rawVal}'. Must be positive number.`);
    }

    if (recordsMap.has(dateKey)) {
      throw new Error(`Line ${i + 1}: Duplicate month '${dateKey}' detected.`);
    }

    recordsMap.set(dateKey, { dateStr: dateKey, year, month, consumption: numVal });
  }

  const sorted = Array.from(recordsMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  if (sorted.length < 12) {
    throw new Error(`Dataset contains only ${sorted.length} months. At least 12 months are required for seasonal analysis.`);
  }

  return sorted;
}

function performFullAnalysisClient(history) {
  const n = history.length;
  const values = history.map(item => item.consumption);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = total / n;
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const minItem = history.find(item => item.consumption === minVal);
  const maxItem = history.find(item => item.consumption === maxVal);

  const model = fitModelClient(history);
  const evalResult = evaluateModelMAEClient(history, 6);

  // Future 6 months
  const futureDates = [];
  let curr = { year: history[n - 1].year, month: history[n - 1].month };
  for (let i = 0; i < 6; i++) {
    curr = getNextMonthDate(curr.year, curr.month);
    futureDates.push({ year: curr.year, month: curr.month });
  }

  const futurePredictions = predictClient(history, futureDates, model);
  const latestActual = history[n - 1].consumption;

  let prev = latestActual;
  const forecastList = futurePredictions.map(item => {
    const diff = item.consumption - prev;
    const pct = prev > 0 ? (diff / prev) * 100 : 0;
    const isUp = item.consumption >= prev;
    const sEffect = model.seasonalEffects[item.monthNum] || 0;
    prev = item.consumption;

    return {
      month: item.month,
      display_month: formatMonthName(item.month),
      consumption: item.consumption,
      seasonal_effect: parseFloat(sEffect.toFixed(2)),
      mom_change: parseFloat(diff.toFixed(2)),
      mom_percent: parseFloat(pct.toFixed(1)),
      is_increasing: isUp
    };
  });

  const nextMonthPred = forecastList[0].consumption;
  const nextDiff = nextMonthPred - latestActual;
  const nextPct = latestActual > 0 ? (nextDiff / latestActual) * 100 : 0;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const seasonalBreakdown = [];
  for (let m = 1; m <= 12; m++) {
    seasonalBreakdown.push({
      month_num: m,
      month_name: monthNames[m - 1],
      effect: parseFloat(model.seasonalEffects[m].toFixed(2))
    });
  }

  const slope = model.slope;
  let trendDirection = 'Stable';
  if (slope > 0.05) trendDirection = 'Increasing';
  else if (slope < -0.05) trendDirection = 'Decreasing';

  return {
    unit: 'megaliters',
    total_historical_consumption: parseFloat(total.toFixed(2)),
    average_monthly_consumption: parseFloat(avg.toFixed(2)),
    historical_count: n,
    start_month: formatMonthName(history[0].dateStr),
    end_month: formatMonthName(history[n - 1].dateStr),
    latest_month: history[n - 1].dateStr,
    latest_consumption: latestActual,
    min_record: { month: formatMonthName(minItem.dateStr), value: minItem.consumption },
    max_record: { month: formatMonthName(maxItem.dateStr), value: maxItem.consumption },
    trend_direction: trendDirection,
    slope_monthly: parseFloat(slope.toFixed(3)),
    annual_trend_change: parseFloat((slope * 12).toFixed(2)),
    intercept: parseFloat(model.intercept.toFixed(2)),
    next_month: forecastList[0].month,
    next_month_consumption: nextMonthPred,
    next_month_diff: parseFloat(nextDiff.toFixed(2)),
    next_month_pct: parseFloat(nextPct.toFixed(1)),
    mae: evalResult.mae,
    mape: evalResult.mape,
    test_months_count: evalResult.test_months_count,
    test_comparisons: evalResult.test_comparisons,
    forecast: forecastList,
    history: history.map(item => ({
      month: item.dateStr,
      display_month: formatMonthName(item.dateStr),
      consumption: item.consumption
    })),
    seasonal_effects: seasonalBreakdown
  };
}

/**
 * Trigger browser file download via Blob URL
 */
function downloadBlob(content, filename, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportForecastCSVClient(forecasts) {
  let csv = 'month,predicted_consumption_megaliters,seasonal_effect_megaliters,trend_status\n';
  forecasts.forEach(item => {
    const trend = item.is_increasing ? 'Increasing' : 'Decreasing';
    csv += `${item.month},${item.consumption},${item.seasonal_effect},${trend}\n`;
  });
  return csv;
}

function exportSampleCSVClient(history) {
  let csv = 'month,consumption_megaliters\n';
  history.forEach(item => {
    csv += `${item.month || item.dateStr},${item.consumption}\n`;
  });
  return csv;
}

/* ==========================================================================
   Chart.js Rendering Logic
   ========================================================================== */

const forecastBoundaryPlugin = {
  id: 'forecastBoundary',
  afterDraw: (chart) => {
    const boundaryIndex = chart.config.options.plugins?.forecastBoundary?.boundaryIndex;
    if (boundaryIndex === undefined || boundaryIndex === null || boundaryIndex < 0) return;

    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data[boundaryIndex]) return;

    const ctx = chart.ctx;
    const x = meta.data[boundaryIndex].x;
    const topY = chart.chartArea.top;
    const bottomY = chart.chartArea.bottom;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x, topY);
    ctx.lineTo(x, bottomY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#64748b';
    ctx.stroke();

    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('Forecast Starts', x, topY + 14);
    ctx.restore();
  }
};

function renderConsumptionChart(data, timeframe = 'all') {
  const canvas = document.getElementById('consumptionChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  let historyData = [...data.history];
  if (timeframe === 24 && historyData.length > 24) {
    historyData = historyData.slice(-24);
  } else if (timeframe === 12 && historyData.length > 12) {
    historyData = historyData.slice(-12);
  }

  const forecastData = [...data.forecast];
  const lastHistoryPoint = historyData[historyData.length - 1];

  const labels = [
    ...historyData.map(item => item.display_month || formatMonthName(item.month)),
    ...forecastData.map(item => item.display_month || formatMonthName(item.month))
  ];

  const actualValues = [
    ...historyData.map(item => item.consumption),
    ...forecastData.map(() => null)
  ];

  const forecastValues = [
    ...historyData.slice(0, -1).map(() => null),
    lastHistoryPoint.consumption,
    ...forecastData.map(item => item.consumption)
  ];

  const boundaryIndex = historyData.length - 1;

  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, 'rgba(2, 132, 199, 0.28)');
  gradient.addColorStop(1, 'rgba(2, 132, 199, 0.01)');

  const chartConfig = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Actual Consumption',
          data: actualValues,
          borderColor: '#0284c7',
          backgroundColor: gradient,
          borderWidth: 2.75,
          pointBackgroundColor: '#0284c7',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: historyData.length > 30 ? 2.5 : 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.25,
          spanGaps: false
        },
        {
          label: 'Forecast Outlook',
          data: forecastValues,
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 2.75,
          borderDash: [6, 5],
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          fill: false,
          tension: 0.25,
          spanGaps: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleFont: { family: 'Outfit', size: 13, weight: '700' },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 12,
          cornerRadius: 8,
          boxPadding: 6,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              if (val === null || val === undefined) return null;
              const dsLabel = context.dataset.label;
              return `${dsLabel}: ${numberFormatter.format(val)} ML`;
            }
          }
        },
        forecastBoundary: {
          boundaryIndex: boundaryIndex
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9', drawBorder: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748b',
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 14
          }
        },
        y: {
          grid: { color: '#e2e8f0', drawBorder: false },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748b',
            callback: function(value) { return value + ' ML'; }
          },
          title: {
            display: true,
            text: 'Consumption (Megaliters)',
            font: { family: 'Outfit', size: 12, weight: '600' },
            color: '#475569'
          }
        }
      }
    },
    plugins: [forecastBoundaryPlugin]
  };

  if (consumptionChart) {
    consumptionChart.destroy();
  }
  consumptionChart = new Chart(ctx, chartConfig);

  const countEl = document.getElementById('chart-point-count');
  if (countEl) {
    countEl.textContent = `Showing ${historyData.length} historical months + 6 forecast months`;
  }
}

function renderSeasonalChart(seasonalEffects) {
  const canvas = document.getElementById('seasonalChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = seasonalEffects.map(item => item.month_name);
  const values = seasonalEffects.map(item => item.effect);

  const backgroundColors = values.map(val =>
    val >= 0 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(2, 132, 199, 0.85)'
  );
  const borderColors = values.map(val =>
    val >= 0 ? '#d97706' : '#0284c7'
  );

  let maxItem = seasonalEffects[0];
  let minItem = seasonalEffects[0];
  seasonalEffects.forEach(item => {
    if (item.effect > maxItem.effect) maxItem = item;
    if (item.effect < minItem.effect) minItem = item;
  });

  const peakEl = document.getElementById('peak-season-month');
  const lowEl = document.getElementById('low-season-month');
  if (peakEl) peakEl.textContent = `${maxItem.month_name} (${maxItem.effect >= 0 ? '+' : ''}${maxItem.effect} ML)`;
  if (lowEl) lowEl.textContent = `${minItem.month_name} (${minItem.effect >= 0 ? '+' : ''}${minItem.effect} ML)`;

  const config = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Seasonal Deviation',
          data: values,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              const sign = val >= 0 ? '+' : '';
              return `Seasonal Factor: ${sign}${numberFormatter.format(val)} ML`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10 }, color: '#64748b' }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { family: 'Inter', size: 10 },
            color: '#64748b',
            callback: function(val) { return (val >= 0 ? '+' : '') + val; }
          },
          title: {
            display: true,
            text: 'Deviation (ML)',
            font: { family: 'Inter', size: 11 },
            color: '#64748b'
          }
        }
      }
    }
  };

  if (seasonalChart) {
    seasonalChart.destroy();
  }
  seasonalChart = new Chart(ctx, config);
}

function updateDashboardMetrics(data) {
  document.getElementById('kpi-total').textContent = integerFormatter.format(data.total_historical_consumption);
  document.getElementById('kpi-total-sub').textContent =
    `Across ${data.historical_count} recorded months (${data.start_month} – ${data.end_month})`;

  document.getElementById('kpi-avg').textContent = numberFormatter.format(data.average_monthly_consumption);
  document.getElementById('kpi-avg-sub').textContent =
    `Peak: ${data.max_record.value} ML (${data.max_record.month})`;

  document.getElementById('kpi-next').textContent = numberFormatter.format(data.next_month_consumption);
  document.getElementById('kpi-next-month').textContent =
    `Target: ${formatMonthName(data.next_month)}`;

  const nextPill = document.getElementById('kpi-next-pill');
  const diff = data.next_month_diff;
  const pct = data.next_month_pct;
  const isUp = diff >= 0;

  nextPill.className = `metric-trend-pill ${isUp ? 'up' : 'down'}`;
  nextPill.innerHTML = isUp
    ? `<i class="fa-solid fa-arrow-trend-up"></i> +${numberFormatter.format(diff)} ML (+${pct}%)`
    : `<i class="fa-solid fa-arrow-trend-down"></i> ${numberFormatter.format(diff)} ML (${pct}%)`;

  document.getElementById('kpi-mae').textContent = numberFormatter.format(data.mae);
  document.getElementById('kpi-mae-sub').textContent =
    `MAPE: ${data.mape}% (Back-tested on ${data.test_months_count} months)`;
  document.getElementById('mae-badge').textContent = `MAE: ${data.mae} ML`;

  const trendEl = document.getElementById('kpi-trend');
  const trendSubEl = document.getElementById('kpi-trend-sub');
  const trendIcon = document.getElementById('trend-icon');

  trendEl.textContent = data.trend_direction;
  const slopeSign = data.slope_monthly >= 0 ? '+' : '';
  trendSubEl.textContent =
    `Slope: ${slopeSign}${data.slope_monthly} ML/mo (${slopeSign}${data.annual_trend_change} ML/yr)`;

  if (data.trend_direction === 'Increasing') {
    trendEl.style.color = '#0284c7';
    trendIcon.className = 'fa-solid fa-arrow-trend-up';
  } else if (data.trend_direction === 'Decreasing') {
    trendEl.style.color = '#d97706';
    trendIcon.className = 'fa-solid fa-arrow-trend-down';
  } else {
    trendEl.style.color = '#64748b';
    trendIcon.className = 'fa-solid fa-arrows-left-right';
  }

  const datasetNameEl = document.getElementById('dataset-name');
  if (data.is_custom_dataset) {
    datasetNameEl.innerHTML = `<span style="color: #38bdf8;">Custom Upload (${data.uploaded_filename || 'CSV Data'})</span>`;
  } else {
    datasetNameEl.textContent = `Default Municipal Sample (${data.historical_count} Months)`;
  }
  document.getElementById('dataset-range').textContent = `${data.start_month} – ${data.end_month}`;

  document.getElementById('mae-formula-val').textContent = `${data.mae} Megaliters`;
  document.getElementById('mape-formula-val').textContent = `${data.mape}%`;
  document.getElementById('formula-intercept').textContent = `${data.intercept} ML`;
  document.getElementById('formula-slope').textContent = `${slopeSign}${data.slope_monthly}`;
}

function updateForecastTable(forecast) {
  const tbody = document.getElementById('forecast-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  forecast.forEach(item => {
    const tr = document.createElement('tr');

    const tdMonth = document.createElement('td');
    tdMonth.innerHTML = `<strong>${item.display_month || formatMonthName(item.month)}</strong>`;

    const tdVal = document.createElement('td');
    tdVal.innerHTML = `<span style="font-weight: 700; color: #0284c7;">${numberFormatter.format(item.consumption)}</span> <small class="text-muted">ML</small>`;

    const tdSeasonal = document.createElement('td');
    const sEffect = item.seasonal_effect;
    const sSign = sEffect >= 0 ? '+' : '';
    const sColor = sEffect >= 0 ? '#d97706' : '#0284c7';
    tdSeasonal.innerHTML = `<span style="color: ${sColor}; font-weight: 500;">${sSign}${numberFormatter.format(sEffect)} ML</span>`;

    const tdTrend = document.createElement('td');
    const isUp = item.is_increasing;
    const badgeClass = isUp ? 'trend-badge up' : 'trend-badge down';
    const badgeIcon = isUp ? 'fa-arrow-up' : 'fa-arrow-down';
    const changeSign = item.mom_change >= 0 ? '+' : '';
    tdTrend.innerHTML = `
      <span class="${badgeClass}">
        <i class="fa-solid ${badgeIcon}"></i>
        ${changeSign}${numberFormatter.format(item.mom_change)} ML (${changeSign}${item.mom_percent}%)
      </span>
    `;

    tr.appendChild(tdMonth);
    tr.appendChild(tdVal);
    tr.appendChild(tdSeasonal);
    tr.appendChild(tdTrend);
    tbody.appendChild(tr);
  });
}

function updateTestEvaluationTable(testComparisons) {
  const tbody = document.getElementById('test-evaluation-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!testComparisons || testComparisons.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No test split comparisons available.</td></tr>';
    return;
  }

  testComparisons.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${formatMonthName(item.month)}</strong></td>
      <td>${numberFormatter.format(item.actual)} ML</td>
      <td>${numberFormatter.format(item.predicted)} ML</td>
      <td><span style="font-weight: 600; color: #0284c7;">${numberFormatter.format(item.absolute_error)} ML</span></td>
      <td>${item.percentage_error}%</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Universal Fetch: checks Flask API first; if unavailable (GitHub Pages), runs client-side engine!
 */
async function fetchDashboardData() {
  const overlay = document.getElementById('chart-loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  try {
    const response = await fetch('/api/forecast');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    globalData = result.data;
    isStaticMode = false;
  } catch (backendError) {
    // Running in static environment (GitHub Pages)
    isStaticMode = true;
    const sampleHistory = generateSampleDataClient();
    globalData = performFullAnalysisClient(sampleHistory);
    globalData.is_custom_dataset = false;
  } finally {
    if (globalData) {
      updateDashboardMetrics(globalData);
      renderConsumptionChart(globalData, currentTimeframe);
      renderSeasonalChart(globalData.seasonal_effects);
      updateForecastTable(globalData.forecast);
      updateTestEvaluationTable(globalData.test_comparisons);
    }
    if (overlay) overlay.style.display = 'none';
  }
}

function setTimeframeFilter(timeframe) {
  currentTimeframe = timeframe;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));

  if (timeframe === 'all') {
    document.getElementById('btn-filter-all')?.classList.add('active');
  } else if (timeframe === 24) {
    document.getElementById('btn-filter-24')?.classList.add('active');
  } else if (timeframe === 12) {
    document.getElementById('btn-filter-12')?.classList.add('active');
  }

  if (globalData) {
    renderConsumptionChart(globalData, timeframe);
  }
}

function initUploadHandlers() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('csv-file-input');
  const fileDisplay = document.getElementById('selected-file-display');
  const fileNameEl = document.getElementById('selected-file-name');
  const fileSizeEl = document.getElementById('selected-file-size');

  if (!dropzone || !fileInput) return;

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showAlert('Invalid file type. Please upload a .csv file.', 'error');
      selectedFile = null;
      if (fileDisplay) fileDisplay.style.display = 'none';
      return;
    }
    selectedFile = file;
    if (fileNameEl) fileNameEl.textContent = file.name;
    const sizeKb = (file.size / 1024).toFixed(1);
    if (fileSizeEl) fileSizeEl.textContent = `(${sizeKb} KB)`;
    if (fileDisplay) fileDisplay.style.display = 'inline-flex';
    showAlert(`Selected '${file.name}'. Click 'Upload & Regenerate Predictions' to proceed.`, 'info');
  }

  // Intercept Download buttons in static mode
  const btnDlForecast = document.getElementById('btn-download-forecast-chart');
  const btnDlTable = document.getElementById('btn-download-table-csv');
  const btnDlSample = document.getElementById('btn-download-sample');

  const handleDownloadForecast = (e) => {
    if (isStaticMode && globalData) {
      e.preventDefault();
      const csv = exportForecastCSVClient(globalData.forecast);
      downloadBlob(csv, 'urban_water_forecast.csv');
    }
  };

  if (btnDlForecast) btnDlForecast.addEventListener('click', handleDownloadForecast);
  if (btnDlTable) btnDlTable.addEventListener('click', handleDownloadForecast);

  if (btnDlSample) {
    btnDlSample.addEventListener('click', (e) => {
      if (isStaticMode) {
        e.preventDefault();
        const sampleHistory = generateSampleDataClient();
        const csv = exportSampleCSVClient(sampleHistory);
        downloadBlob(csv, 'sample_water_consumption.csv');
      }
    });
  }
}

async function uploadCsvFile() {
  if (!selectedFile) {
    showAlert('Please select or drop a CSV file first.', 'error');
    return;
  }

  const btnSubmit = document.getElementById('btn-submit-upload');
  const originalHtml = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating & Processing...';

  try {
    if (isStaticMode) {
      // Static Mode (GitHub Pages): Read & Process directly in browser!
      const text = await selectedFile.text();
      const parsedHistory = parseCSVClient(text);
      globalData = performFullAnalysisClient(parsedHistory);
      globalData.is_custom_dataset = true;
      globalData.uploaded_filename = selectedFile.name;

      showAlert(`Successfully loaded '${selectedFile.name}' with ${parsedHistory.length} monthly records.`, 'success');
    } else {
      // Backend Mode (Flask / Vercel): Send to /api/upload
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process CSV file.');
      }

      globalData = result.data;
      showAlert(result.message || 'Dataset uploaded successfully!', 'success');
    }

    updateDashboardMetrics(globalData);
    renderConsumptionChart(globalData, currentTimeframe);
    renderSeasonalChart(globalData.seasonal_effects);
    updateForecastTable(globalData.forecast);
    updateTestEvaluationTable(globalData.test_comparisons);

    document.getElementById('chart-section')?.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Upload error:', error);
    showAlert(`CSV Error: ${error.message}`, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalHtml;
  }
}

async function resetToSampleData() {
  const btnReset = document.getElementById('btn-reset-data');
  const originalHtml = btnReset.innerHTML;
  btnReset.disabled = true;
  btnReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

  try {
    if (isStaticMode) {
      const sampleHistory = generateSampleDataClient();
      globalData = performFullAnalysisClient(sampleHistory);
      globalData.is_custom_dataset = false;
      showAlert('Reset back to official municipal sample dataset.', 'info');
    } else {
      const response = await fetch('/api/reset', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reset data.');
      }
      globalData = result.data;
      showAlert('Reset back to official municipal sample dataset.', 'info');
    }

    selectedFile = null;
    const fileDisplay = document.getElementById('selected-file-display');
    if (fileDisplay) fileDisplay.style.display = 'none';
    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) fileInput.value = '';

    updateDashboardMetrics(globalData);
    renderConsumptionChart(globalData, currentTimeframe);
    renderSeasonalChart(globalData.seasonal_effects);
    updateForecastTable(globalData.forecast);
    updateTestEvaluationTable(globalData.test_comparisons);

  } catch (error) {
    showAlert(`Reset failed: ${error.message}`, 'error');
  } finally {
    btnReset.disabled = false;
    btnReset.innerHTML = originalHtml;
  }
}

function toggleTestSetTable() {
  const body = document.getElementById('test-set-accordion-body');
  const arrow = document.getElementById('accordion-arrow');
  if (!body) return;

  if (body.style.display === 'none' || !body.style.display) {
    body.style.display = 'block';
    if (arrow) arrow.className = 'fa-solid fa-chevron-up';
  } else {
    body.style.display = 'none';
    if (arrow) arrow.className = 'fa-solid fa-chevron-down';
  }
}

function switchInfoTab(tabId) {
  const tabs = ['objective', 'methodology', 'technologies', 'applications'];
  tabs.forEach(id => {
    const el = document.getElementById(`tab-${id}`);
    if (el) el.style.display = (id === tabId) ? 'block' : 'none';
  });

  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabId)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (consumptionChart) consumptionChart.resize();
    if (seasonalChart) seasonalChart.resize();
  }, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  initUploadHandlers();
  fetchDashboardData();
});
