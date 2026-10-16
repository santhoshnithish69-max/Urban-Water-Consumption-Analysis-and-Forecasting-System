/**
 * Urban Water Consumption Analysis and Forecasting System
 * Client-Side JavaScript Logic
 * 
 * Features:
 * - Dynamic data fetching from Flask REST API
 * - Chart.js interactive time-series chart with actual vs forecast lines and boundary indicator
 * - Chart.js seasonal effects bar chart
 * - Dynamic KPI counters & statistical cards
 * - Real historical test set MAE & formula calculation
 * - Drag-and-drop CSV upload with thorough validation & error toasts
 * - CSV download triggers and sample reset
 * - Timeframe filtering (All, 24M, 12M)
 */

// Global state variables
let globalData = null;
let consumptionChart = null;
let seasonalChart = null;
let selectedFile = null;
let currentTimeframe = 'all';

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

  // Auto hide after 6 seconds
  clearTimeout(window.alertTimer);
  window.alertTimer = setTimeout(() => {
    closeAlert();
  }, 6500);
}

function closeAlert() {
  const container = document.getElementById('alert-container');
  container.style.display = 'none';
}

/**
 * Custom vertical boundary line plugin for Chart.js
 * Draws a clean dashed indicator where the forecast begins
 */
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

    // Boundary label
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('Forecast Starts', x, topY + 14);
    ctx.restore();
  }
};

/**
 * Render or update the Main Line Chart
 */
