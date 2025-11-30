const API_BASE = "http://localhost:8000";

const state = {
  options: null,
  chart: null,
  lastPreview: [],
  lastResult: null,
  featureDefinition: null,
  selectedCategory: null,
  chartUnavailableNotified: false,
  chartComponentsRegistered: false,
};

const elements = {
  form: document.getElementById("control-form"),
  categorySelect: document.getElementById("model-category"),
  modelSelect: document.getElementById("model-type"),
  variantSelect: document.getElementById("variant-id"),
  regionSelect: document.getElementById("region-select"),
  horizonInput: document.getElementById("horizon-input"),
  featureControls: document.getElementById("feature-controls"),
  metrics: document.getElementById("metrics"),
  previewBody: document.getElementById("preview-body"),
  previewCount: document.getElementById("preview-count"),
  message: document.getElementById("message"),
  runBtn: document.getElementById("run-btn"),
  loader: document.getElementById("global-loader"),
  summaryList: document.getElementById("summary-list"),
  modelPill: document.getElementById("model-pill"),
  variantHint: document.getElementById("variant-hint"),
  healthIndicator: document.getElementById("health-indicator"),
  downloadPreview: document.getElementById("download-preview"),
  resetBtn: document.getElementById("reset-form"),
  resetZoomBtn: document.getElementById("reset-zoom"),
  progressIndicator: document.getElementById("progress-indicator"),
  progressPercent: document.getElementById("progress-percent"),
  progressFill: document.getElementById("progress-bar-fill"),
};

function ensureChartLib() {
  const chartGlobal = window.Chart;
  if (!chartGlobal) {
    if (!state.chartUnavailableNotified) {
      console.error("Chart.js 未加载或初始化失败，无法渲染图表。");
      setMessage("图表组件未加载成功，请刷新页面或检查网络后重试。", "error");
      state.chartUnavailableNotified = true;
    }
    return null;
  }

  let ChartCtor = null;
  if (typeof chartGlobal === "function") {
    ChartCtor = chartGlobal;
  } else if (chartGlobal && typeof chartGlobal === "object") {
    ChartCtor = chartGlobal.Chart || chartGlobal.ChartJS || chartGlobal.default || null;
  }

  if (!ChartCtor) {
    if (!state.chartUnavailableNotified) {
      console.error("Chart.js 已加载，但未找到构造函数。可尝试刷新或改用本地脚本。");
      setMessage("图表组件加载异常，请刷新页面重试。", "error");
      state.chartUnavailableNotified = true;
    }
    return null;
  }

  state.chartUnavailableNotified = false;
  if (!state.chartComponentsRegistered) {
    const registerablesSource = chartGlobal && typeof chartGlobal === "object" ? chartGlobal : ChartCtor;
    const registerables = registerablesSource?.registerables;
    if (Array.isArray(registerables) && typeof ChartCtor.register === "function") {
      try {
        ChartCtor.register(...registerables);
        state.chartComponentsRegistered = true;
      } catch (err) {
        console.warn("注册 Chart.js 组件时出错", err);
      }
    }
  }
  return { ChartCtor, namespace: chartGlobal };
}

function setStep(step) {
  document.querySelectorAll(".step-item").forEach((item) => {
    const idx = Number(item.dataset.step);
    item.classList.toggle("active", idx <= step);
    item.classList.toggle("current", idx === step);
  });
}

function setMessage(text, type = "info") {
  elements.message.textContent = text;
  elements.message.className = `status-banner ${type}`;
}

function setLoading(isLoading) {
  if (elements.runBtn) {
    elements.runBtn.disabled = isLoading;
  }
}

function hideProgress() {
  if (!elements.progressIndicator) return;
  elements.progressIndicator.classList.add("hidden");
  if (elements.progressPercent) elements.progressPercent.textContent = "0%";
  if (elements.progressFill) elements.progressFill.style.width = "0%";
}

function showProgress(totalSteps) {
  if (!elements.progressIndicator) return;
  elements.progressIndicator.classList.remove("hidden");
  updateProgress(0, totalSteps);
}

function updateProgress(currentStep, totalSteps) {
  if (!elements.progressIndicator) return;
  const percent = totalSteps <= 0 ? 0 : Math.round((currentStep / totalSteps) * 100);
  if (elements.progressPercent) elements.progressPercent.textContent = `${percent}%`;
  if (elements.progressFill) elements.progressFill.style.width = `${percent}%`;
}