function renderConsumptionChart(data, timeframe = 'all') {
  const ctx = document.getElementById('consumptionChart').getContext('2d');
  
  // Filter history based on timeframe button
  let historyData = [...data.history];
  if (timeframe === 24 && historyData.length > 24) {
    historyData = historyData.slice(-24);
  } else if (timeframe === 12 && historyData.length > 12) {
    historyData = historyData.slice(-12);
  }

  const forecastData = [...data.forecast];
  const lastHistoryPoint = historyData[historyData.length - 1];

  // Combined labels: filtered history months + forecast months
  const labels = [
    ...historyData.map(item => item.display_month || formatMonthName(item.month)),
    ...forecastData.map(item => item.display_month || formatMonthName(item.month))
  ];

  // Actual series: values for history, null for forecast
  const actualValues = [
    ...historyData.map(item => item.consumption),
    ...forecastData.map(() => null)
  ];

  // Forecast series: null for history except connecting the last history point, then forecast values
  const forecastValues = [
    ...historyData.slice(0, -1).map(() => null),
    lastHistoryPoint.consumption,
    ...forecastData.map(item => item.consumption)
  ];

  // Boundary index in current view
  const boundaryIndex = historyData.length - 1;

  // Background aquatic gradient for actuals
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
        legend: {
          display: false // Using custom legend above chart
        },
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
          grid: {
            color: '#f1f5f9',
            drawBorder: false
          },
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
          grid: {
            color: '#e2e8f0',
            drawBorder: false
          },
          ticks: {
            font: { family: 'Inter', size: 11 },
            color: '#64748b',
            callback: function(value) {
              return value + ' ML';
            }
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

  // Update chart counter label
  document.getElementById('chart-point-count').textContent =
    `Showing ${historyData.length} historical months + 6 forecast months`;
}

/**
 * Render or update Seasonal Effects Bar Chart
 */
function renderSeasonalChart(seasonalEffects) {
  const ctx = document.getElementById('seasonalChart').getContext('2d');
  const labels = seasonalEffects.map(item => item.month_name);
  const values = seasonalEffects.map(item => item.effect);

  // Color positive effects in warm amber/orange (summer peak) and negative in cool ocean blue
  const backgroundColors = values.map(val =>
    val >= 0 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(2, 132, 199, 0.85)'
  );
  const borderColors = values.map(val =>
    val >= 0 ? '#d97706' : '#0284c7'
  );

  // Identify peak and low
  let maxItem = seasonalEffects[0];
  let minItem = seasonalEffects[0];
  seasonalEffects.forEach(item => {
    if (item.effect > maxItem.effect) maxItem = item;
    if (item.effect < minItem.effect) minItem = item;
  });

  document.getElementById('peak-season-month').textContent =
    `${maxItem.month_name} (${maxItem.effect >= 0 ? '+' : ''}${maxItem.effect} ML)`;
  document.getElementById('low-season-month').textContent =
    `${minItem.month_name} (${minItem.effect >= 0 ? '+' : ''}${minItem.effect} ML)`;

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
            callback: function(val) {
              return (val >= 0 ? '+' : '') + val;
            }
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

/**
 * Populate KPI metric cards with dynamic backend values
 */
function updateDashboardMetrics(data) {
  // 1. Total Historical
  document.getElementById('kpi-total').textContent = integerFormatter.format(data.total_historical_consumption);
  document.getElementById('kpi-total-sub').textContent =
    `Across ${data.historical_count} recorded months (${data.start_month} – ${data.end_month})`;

  // 2. Average Monthly
  document.getElementById('kpi-avg').textContent = numberFormatter.format(data.average_monthly_consumption);
  document.getElementById('kpi-avg-sub').textContent =
    `Peak: ${data.max_record.value} ML (${data.max_record.month})`;

  // 3. Next Month Forecast
  document.getElementById('kpi-next').textContent = numberFormatter.format(data.next_month_consumption);
  document.getElementById('kpi-next-month').textContent =
    `Target: ${formatMonthName(data.next_month)}`;

  const nextPill = document.getElementById('kpi-next-pill');
  const nextDiffEl = document.getElementById('kpi-next-diff');
  const diff = data.next_month_diff;
  const pct = data.next_month_pct;
  const isUp = diff >= 0;

  nextPill.className = `metric-trend-pill ${isUp ? 'up' : 'down'}`;
  nextPill.innerHTML = isUp
    ? `<i class="fa-solid fa-arrow-trend-up"></i> +${numberFormatter.format(diff)} ML (+${pct}%)`
    : `<i class="fa-solid fa-arrow-trend-down"></i> ${numberFormatter.format(diff)} ML (${pct}%)`;

  // 4. Model Error (MAE)
  document.getElementById('kpi-mae').textContent = numberFormatter.format(data.mae);
  document.getElementById('kpi-mae-sub').textContent =
    `MAPE: ${data.mape}% (Back-tested on ${data.test_months_count} months)`;
  document.getElementById('mae-badge').textContent = `MAE: ${data.mae} ML`;

  // 5. Trend Indicator
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

  // Header Source Meta
  const datasetNameEl = document.getElementById('dataset-name');
  if (data.is_custom_dataset) {
    datasetNameEl.innerHTML = `<span style="color: #38bdf8;">Custom Upload (${data.uploaded_filename || 'CSV Data'})</span>`;
  } else {
    datasetNameEl.textContent = `Default Municipal Sample (${data.historical_count} Months)`;
  }
  document.getElementById('dataset-range').textContent = `${data.start_month} – ${data.end_month}`;

  // MAE Section details
  document.getElementById('mae-formula-val').textContent = `${data.mae} Megaliters`;
  document.getElementById('mape-formula-val').textContent = `${data.mape}%`;
  document.getElementById('formula-intercept').textContent = `${data.intercept} ML`;
  document.getElementById('formula-slope').textContent = `${slopeSign}${data.slope_monthly}`;
}

/**
 * Populate 6-Month Forecast Table
 */
function updateForecastTable(forecast) {
  const tbody = document.getElementById('forecast-table-body');
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

/**
 * Populate Test Set Evaluation Table
 */
function updateTestEvaluationTable(testComparisons) {
  const tbody = document.getElementById('test-evaluation-tbody');
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
 * Fetch and refresh all dashboard data from backend API
 */
async function fetchDashboardData() {
  const overlay = document.getElementById('chart-loading-overlay');
  overlay.style.display = 'flex';

  try {
    const response = await fetch('/api/forecast');
    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to calculate predictions.');
    }

    globalData = result.data;
    updateDashboardMetrics(globalData);
    renderConsumptionChart(globalData, currentTimeframe);
    renderSeasonalChart(globalData.seasonal_effects);
    updateForecastTable(globalData.forecast);
    updateTestEvaluationTable(globalData.test_comparisons);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    showAlert(`Failed to load forecast data: ${error.message}`, 'error');
  } finally {
    overlay.style.display = 'none';
  }
}

/**
 * Change Timeframe Filter (All, 24M, 12M)
 */
function setTimeframeFilter(timeframe) {
  currentTimeframe = timeframe;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));

  if (timeframe === 'all') {
    document.getElementById('btn-filter-all').classList.add('active');
  } else if (timeframe === 24) {
    document.getElementById('btn-filter-24').classList.add('active');
  } else if (timeframe === 12) {
    document.getElementById('btn-filter-12').classList.add('active');
  }

  if (globalData) {
    renderConsumptionChart(globalData, timeframe);
  }
}

/**
 * Drag and Drop & File Input Setup
 */
function initUploadHandlers() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('csv-file-input');
  const fileDisplay = document.getElementById('selected-file-display');
  const fileNameEl = document.getElementById('selected-file-name');
  const fileSizeEl = document.getElementById('selected-file-size');

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
      fileDisplay.style.display = 'none';
      return;
    }
    selectedFile = file;
    fileNameEl.textContent = file.name;
    const sizeKb = (file.size / 1024).toFixed(1);
    fileSizeEl.textContent = `(${sizeKb} KB)`;
    fileDisplay.style.display = 'inline-flex';
    showAlert(`Selected '${file.name}'. Click 'Upload & Regenerate Predictions' to proceed.`, 'info');
  }
}