function updateMatchPill(matched) {
  if (!elements.modelPill) return;
  if (matched) {
    elements.modelPill.textContent = "特征配置已匹配";
    elements.modelPill.className = "pill success";
  } else {
    elements.modelPill.textContent = "已回退默认配置";
    elements.modelPill.className = "pill warning";
  }
}

function setHealthIndicator(status, text) {
  if (!elements.healthIndicator) return;
  elements.healthIndicator.textContent = text;
  elements.healthIndicator.style.background =
    status === "ok" ? "rgba(21,125,66,0.15)" : "rgba(220,47,47,0.25)";
  elements.healthIndicator.style.color = status === "ok" ? "#c8f5d7" : "#ffd6d6";
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error("health check failed");
    const data = await res.json();
    setHealthIndicator("ok", data.status === "ok" ? "服务正常" : "待检查");
  } catch (error) {
    console.error(error);
    setHealthIndicator("error", "服务异常");
  }
}

async function fetchOptions() {
  setMessage("正在加载可用模型与区域...", "info");
  try {
    const res = await fetch(`${API_BASE}/api/options`);
    if (!res.ok) {
      throw new Error(`加载配置失败: ${res.status}`);
    }
    const data = await res.json();
    state.options = data;
    state.featureDefinition = data.featureControls;
    populateCategories(data.modelCategories);
    populateRegions(data.regions);
    populateFeatureControls(data.featureControls);
    refreshSummary();
    setMessage("准备就绪，请配置预测任务。", "success");
  } catch (error) {
    console.error(error);
    setMessage(error.message || "无法加载系统配置。", "error");
  }
}

function populateCategories(categories) {
  if (!elements.categorySelect) return;
  elements.categorySelect.innerHTML = '<option value="" disabled selected>请选择模型领域</option>';
  (categories || []).forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    if (item.disabled) option.disabled = true;
    elements.categorySelect.appendChild(option);
  });
  state.selectedCategory = null;
  if (elements.modelSelect) {
    elements.modelSelect.disabled = true;
    elements.modelSelect.innerHTML = '<option value="" disabled selected>请选择算法</option>';
  }
  if (elements.variantSelect) {
    elements.variantSelect.innerHTML = '<option value="" selected>自动匹配 (根据特征)</option>';
    elements.variantSelect.disabled = true;
  }
  setStep(1);
}

function populateModels(models) {
  if (!elements.modelSelect) return;
  elements.modelSelect.disabled = !(models && models.length);
  elements.modelSelect.innerHTML = '<option value="" disabled selected>请选择算法</option>';
  if (!models || models.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "该领域暂无可用算法";
    option.disabled = true;
    elements.modelSelect.appendChild(option);
    if (elements.variantSelect) {
      elements.variantSelect.disabled = true;
    }
    setMessage("该模型领域暂无可用算法。", "info");
    return;
  }
  if (elements.variantSelect) {
    elements.variantSelect.disabled = false;
  }
  models.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.type;
    option.textContent = item.label;
    elements.modelSelect.appendChild(option);
  });
  elements.modelSelect.value = "";
  setStep(1);
}

function populateVariants(modelType) {
  elements.variantSelect.innerHTML = '<option value="" selected>自动匹配 (根据特征)</option>';
  const variants = (state.options?.models || []).find((item) => item.type === modelType)?.variants || [];
  elements.variantSelect.disabled = variants.length === 0;
  variants.forEach((variant) => {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = variant.label;
    option.dataset.features = JSON.stringify(variant.features);
    elements.variantSelect.appendChild(option);
  });
  if (variants.length) {
    applyVariantFeatures(modelType, variants[0].id);
    elements.variantHint.textContent = "已根据默认模型配置预填特征，可自行调整。";
  } else {
    clearFeatureSelections();
    elements.variantHint.textContent = "该模型暂无可选配置，保留手动选择。";
  }
  refreshSummary();
}

function onCategoryChange(event) {
  const categoryId = event.target.value;
  state.selectedCategory = categoryId || null;
  const category = (state.options?.modelCategories || []).find((item) => item.id === categoryId);
  const models = category?.models || [];
  populateModels(models);
  elements.variantSelect.innerHTML = '<option value="" selected>自动匹配 (根据特征)</option>';
  clearFeatureSelections();
  elements.variantHint.textContent = "将根据特征选择自动匹配预训练模型。";
  setStep(1);
  refreshSummary();
}