/**
 * Submit CSV file to Flask /api/upload endpoint
 */
async function uploadCsvFile() {
  if (!selectedFile) {
    showAlert('Please select or drop a CSV file first.', 'error');
    return;
  }

  const btnSubmit = document.getElementById('btn-submit-upload');
  const originalHtml = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating & Processing...';

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to process CSV file.');
    }

    showAlert(result.message || 'Dataset uploaded and verified successfully!', 'success');
    
    // Refresh dashboard with uploaded dataset
    globalData = result.data;
    updateDashboardMetrics(globalData);
    renderConsumptionChart(globalData, currentTimeframe);
    renderSeasonalChart(globalData.seasonal_effects);
    updateForecastTable(globalData.forecast);
    updateTestEvaluationTable(globalData.test_comparisons);

    // Smooth scroll back to chart
    document.getElementById('chart-section').scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Upload error:', error);
    showAlert(`CSV Error: ${error.message}`, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalHtml;
  }
}

/**
 * Reset data back to default sample dataset
 */
async function resetToSampleData() {
  const btnReset = document.getElementById('btn-reset-data');
  const originalHtml = btnReset.innerHTML;
  btnReset.disabled = true;
  btnReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

  try {
    const response = await fetch('/api/reset', { method: 'POST' });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to reset data.');
    }

    selectedFile = null;
    document.getElementById('selected-file-display').style.display = 'none';
    document.getElementById('csv-file-input').value = '';

    showAlert('Reset back to official municipal sample dataset.', 'info');

    globalData = result.data;
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

/**
 * Toggle Test Set Evaluation breakdown accordion
 */
function toggleTestSetTable() {
  const body = document.getElementById('test-set-accordion-body');
  const arrow = document.getElementById('accordion-arrow');

  if (body.style.display === 'none' || !body.style.display) {
    body.style.display = 'block';
    arrow.className = 'fa-solid fa-chevron-up';
  } else {
    body.style.display = 'none';
    arrow.className = 'fa-solid fa-chevron-down';
  }
}

/**
 * Switch Information Tabs for Project Documentation
 */
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

// Window resize handler for responsive charts
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (consumptionChart) consumptionChart.resize();
    if (seasonalChart) seasonalChart.resize();
  }, 150);
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initUploadHandlers();
  fetchDashboardData();
});