function populateRegions(regions) {
  elements.regionSelect.innerHTML = '<option value="" disabled selected>请选择区域</option>';
  regions.forEach((region) => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    elements.regionSelect.appendChild(option);
  });
}

function populateFeatureControls(featureControls) {
  const container = elements.featureControls;
  if (!container) return;
  state.featureDefinition = featureControls;
  container.innerHTML = "";
  const sections = featureControls?.sections || [];
  sections.forEach((section) => {
    const block = document.createElement("div");
    block.className = "feature-block";
    block.innerHTML = `<h4>${section.label}</h4>`;
    const group = document.createElement("div");
    group.className = "feature-checkbox-group";
    section.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "checkbox-field";
      label.innerHTML = `<input type="checkbox" value="${option.value}" data-section="${section.id}"> ${option.label}`;
      group.appendChild(label);
    });
    block.appendChild(group);
    container.appendChild(block);
  });
}

function clearFeatureSelections() {
  if (!elements.featureControls) return;
  elements.featureControls.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
}

function applyVariantFeatures(modelType, variantId) {
  const model = (state.options?.models || []).find((item) => item.type === modelType);
  if (!model) {
    clearFeatureSelections();
    return;
  }
  const variant = model.variants.find((item) => item.id === variantId);
  if (!variant) {
    clearFeatureSelections();
    return;
  }
  const features = variant.features || {};

  clearFeatureSelections();

  const markChecked = (sectionId, matcher) => {
    if (!elements.featureControls) return;
    const inputs = elements.featureControls.querySelectorAll(`input[data-section="${sectionId}"]`);
    inputs.forEach((input) => {
      if (matcher(input)) {
        input.checked = true;
      }
    });
  };

  markChecked("time", (input) => (features.time || []).includes(input.value));
  markChecked("cyclical", (input) => (features.cyclical || []).includes(input.value));

  const lagValues = features.lags || [];
  if (Array.isArray(lagValues) && lagValues.length) {
    const maxLag = Math.max(...lagValues.map((value) => Number(value)));
    markChecked("lags", (input) => Number(input.value) === maxLag);
  }

  markChecked(
    "rolling_windows",
    (input) => (features.rolling_windows || []).some((value) => Number(input.value) === Number(value))
  );
  markChecked("rolling_stats", (input) => (features.rolling_stats || []).includes(input.value));
  markChecked(
    "diff_periods",
    (input) => (features.diff_periods || []).some((value) => Number(input.value) === Number(value))
  );

  updateVariantHint(modelType, variantId, features);
  refreshSummary();
}

function updateVariantHint(modelType, variantId, features) {
  const parts = [];
  if (features.time?.length) parts.push(`时间特征: ${features.time.join(", ")}`);
  if (features.cyclical?.length) parts.push(`周期编码: ${features.cyclical.join(", ")}`);
  if (features.lags?.length) parts.push(`滞后: ${Math.max(...features.lags)} 阶`);
  if (features.rolling_windows?.length) parts.push(`滚动窗口: ${features.rolling_windows.join(", ")}`);
  if (features.diff_periods?.length) parts.push(`差分: ${features.diff_periods.join(", ")}`);
  if (parts.length === 0) {
    elements.variantHint.textContent = "自定义特征将用于模型匹配，未匹配将回退默认配置。";
  } else {
    elements.variantHint.textContent = parts.join(" | ");
  }
}

function gatherFeatureSelection() {
  const selection = {
    time: [],
    cyclical: [],
    lags: null,
    rolling_windows: [],
    rolling_stats: [],
    diff_periods: [],
  };

  if (!elements.featureControls) {
    return selection;
  }

  const sections = state.featureDefinition?.sections || [];
  sections.forEach((section) => {
    const inputs = Array.from(
      elements.featureControls.querySelectorAll(`input[data-section="${section.id}"]:checked`)
    );
    if (inputs.length === 0) return;
    const values = inputs
      .map((input) => {
        if (section.valueType === "number") {
          const value = Number(input.value);
          return Number.isNaN(value) ? null : value;
        }
        return input.value;
      })
      .filter((value) => value !== null);
    if (section.id === "time") selection.time = values;
    if (section.id === "cyclical") selection.cyclical = values;
    if (section.id === "lags" && values.length) {
      const maxLag = Math.max(...values.map((value) => Number(value)));
      if (!Number.isNaN(maxLag) && maxLag > 0) {
        selection.lags = maxLag;
      }
    }
    if (section.id === "rolling_windows") selection.rolling_windows = values;
    if (section.id === "rolling_stats") selection.rolling_stats = values;
    if (section.id === "diff_periods") selection.diff_periods = values;
  });

  return selection;
}

function getModelLabel(type) {
  return state.options?.models?.find((item) => item.type === type)?.label || "—";
}

function getCategoryLabel(categoryId) {
  if (!categoryId) return "—";
  return state.options?.modelCategories?.find((item) => item.id === categoryId)?.label || "—";
}

function getVariantLabel(modelType, variantId) {
  if (!variantId) return "自动匹配";
  const variants = state.options?.models?.find((item) => item.type === modelType)?.variants || [];
  return variants.find((v) => v.id === variantId)?.label || "自动匹配";
}

function featuresToText(selection) {
  const blocks = [];
  if (selection.time?.length) blocks.push(`时间: ${selection.time.join("/ ")}`);
  if (selection.cyclical?.length) blocks.push(`周期: ${selection.cyclical.join("/ ")}`);
  if (selection.lags) blocks.push(`滞后: ${selection.lags}`);
  if (selection.rolling_windows?.length) blocks.push(`滚动窗口: ${selection.rolling_windows.join("、")}`);
  if (selection.rolling_stats?.length) blocks.push(`滚动统计: ${selection.rolling_stats.join("/ ")}`);
  if (selection.diff_periods?.length) blocks.push(`差分: ${selection.diff_periods.join("、")}`);
  return blocks.length ? blocks.join(" | ") : "等待选择";
}

function refreshSummary() {
  const selection = gatherFeatureSelection();
  const categoryId = elements.categorySelect ? elements.categorySelect.value : "";
  const modelType = elements.modelSelect.value;
  const variantId = elements.variantSelect.value;
  const region = elements.regionSelect.value;
  const horizon = elements.horizonInput.value || (state.lastResult?.horizon ?? "默认 6");

  const items = [
    { label: "模型领域", value: getCategoryLabel(categoryId) },
    { label: "预测算法", value: modelType ? getModelLabel(modelType) : "—" },
    { label: "模型配置", value: getVariantLabel(modelType, variantId) },
    { label: "预测区域", value: region || "—" },
    { label: "Horizon", value: horizon },
    { label: "特征", value: featuresToText(selection) },
  ];

  elements.summaryList.innerHTML = items
    .map(
      (item) => `
      <li>
        <span>${item.label}</span>
        <strong class="value ${item.value === "—" || item.value === "等待选择" ? "muted" : ""}">${item.value}</strong>
      </li>`
    )
    .join("");
}

function renderMetrics(metrics) {
  elements.metrics.innerHTML = "";
  if (!metrics || Object.keys(metrics).length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "metric-card placeholder";
    placeholder.innerHTML = "<h4>指标待更新</h4><p>运行预测后自动填充</p>";
    elements.metrics.appendChild(placeholder);
    return;
  }
  Object.entries(metrics).forEach(([key, value]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    const displayValue = typeof value === "number" ? value.toFixed(3) : value;
    card.innerHTML = `<h4>${key}</h4><p>${displayValue}</p>`;
    elements.metrics.appendChild(card);
  });
}

function renderPreview(preview) {
  state.lastPreview = preview || [];
  elements.previewBody.innerHTML = "";

  if (!preview || preview.length === 0) {
    const row = document.createElement("tr");
    row.className = "placeholder-row";
    row.innerHTML = '<td colspan="4">运行预测后展示完整测试集数据。</td>';
    elements.previewBody.appendChild(row);
    if (elements.previewCount) {
      elements.previewCount.textContent = "0";
    }
    return;
  }

  // Update count display
  if (elements.previewCount) {
    elements.previewCount.textContent = preview.length;
  }

  // Render all data with row numbers
  preview.forEach((item, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.timestamp}</td>
      <td>${typeof item.actual === "number" ? item.actual.toFixed(2) : item.actual}</td>
      <td>${typeof item.predicted === "number" ? item.predicted.toFixed(2) : item.predicted}</td>
    `;
    elements.previewBody.appendChild(row);
  });
}

function updateChart(plot) {
  const ctx = document.getElementById("forecast-chart");
  if (!plot) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    return;
  }
  if (!ctx) return;
  const chartModule = ensureChartLib();
  if (!chartModule) return;
  const { ChartCtor } = chartModule;
  console.debug("Chart 构造函数类型", typeof ChartCtor);
  const labelsCount = Array.isArray(plot.timestamps) ? plot.timestamps.length : 0;
  const actualCount = Array.isArray(plot.actual) ? plot.actual.length : 0;
  const predictedCount = Array.isArray(plot.predicted) ? plot.predicted.length : 0;
  console.debug("更新图表", { labelsCount, actualCount, predictedCount });
  if (state.chart) {
    state.chart.data.labels = plot.timestamps;
    state.chart.data.datasets[0].data = plot.actual;
    state.chart.data.datasets[1].data = plot.predicted;
    state.chart.update();
    return;
  }
  state.chart = new ChartCtor(ctx, {
    type: "line",
    data: {
      labels: plot.timestamps,
      datasets: [
        {
          label: "真实值",
          data: plot.actual,
          borderColor: "#1a47b0",
          backgroundColor: "rgba(26, 71, 176, 0.12)",
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "预测值",
          data: plot.predicted,
          borderColor: "#f26924",
          backgroundColor: "rgba(242, 105, 36, 0.12)",
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { intersect: false, mode: "index" },
      scales: {
        x: {
          ticks: { maxRotation: 45, autoSkip: true },
          title: {
            display: true,
            text: '时间'
          }
        },
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: '数值'
          }
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label?.replace("T", " ") || "",
          },
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy',
          },
          limits: {
            x: { min: 'original', max: 'original' },
            y: { min: 'original', max: 'original' }
          }
        }
      },
    },
  });
}

async function animatePrediction(result) {
  const steps = result.progress || [];
  if (!steps.length) {
    updateChart(result.plot);
    return;
  }

  const chartModule = ensureChartLib();
  if (!chartModule) {
    hideProgress();
    return;
  }
  const { ChartCtor } = chartModule;
  console.debug("Chart 构造函数类型", typeof ChartCtor);

  const ctx = document.getElementById("forecast-chart");
  if (!ctx) return;
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  state.chart = new ChartCtor(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "真实值",
          data: [],
          borderColor: "#1a47b0",
          backgroundColor: "rgba(26, 71, 176, 0.12)",
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "预测值",
          data: [],
          borderColor: "#f26924",
          backgroundColor: "rgba(242, 105, 36, 0.12)",
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      scales: {
        x: {
          ticks: { maxRotation: 45, autoSkip: true },
          title: {
            display: true,
            text: '时间'
          }
        },
        y: {
          beginAtZero: false,
          title: {
            display: true,
            text: '数值'
          }
        },
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label?.replace("T", " ") || "",
          },
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy',
          },
          limits: {
            x: { min: 'original', max: 'original' },
            y: { min: 'original', max: 'original' }
          }
        }
      },
    },
  });

  const total = steps.length;
  const labels = [];
  const actualData = [];
  const predictedData = [];
  const delay = Math.max(6, Math.min(30, Math.floor(4000 / total)));

  showProgress(total);

  for (let i = 0; i < total; i += 1) {
    const step = steps[i];
    labels.push(step.timestamp);
    predictedData.push(step.predicted);
    actualData.push(step.actual);

    state.chart.data.labels = labels.slice();
    state.chart.data.datasets[0].data = actualData.slice();
    state.chart.data.datasets[1].data = predictedData.slice();
    state.chart.update("none");

    updateProgress(i + 1, total);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  state.chart.update();
  hideProgress();
}

async function handleSubmit(event) {
  event.preventDefault();
  const categoryId = elements.categorySelect ? elements.categorySelect.value : "";
  const modelType = elements.modelSelect.value;
  const region = elements.regionSelect.value;
  if (!categoryId) {
    setMessage("请先选择模型领域。", "error");
    return;
  }
  if (!modelType || !region) {
    setMessage("请先选择预测算法与区域。", "error");
    return;
  }

  const variantId = elements.variantSelect.value || null;
  const horizonRaw = elements.horizonInput ? elements.horizonInput.value.trim() : "";
  let horizonUsed = Number.parseInt(horizonRaw, 10);
  if (Number.isNaN(horizonUsed) || horizonUsed <= 0) {
    horizonUsed = 6;
  }
  const featureSelection = gatherFeatureSelection();

  const payload = {
    model_type: modelType,
    region,
    feature_selection: featureSelection,
  };
  if (variantId) payload.variant_id = variantId;
  payload.horizon = horizonUsed;

  hideProgress();
  setMessage("正在执行滚动预测，请稍候...", "info");
  setLoading(true);
  setStep(4);

  try {
    const res = await fetch(`${API_BASE}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.detail || `预测失败: ${res.status}`);
    }
    const result = await res.json();
    state.lastResult = result;
    renderMetrics(result.metrics);
    setLoading(false);
    setMessage("后台计算完成，正在绘制动态预测...", "info");
    await animatePrediction(result);
    // 确保最终展示完整数据
    updateChart(result.plot);
    renderPreview(result.preview);
    setMessage(result.message || "预测完成。", "success");
    const matched = result.feature_match !== false;
    updateMatchPill(matched);
  } catch (error) {
    console.error(error);
    hideProgress();
    setMessage(error.message || "执行预测时发生错误。", "error");
    if (elements.modelPill) {
      elements.modelPill.textContent = "运行失败";
      elements.modelPill.className = "pill warning";
    }
    updateChart(null);
    renderMetrics(null);
    renderPreview([]);
    setStep(3);
    setLoading(false);
  } finally {
    refreshSummary();
  }
}

function onModelChange(event) {
  const modelType = event.target.value;
  populateVariants(modelType);
  setStep(modelType ? 2 : 1);
  refreshSummary();
}

function onVariantChange(event) {
  const variantId = event.target.value;
  const modelType = elements.modelSelect.value;
  if (!modelType) return;
  if (variantId) {
    applyVariantFeatures(modelType, variantId);
  } else {
    elements.variantHint.textContent = "将根据特征选择自动匹配预训练模型。";
    refreshSummary();
  }
}

function onRegionChange(event) {
  const hasRegion = !!event.target.value;
  if (hasRegion) setStep(3);
  refreshSummary();
}

function triggerSummaryRefresh() {
  refreshSummary();
}

function resetForm() {
  elements.form.reset();
  populateCategories(state.options?.modelCategories || []);
  clearFeatureSelections();
  elements.variantHint.textContent = "将根据特征选择自动匹配预训练模型。";
  state.lastResult = null;
  renderMetrics(null);
  renderPreview([]);
  updateChart(null);
  if (elements.modelPill) {
    elements.modelPill.textContent = "等待运行";
    elements.modelPill.className = "pill";
  }
  setMessage("已重置，请重新配置预测参数。", "info");
  setStep(1);
  refreshSummary();
}

function downloadPreview() {
  if (!state.lastPreview || state.lastPreview.length === 0) {
    setMessage("暂无可导出的预览数据。", "info");
    return;
  }
  const header = "timestamp,actual,predicted";
  const rows = state.lastPreview.map((item) => `${item.timestamp},${item.actual},${item.predicted}`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `forecast_preview_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openDocs() {
  window.open(`${API_BASE}/docs`, "_blank", "noopener");
}

function resetZoom() {
  if (state.chart && state.chart.resetZoom) {
    state.chart.resetZoom();
    setMessage("已重置图表缩放。", "info");
  }
}

if (elements.form) elements.form.addEventListener("submit", handleSubmit);
if (elements.categorySelect) elements.categorySelect.addEventListener("change", onCategoryChange);
if (elements.modelSelect) elements.modelSelect.addEventListener("change", onModelChange);
if (elements.variantSelect) elements.variantSelect.addEventListener("change", onVariantChange);
if (elements.regionSelect) elements.regionSelect.addEventListener("change", onRegionChange);
if (elements.horizonInput) elements.horizonInput.addEventListener("input", triggerSummaryRefresh);
if (elements.featureControls) {
  elements.featureControls.addEventListener("change", triggerSummaryRefresh);
  elements.featureControls.addEventListener("input", triggerSummaryRefresh);
}
if (elements.downloadPreview) elements.downloadPreview.addEventListener("click", downloadPreview);
if (elements.resetBtn) elements.resetBtn.addEventListener("click", resetForm);
if (elements.resetZoomBtn) elements.resetZoomBtn.addEventListener("click", resetZoom);
const docsBtn = document.getElementById("open-docs");
if (docsBtn) docsBtn.addEventListener("click", openDocs);

window.addEventListener("DOMContentLoaded", () => {
  fetchOptions();
  checkHealth();
});
