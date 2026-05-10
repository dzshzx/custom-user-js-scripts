// ==UserScript==
// @name         Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.1.0
// @description  Show Codex quota windows, daily usage, client summaries, and weekly estimates on chatgpt.com.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://gist.github.com/BlueSkyXN/528e810b98affcecca170e6b9d53d7da
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_NAME = 'Codex Quota Compass';
  const LAST_RESULT_KEY = '__codexQuotaCompassLastResult';
  const RUNNING_KEY = '__codexQuotaCompassRunning';
  const ROOT_ID = 'codex-quota-compass-root';
  const BUTTON_POSITION_KEY = 'codexQuotaCompassButtonPosition';
  const DEFAULT_BUTTON_POSITION = { top: 76, right: 24 };

  let root;
  let panel;
  let button;
  let statusNode;
  let contentNode;
  let isPanelOpen = false;
  let isDetailsOpen = false;
  let latestError;
  let pendingRunPromise = null;

  function isUsagePage() {
    return (
      location.hostname === 'chatgpt.com' &&
      location.pathname === '/codex/cloud/settings/analytics' &&
      location.hash === '#usage'
    );
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
    return String(value);
  }

  function safeRows(rows, limit = 12) {
    return Array.isArray(rows) ? rows.slice(0, limit) : [];
  }

  function loadButtonPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BUTTON_POSITION_KEY) || 'null');
      if (
        parsed &&
        Number.isFinite(parsed.left) &&
        Number.isFinite(parsed.top)
      ) {
        return parsed;
      }
    } catch {
      // Ignore invalid persisted UI state.
    }

    return null;
  }

  function persistButtonPosition(left, top) {
    localStorage.setItem(
      BUTTON_POSITION_KEY,
      JSON.stringify({
        left: Math.round(left),
        top: Math.round(top),
      }),
    );
  }

  function clampButtonPosition(left, top) {
    const rect = button?.getBoundingClientRect();
    const width = rect?.width || 172;
    const height = rect?.height || 44;
    const safe = 12;

    return {
      left: Math.min(Math.max(safe, left), window.innerWidth - width - safe),
      top: Math.min(Math.max(safe, top), window.innerHeight - height - safe),
    };
  }

  function applyButtonPosition(position) {
    if (!button) return;

    if (position) {
      const clamped = clampButtonPosition(position.left, position.top);
      button.style.left = `${clamped.left}px`;
      button.style.top = `${clamped.top}px`;
      button.style.right = 'auto';
      return;
    }

    button.style.top = `${DEFAULT_BUTTON_POSITION.top}px`;
    button.style.right = `${DEFAULT_BUTTON_POSITION.right}px`;
    button.style.left = 'auto';
  }

  function setStatus(text, tone = 'idle') {
    if (!statusNode) return;
    statusNode.textContent = text;
    statusNode.dataset.tone = tone;
  }

  function tableHtml(rows, options = {}) {
    const visibleRows = safeRows(rows, options.limit ?? 12);
    const columns = options.columns || [...new Set(visibleRows.flatMap((row) => Object.keys(row || {})))];

    if (!visibleRows.length || !columns.length) {
      return '<div class="cqc-empty">暂无数据</div>';
    }

    const head = columns
      .map((column) => `<th>${escapeHtml(column)}</th>`)
      .join('');
    const body = visibleRows
      .map((row) => (
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(formatValue(row?.[column]))}</td>`)
          .join('')}</tr>`
      ))
      .join('');
    const more = Array.isArray(rows) && rows.length > visibleRows.length
      ? `<div class="cqc-table-note">仅显示前 ${visibleRows.length} 条，共 ${rows.length} 条。完整结果见控制台或 window.${LAST_RESULT_KEY}。</div>`
      : '';

    return `<div class="cqc-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
  }

  function metricHtml(label, value, hint = '') {
    return `
      <div class="cqc-metric">
        <div class="cqc-metric-label">${escapeHtml(label)}</div>
        <div class="cqc-metric-value">${escapeHtml(formatValue(value))}</div>
        ${hint ? `<div class="cqc-metric-hint">${escapeHtml(hint)}</div>` : ''}
      </div>
    `;
  }

  function usdValue(value) {
    return value === null || value === undefined || value === ''
      ? '-'
      : `$${formatValue(value)}`;
  }

  function formatMetricDecimal(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '-';
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function usdMetricValue(value) {
    return value === null || value === undefined || value === ''
      ? '-'
      : `$${formatMetricDecimal(value)}`;
  }

  function creditsMetricHint(value) {
    return `${formatMetricDecimal(value)} Credits`;
  }

  function formatHoursDuration(hours) {
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours)) return '-';

    const totalMinutes = Math.max(0, Math.round(numericHours * 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days} 天 ${remainingHours} 小时`;
    if (remainingHours > 0) return `${remainingHours} 小时 ${minutes} 分钟`;
    return `${minutes} 分钟`;
  }

  function creditMetricHtml(label, usd, credits) {
    return metricHtml(label, usdMetricValue(usd), creditsMetricHint(credits));
  }

  function resetMetricHtml(windowRow) {
    return metricHtml(
      '距离重置',
      formatHoursDuration(windowRow?.距离重置小时),
      windowRow?.下次重置_本地 || '主 7 天窗口',
    );
  }

  function sectionHtml(title, body) {
    return `
      <section class="cqc-section">
        <h3>${escapeHtml(title)}</h3>
        ${body}
      </section>
    `;
  }

  function detailFootnoteHtml(action, label) {
    return `
      <div class="cqc-detail-footnote">
        <button type="button" data-action="${escapeHtml(action)}">${escapeHtml(label)}</button>
      </div>
    `;
  }

  function renderResult(result) {
    if (!contentNode) return;

    const weekly = result?.主7天窗口_上次重置至今?.反推周额度 || {};
    const sinceReset = result?.主7天窗口_上次重置至今?.汇总 || {};
    const month = result?.本月初至今?.汇总 || {};
    const rollingKey = Object.keys(result || {}).find((key) => key.startsWith('近'));
    const rolling = rollingKey ? result?.[rollingKey]?.汇总 : {};
    const rollingRows = rollingKey ? result?.[rollingKey]?.每日明细 : [];
    const sinceResetRows = result?.主7天窗口_上次重置至今?.每日明细 || [];
    const sinceResetClients = result?.主7天窗口_上次重置至今?.客户端汇总 || [];
    const mainSevenDayWindow = (result?.限制窗口概览 || []).find(
      (row) => row?.名称 === '主限制 - 7天窗口',
    );

    contentNode.innerHTML = `
      <div class="cqc-metrics">
        ${creditMetricHtml('剩余 USD · 含重置日', weekly.剩余USD_包含重置日口径, weekly.剩余Credits_包含重置日口径)}
        ${creditMetricHtml('剩余 USD · 排除重置日', weekly.剩余USD_排除重置日口径, weekly.剩余Credits_排除重置日口径)}
        ${creditMetricHtml('周总额度 · 含重置日', weekly.反推周总USD_包含重置日, weekly.反推周总Credits_包含重置日)}
        ${creditMetricHtml('周总额度 · 排除重置日', weekly.反推周总USD_排除重置日, weekly.反推周总Credits_排除重置日)}
        ${metricHtml('7 天已用', weekly.已用百分比 !== undefined ? `${weekly.已用百分比}%` : '-', 'secondary_window')}
        ${metricHtml('上次重置至今', usdMetricValue(sinceReset.累计折算USD), creditsMetricHint(sinceReset.累计Credits))}
        ${metricHtml('本月累计', usdMetricValue(month.累计折算USD), creditsMetricHint(month.累计Credits))}
        ${resetMetricHtml(mainSevenDayWindow)}
      </div>

      ${
        isDetailsOpen
          ? `
      <div class="cqc-details">
      ${sectionHtml('周额度估算', tableHtml([weekly], {
        columns: [
          '已用百分比',
          '剩余比例小数',
          '包含重置日_已用折算USD',
          '反推周总USD_包含重置日',
          '剩余USD_包含重置日口径',
          '包含重置日_已用Credits',
          '剩余Credits_包含重置日口径',
          '排除重置日_已用折算USD',
          '剩余USD_排除重置日口径',
          '排除重置日_已用Credits',
          '剩余Credits_排除重置日口径',
          '误差说明',
        ],
      }))}

      ${sectionHtml('区间汇总', tableHtml([sinceReset, month, rolling], {
        columns: ['范围', '累计折算USD', '累计Credits', '返回日期桶数', '累计Token', '累计线程数', '累计轮数'],
      }))}

      ${sectionHtml('限制窗口', tableHtml(result?.限制窗口概览, {
        columns: ['名称', '已用百分比', '窗口天数', '本轮开始_本地', '下次重置_本地', '距离重置小时'],
      }))}

      ${sectionHtml('上次重置至今每日明细', tableHtml(sinceResetRows, {
        columns: ['日期桶', '折算USD', 'Credits', '线程数', '轮数', 'Token总量', '客户端Credits'],
      }))}

      ${sectionHtml('客户端汇总', tableHtml(sinceResetClients, {
        columns: ['客户端', '折算USD', 'Credits', '线程数', '轮数', 'Token总量'],
      }))}

      ${sectionHtml(`${rollingKey || '近 N 天'}每日明细`, tableHtml(rollingRows, {
        columns: ['日期桶', '折算USD', 'Credits', '线程数', '轮数', 'Token总量', '客户端Credits'],
      }))}
        ${detailFootnoteHtml('hide-details', '收起详情')}
      </div>
      `
          : detailFootnoteHtml('show-details', '计算详情')
      }
    `;
  }

  function renderLoading() {
    if (!contentNode) return;
    contentNode.innerHTML = `
      <div class="cqc-loading">
        <div class="cqc-spinner"></div>
        <div>
          <strong>正在计算 Codex 用量</strong>
          <span>会请求 usage 和 daily analytics 接口，结果不会包含 token 或 cookie。</span>
        </div>
      </div>
    `;
  }

  function renderError(error) {
    if (!contentNode) return;
    latestError = error;
    contentNode.innerHTML = `
      <div class="cqc-error">
        <strong>计算失败</strong>
        <p>${escapeHtml(error?.message || error || '未知错误')}</p>
        <button type="button" class="cqc-refresh" data-action="refresh">重试</button>
      </div>
    `;
  }

  function openPanel() {
    if (!panel) return;
    positionPanelNearButton();
    isPanelOpen = true;
    panel.hidden = false;
    requestAnimationFrame(() => {
      panel?.classList.add('is-open');
    });
    button?.classList.add('is-active');
  }

  function closePanel() {
    if (!panel) return;
    isPanelOpen = false;
    panel.classList.remove('is-open');
    window.setTimeout(() => {
      if (!isPanelOpen && panel) panel.hidden = true;
    }, 140);
    button?.classList.remove('is-active');
  }

  function positionPanelNearButton() {
    if (!panel || !button) return;

    const buttonRect = button.getBoundingClientRect();
    const panelWidth = Math.min(560, window.innerWidth - 32);
    const panelHeight = Math.min(760, window.innerHeight - 112);
    const gap = 10;
    const safe = 12;

    let left = buttonRect.right - panelWidth;
    let top = buttonRect.bottom + gap;

    if (top + panelHeight > window.innerHeight - safe) {
      top = buttonRect.top - panelHeight - gap;
    }

    if (top < safe) {
      top = safe;
    }

    left = Math.min(Math.max(safe, left), window.innerWidth - panelWidth - safe);

    const originX = Math.min(
      Math.max(buttonRect.left + buttonRect.width / 2 - left, 24),
      panelWidth - 24,
    );
    const originY = buttonRect.bottom <= top ? 0 : panelHeight;

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = 'auto';
    panel.style.width = `${Math.round(panelWidth)}px`;
    panel.style.maxHeight = `${Math.round(panelHeight)}px`;
    panel.style.transformOrigin = `${Math.round(originX)}px ${originY}px`;
  }

  async function runAndRender() {
    openPanel();
    setStatus('计算中', 'loading');
    renderLoading();

    try {
      const result = await runAndReport({ silentAlert: true });
      isDetailsOpen = false;
      renderResult(result);
      setStatus('已更新', 'success');
      return result;
    } catch (error) {
      renderError(error);
      setStatus('失败', 'error');
      throw error;
    }
  }

  function installStyles() {
    if (document.getElementById(`${ROOT_ID}-style`)) return;

    const style = document.createElement('style');
    style.id = `${ROOT_ID}-style`;
    style.textContent = `
      #${ROOT_ID} {
        color-scheme: light dark;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      .cqc-button {
        position: fixed;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 168px;
        height: 42px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 999px;
        padding: 0 14px;
        background: rgba(255, 255, 255, 0.92);
        color: #202123;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
        cursor: grab;
        pointer-events: auto;
        user-select: none;
        backdrop-filter: blur(18px);
      }

      .cqc-button:active {
        cursor: grabbing;
      }

      .cqc-button.is-active {
        border-color: rgba(16, 163, 127, 0.45);
        box-shadow: 0 10px 32px rgba(16, 163, 127, 0.22);
      }

      .cqc-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #10a37f;
        box-shadow: 0 0 0 4px rgba(16, 163, 127, 0.14);
        flex: 0 0 auto;
      }

      .cqc-button-text {
        display: grid;
        gap: 1px;
        text-align: left;
        line-height: 1.1;
      }

      .cqc-button-title {
        font-size: 13px;
        font-weight: 650;
      }

      .cqc-status {
        color: #6e6e80;
        font-size: 11px;
      }

      .cqc-status[data-tone="loading"] { color: #0f7f67; }
      .cqc-status[data-tone="success"] { color: #0f7f67; }
      .cqc-status[data-tone="error"] { color: #d92d20; }

      .cqc-panel {
        position: fixed;
        top: 88px;
        right: auto;
        width: min(560px, calc(100vw - 32px));
        max-height: min(760px, calc(100vh - 112px));
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 12px;
        background: #ffffff;
        color: #202123;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
        overflow: hidden;
        pointer-events: auto;
        opacity: 0;
        transform: scale(0.96) translateY(-4px);
        transition:
          opacity 140ms ease,
          transform 140ms ease;
      }

      .cqc-panel.is-open {
        opacity: 1;
        transform: scale(1) translateY(0);
      }

      .cqc-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #f7f7f8;
      }

      .cqc-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        font-size: 14px;
        font-weight: 650;
      }

      .cqc-panel-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cqc-icon-button,
      .cqc-refresh {
        border: 1px solid rgba(0, 0, 0, 0.12);
        border-radius: 8px;
        background: #ffffff;
        color: #202123;
        min-height: 32px;
        padding: 0 10px;
        font-size: 13px;
        cursor: pointer;
      }

      .cqc-icon-button {
        width: 32px;
        padding: 0;
        font-size: 18px;
        line-height: 1;
      }

      .cqc-refresh:hover,
      .cqc-icon-button:hover {
        background: #ececf1;
      }

      .cqc-content {
        max-height: calc(min(760px, calc(100vh - 112px)) - 49px);
        overflow: auto;
        padding: 14px;
      }

      .cqc-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 0 0 12px;
      }

      .cqc-metric,
      .cqc-section {
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        background: #ffffff;
      }

      .cqc-metric {
        min-width: 0;
        padding: 12px;
      }

      .cqc-metric-label,
      .cqc-metric-hint {
        color: #6e6e80;
        font-size: 12px;
        line-height: 1.3;
      }

      .cqc-metric-value {
        margin: 6px 0 4px;
        font-size: 20px;
        font-weight: 700;
        line-height: 1.15;
        overflow-wrap: anywhere;
      }

      .cqc-detail-footnote {
        display: flex;
        justify-content: center;
        margin: 10px 0 2px;
      }

      .cqc-detail-footnote button {
        border: 0;
        background: transparent;
        color: #10a37f;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 8px;
      }

      .cqc-detail-footnote button:hover {
        text-decoration: underline;
      }

      .cqc-section {
        margin-top: 12px;
        overflow: hidden;
      }

      .cqc-section h3 {
        margin: 0;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #f7f7f8;
        font-size: 14px;
        line-height: 1.3;
      }

      .cqc-table-wrap {
        overflow: auto;
      }

      .cqc-table-wrap table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .cqc-table-wrap th,
      .cqc-table-wrap td {
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        padding: 9px 10px;
        text-align: left;
        vertical-align: top;
        white-space: nowrap;
      }

      .cqc-table-wrap th {
        color: #6e6e80;
        background: #ffffff;
        font-weight: 650;
        position: sticky;
        top: 0;
      }

      .cqc-table-note,
      .cqc-empty {
        color: #6e6e80;
        font-size: 12px;
        padding: 10px 12px;
      }

      .cqc-loading,
      .cqc-error {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 18px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 10px;
        background: #f7f7f8;
      }

      .cqc-loading span,
      .cqc-error p {
        display: block;
        margin: 4px 0 0;
        color: #6e6e80;
        font-size: 13px;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      .cqc-error {
        display: block;
        border-color: rgba(217, 45, 32, 0.24);
      }

      .cqc-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(16, 163, 127, 0.2);
        border-top-color: #10a37f;
        border-radius: 50%;
        animation: cqc-spin 0.8s linear infinite;
        flex: 0 0 auto;
      }

      @keyframes cqc-spin {
        to { transform: rotate(360deg); }
      }

      @media (max-width: 720px) {
        .cqc-panel {
          width: calc(100vw - 24px);
          max-height: calc(100vh - 88px);
        }

        .cqc-content {
          max-height: calc(100vh - 137px);
        }

        .cqc-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

      }

      @media (prefers-color-scheme: dark) {
        .cqc-button,
        .cqc-panel,
        .cqc-metric,
        .cqc-section,
        .cqc-icon-button,
        .cqc-refresh,
        .cqc-table-wrap th {
          background: #2f2f2f;
          color: #ececf1;
          border-color: rgba(255, 255, 255, 0.14);
        }

        .cqc-panel-header,
        .cqc-section h3,
        .cqc-loading,
        .cqc-error {
          background: #212121;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .cqc-status,
        .cqc-metric-label,
        .cqc-metric-hint,
        .cqc-table-note,
        .cqc-empty,
        .cqc-loading span,
        .cqc-error p {
          color: #b4b4b4;
        }

        .cqc-refresh:hover,
        .cqc-icon-button:hover {
          background: #3f3f3f;
        }

        .cqc-table-wrap th,
        .cqc-table-wrap td,
        .cqc-panel-header,
        .cqc-section h3 {
          border-bottom-color: rgba(255, 255, 255, 0.1);
        }

        .cqc-detail-footnote button {
          color: #19c37d;
        }
      }
    `;
    document.head.append(style);
  }

  function installDrag() {
    let dragState = null;

    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;

      const rect = button.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        moved: false,
      };
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener('pointermove', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;

      const next = clampButtonPosition(
        dragState.startLeft + dx,
        dragState.startTop + dy,
      );
      applyButtonPosition(next);
      if (isPanelOpen) positionPanelNearButton();
    });

    button.addEventListener('pointerup', (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const moved = dragState.moved;
      dragState = null;
      button.releasePointerCapture(event.pointerId);

      const rect = button.getBoundingClientRect();
      persistButtonPosition(rect.left, rect.top);

      if (!moved) {
        if (isPanelOpen) {
          closePanel();
        } else if (window[LAST_RESULT_KEY] && !latestError) {
          isDetailsOpen = false;
          renderResult(window[LAST_RESULT_KEY]);
          setStatus('已缓存', 'success');
          openPanel();
        } else {
          runAndRender().catch(() => {});
        }
      }
    });
  }

  function createUi() {
    if (document.getElementById(ROOT_ID)) return;

    installStyles();

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <button type="button" class="cqc-button" aria-label="Open Codex quota compass">
        <span class="cqc-dot" aria-hidden="true"></span>
        <span class="cqc-button-text">
          <span class="cqc-button-title">Quota Compass</span>
          <span class="cqc-status" data-tone="idle">点击计算</span>
        </span>
      </button>
      <div class="cqc-panel" hidden>
        <div class="cqc-panel-header">
          <div class="cqc-panel-title">
            <span class="cqc-dot" aria-hidden="true"></span>
            <span>Codex Quota Compass</span>
          </div>
          <div class="cqc-panel-actions">
            <button type="button" class="cqc-refresh" data-action="refresh">刷新</button>
            <button type="button" class="cqc-icon-button" data-action="close" aria-label="Close">×</button>
          </div>
        </div>
        <div class="cqc-content"></div>
      </div>
    `;

    document.documentElement.append(root);

    button = root.querySelector('.cqc-button');
    panel = root.querySelector('.cqc-panel');
    statusNode = root.querySelector('.cqc-status');
    contentNode = root.querySelector('.cqc-content');

    applyButtonPosition(loadButtonPosition());
    installDrag();

    root.addEventListener('click', (event) => {
      const action = event.target?.closest?.('[data-action]')?.dataset?.action;
      if (action === 'close') closePanel();
      if (action === 'refresh') runAndRender().catch(() => {});
      if (action === 'show-details' && window[LAST_RESULT_KEY]) {
        isDetailsOpen = true;
        renderResult(window[LAST_RESULT_KEY]);
      }
      if (action === 'hide-details' && window[LAST_RESULT_KEY]) {
        isDetailsOpen = false;
        renderResult(window[LAST_RESULT_KEY]);
      }
    });

    window.addEventListener('resize', () => {
      if (!button) return;
      const rect = button.getBoundingClientRect();
      applyButtonPosition({ left: rect.left, top: rect.top });
      if (isPanelOpen) positionPanelNearButton();
    });

    setStatus('点击计算', 'idle');
  }

  async function runCompass() {
    if (window[RUNNING_KEY]) {
      console.warn(`[${SCRIPT_NAME}] Already running.`);
      return window[LAST_RESULT_KEY];
    }

    window[RUNNING_KEY] = true;

    try {
      // ============================================================
      // codex-quota-compass.js（发布版）
      // ============================================================
      // 用法：安装到 Tampermonkey 后，打开
      // https://chatgpt.com/codex/cloud/settings/analytics#usage 自动运行；
      // 或在任意 chatgpt.com 页面通过 Tampermonkey 菜单手动运行。
      //
      // 安全：
      // - 不打印 accessToken / cookie。
      // - 不返回 /usage 原始响应，避免泄露 email / user_id。
      // - MANUAL_ACCESS_TOKEN 默认留空；只有自动取不到 token 时，才在自己电脑临时填写。
      //
      // 说明：
      // - /backend-api/wham/usage 的 reset_at 是 epoch seconds，不受时区影响。
      // - daily-workspace-usage-counts 只接受 YYYY-MM-DD，且 group_by 只支持 day/week/month。
      // - 本脚本默认把用量日期桶按 UTC 解释；同时输出 UTC / 本地时区诊断。

      const CONFIG = {
        DATE_BUCKET_MODE: 'utc', // 推荐：'utc'；可改为 'local' 对比
        USD_PER_CREDIT: 40 / 1000, // 1000 credits = 40 USD
        ROLLING_DAYS: 30,

        // 不建议使用。只有自动取不到 accessToken 时，才在自己电脑临时填写 Bearer 后面的内容。
        // 发布脚本、截图、复制输出前，必须保持为空。
        MANUAL_ACCESS_TOKEN: '',

        USAGE_PATH: '/backend-api/wham/usage',
        DAILY_USAGE_PATH:
          '/backend-api/wham/analytics/daily-workspace-usage-counts',
      };

      if (location.hostname !== 'chatgpt.com') {
        throw new Error('请在 chatgpt.com 页面运行，例如 Codex Usage / Analytics 页面。');
      }

      // ============================================================
      // 基础工具
      // ============================================================

      const DAY_MS = 24 * 60 * 60 * 1000;
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const round = (v, d = 2) => Number(Number(v).toFixed(d));
      const pad2 = (x) => String(x).padStart(2, '0');
      const last = (arr) => (arr.length ? arr[arr.length - 1] : undefined);

      const fmtLocal = (ms) => new Date(ms).toLocaleString();
      const fmtUTC = (ms) =>
        new Date(ms).toISOString().replace('T', ' ').replace('.000Z', ' UTC');

      const ymdUTC = (x) => {
        const d = new Date(x);
        return [
          d.getUTCFullYear(),
          pad2(d.getUTCMonth() + 1),
          pad2(d.getUTCDate()),
        ].join('-');
      };

      const ymdLocal = (x) => {
        const d = new Date(x);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 10);
      };

      const ymdForApi = (ms) =>
        CONFIG.DATE_BUCKET_MODE === 'utc' ? ymdUTC(ms) : ymdLocal(ms);

      const addDaysLocalMs = (ms, days) => {
        const d = new Date(ms);
        d.setDate(d.getDate() + days);
        return d.getTime();
      };

      const addDaysForApi = (ms, days) =>
        CONFIG.DATE_BUCKET_MODE === 'utc'
          ? ms + days * DAY_MS
          : addDaysLocalMs(ms, days);

      const firstDayOfMonthUTC = (ms) => {
        const d = new Date(ms);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
      };

      const firstDayOfMonthLocal = (ms) => {
        const d = new Date(ms);
        return ymdLocal(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
      };

      const firstDayOfMonthForApi = (ms) =>
        CONFIG.DATE_BUCKET_MODE === 'utc'
          ? firstDayOfMonthUTC(ms)
          : firstDayOfMonthLocal(ms);

      const utcOffsetLabel = (ms) => {
        const offsetMinutes = -new Date(ms).getTimezoneOffset();
        const sign = offsetMinutes >= 0 ? '+' : '-';
        const abs = Math.abs(offsetMinutes);
        return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
      };

      const tokenTotal = (obj = {}) =>
        n(obj.text_total_tokens) ||
        n(obj.cached_text_input_tokens) +
          n(obj.uncached_text_input_tokens) +
          n(obj.text_output_tokens);

      const stripBearer = (s) =>
        String(s || '')
          .replace(/^Bearer\s+/i, '')
          .trim();

      const looksLikeJwt = (s) =>
        typeof s === 'string' && s.length > 100 && s.split('.').length >= 3;

      // ============================================================
      // Auth：自动从 session 中找 accessToken，不打印敏感信息
      // ============================================================

      function findAccessToken(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return '';

        for (const [key, value] of Object.entries(obj)) {
          if (
            typeof value === 'string' &&
            /access/i.test(key) &&
            looksLikeJwt(value)
          ) {
            return value;
          }

          if (value && typeof value === 'object') {
            const found = findAccessToken(value, depth + 1);
            if (found) return found;
          }
        }

        return '';
      }

      async function getAccessToken() {
        const manual = stripBearer(CONFIG.MANUAL_ACCESS_TOKEN);
        if (manual) return manual;

        try {
          const res = await fetch('/api/auth/session', {
            credentials: 'include',
            headers: { accept: 'application/json' },
          });

          if (!res.ok) return '';

          return findAccessToken(await res.json());
        } catch {
          return '';
        }
      }

      const accessToken = await getAccessToken();

      const headers = {
        accept: 'application/json',
      };

      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      async function apiGet(path) {
        const res = await fetch(path, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');

          if (res.status === 401) {
            throw new Error(
              [
                `HTTP 401 Unauthorized: ${path}`,
                '',
                '没有拿到有效 Authorization。',
                '处理方式：',
                '1. 先确认你已经登录 chatgpt.com，并在同一个页面运行脚本。',
                '2. 刷新 Codex Usage / Analytics 页面后重试。',
                '3. 仍失败时，可在 Network 面板找到成功的 /backend-api/wham/usage 请求，',
                '   复制 Authorization: Bearer 后面的 token，只在自己电脑临时填到 CONFIG.MANUAL_ACCESS_TOKEN。',
                '',
                '不要把 token、Cookie、填过 token 的脚本或截图发给任何人。',
              ].join('\n')
            );
          }

          throw new Error(
            `HTTP ${res.status} ${res.statusText}: ${path}\n${text.slice(0, 800)}`
          );
        }

        return res.json();
      }

      // ============================================================
      // /usage 解析：刷新周期、重置时间、已用百分比
      // ============================================================

      function parseWindow(label, w) {
        const usedPercent = n(w?.used_percent);
        const windowSeconds = n(w?.limit_window_seconds);
        const resetAfterSeconds = n(w?.reset_after_seconds);
        const resetAtSeconds = n(w?.reset_at);

        const resetAtMs = resetAtSeconds * 1000;
        const windowStartMs = resetAtMs - windowSeconds * 1000;
        const serverNowMs = resetAtMs - resetAfterSeconds * 1000;

        return {
          名称: label,
          已用百分比: usedPercent,
          已用比例小数: round(usedPercent / 100, 4),
          窗口秒数: windowSeconds,
          窗口天数: round(windowSeconds / 86400, 4),
          本轮开始_UTC: fmtUTC(windowStartMs),
          本轮开始_本地: fmtLocal(windowStartMs),
          下次重置_UTC: fmtUTC(resetAtMs),
          下次重置_本地: fmtLocal(resetAtMs),
          后端当前_UTC: fmtUTC(serverNowMs),
          后端当前_本地: fmtLocal(serverNowMs),
          距离重置小时: round(resetAfterSeconds / 3600, 2),

          _windowStartMs: windowStartMs,
          _resetAtMs: resetAtMs,
          _serverNowMs: serverNowMs,
        };
      }

      function collectWindows(usage) {
        const windows = [];

        if (usage?.rate_limit?.primary_window) {
          windows.push(
            parseWindow('主限制 - 5小时窗口', usage.rate_limit.primary_window)
          );
        }

        if (usage?.rate_limit?.secondary_window) {
          windows.push(
            parseWindow('主限制 - 7天窗口', usage.rate_limit.secondary_window)
          );
        }

        for (const item of usage?.additional_rate_limits ?? []) {
          const name = item.limit_name || item.metered_feature || '额外限制';

          if (item?.rate_limit?.primary_window) {
            windows.push(
              parseWindow(`${name} - 5小时窗口`, item.rate_limit.primary_window)
            );
          }

          if (item?.rate_limit?.secondary_window) {
            windows.push(
              parseWindow(`${name} - 7天窗口`, item.rate_limit.secondary_window)
            );
          }
        }

        return windows;
      }

      // ============================================================
      // daily-workspace-usage-counts 解析
      // ============================================================

      function parseDailyRows(json) {
        return (json.data ?? [])
          .slice()
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map((d) => {
            const t = d.totals ?? {};
            const credits = n(t.credits);

            return {
              日期桶: d.date,
              Credits: round(credits, 6),
              折算USD: round(credits * CONFIG.USD_PER_CREDIT, 2),
              用户数: n(t.users),
              线程数: n(t.threads),
              轮数: n(t.turns),
              Token总量: tokenTotal(t),
              缓存输入Token: n(t.cached_text_input_tokens),
              非缓存输入Token: n(t.uncached_text_input_tokens),
              输出Token: n(t.text_output_tokens),
              客户端数量: Array.isArray(d.clients) ? d.clients.length : 0,
              客户端Credits: (d.clients ?? [])
                .map((c) => `${c.client_id ?? 'UNKNOWN'}:${round(n(c.credits), 2)}`)
                .join(' | '),
            };
          });
      }

      function summarizeClients(json) {
        const map = new Map();

        for (const day of json.data ?? []) {
          for (const c of day.clients ?? []) {
            const id = c.client_id ?? 'UNKNOWN';
            const row = map.get(id) ?? {
              客户端: id,
              Credits: 0,
              折算USD: 0,
              线程数: 0,
              轮数: 0,
              Token总量: 0,
              缓存输入Token: 0,
              非缓存输入Token: 0,
              输出Token: 0,
            };

            const credits = n(c.credits);

            row.Credits += credits;
            row.折算USD += credits * CONFIG.USD_PER_CREDIT;
            row.线程数 += n(c.threads);
            row.轮数 += n(c.turns);
            row.Token总量 += tokenTotal(c);
            row.缓存输入Token += n(c.cached_text_input_tokens);
            row.非缓存输入Token += n(c.uncached_text_input_tokens);
            row.输出Token += n(c.text_output_tokens);

            map.set(id, row);
          }
        }

        return [...map.values()]
          .map((r) => ({
            ...r,
            Credits: round(r.Credits, 6),
            折算USD: round(r.折算USD, 2),
          }))
          .sort((a, b) => b.Credits - a.Credits);
      }

      async function fetchDailyUsage(startDate, endExclusiveDate) {
        const qs = new URLSearchParams({
          start_date: startDate,
          end_date: endExclusiveDate,
          group_by: 'day',
        });

        const url = `${CONFIG.DAILY_USAGE_PATH}?${qs}`;
        const json = await apiGet(url);

        return {
          url: location.origin + url,
          rows: parseDailyRows(json),
          clients: summarizeClients(json),
        };
      }

      function summarizeRows(rangeName, rows, startDate, endExclusiveDate) {
        const credits = rows.reduce((s, r) => s + n(r.Credits), 0);

        return {
          范围: rangeName,
          日期桶口径:
            CONFIG.DATE_BUCKET_MODE === 'utc' ? 'UTC日期桶' : '本地日期桶',
          API_start_date: startDate,
          API_end_date_排他: endExclusiveDate,
          返回日期桶数: rows.length,
          首个返回日期桶: rows[0]?.日期桶 ?? '',
          最后返回日期桶: last(rows)?.日期桶 ?? '',
          累计Credits: round(credits, 6),
          累计折算USD: round(credits * CONFIG.USD_PER_CREDIT, 2),
          累计Token: rows.reduce((s, r) => s + n(r.Token总量), 0),
          累计线程数: rows.reduce((s, r) => s + n(r.线程数), 0),
          累计轮数: rows.reduce((s, r) => s + n(r.轮数), 0),
        };
      }

      function publicWindowRow(w) {
        const { _windowStartMs, _resetAtMs, _serverNowMs, ...visible } = w;
        return visible;
      }

      function printTimezoneDiagnostics({
        apiNowMs,
        windowStartMs,
        resetAtMs,
        sinceResetStartDate,
        monthStartDate,
        rollingStartDate,
        endExclusiveDate,
      }) {
        const browserTimeZone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || '未知';

        console.log('0）时区诊断：刷新周期与用量日期桶');
        console.table([
          { 项目: '浏览器本地时区', 值: browserTimeZone },
          { 项目: '浏览器UTC偏移', 值: utcOffsetLabel(apiNowMs) },
          {
            项目: '当前脚本日期桶模式',
            值: CONFIG.DATE_BUCKET_MODE === 'utc' ? 'UTC日期桶' : '本地日期桶',
          },
          { 项目: '浏览器当前时间_本地', 值: fmtLocal(Date.now()) },
          { 项目: '浏览器当前时间_UTC', 值: fmtUTC(Date.now()) },
          { 项目: '后端当前时间_本地', 值: fmtLocal(apiNowMs) },
          { 项目: '后端当前时间_UTC', 值: fmtUTC(apiNowMs) },
          {
            项目: '浏览器时间与后端时间差_秒',
            值: round((Date.now() - apiNowMs) / 1000, 2),
          },
          { 项目: '7天窗口开始_本地', 值: fmtLocal(windowStartMs) },
          { 项目: '7天窗口开始_UTC', 值: fmtUTC(windowStartMs) },
          { 项目: '下次重置时间_本地', 值: fmtLocal(resetAtMs) },
          { 项目: '下次重置时间_UTC', 值: fmtUTC(resetAtMs) },
          { 项目: '7天窗口开始日期_本地口径', 值: ymdLocal(windowStartMs) },
          { 项目: '7天窗口开始日期_UTC口径', 值: ymdUTC(windowStartMs) },
          { 项目: '后端当前日期_本地口径', 值: ymdLocal(apiNowMs) },
          { 项目: '后端当前日期_UTC口径', 值: ymdUTC(apiNowMs) },
          { 项目: '本月月初_本地口径', 值: firstDayOfMonthLocal(apiNowMs) },
          { 项目: '本月月初_UTC口径', 值: firstDayOfMonthUTC(apiNowMs) },
          { 项目: 'API_start_date_上次重置至今', 值: sinceResetStartDate },
          { 项目: 'API_start_date_本月初至今', 值: monthStartDate },
          { 项目: `API_start_date_近${CONFIG.ROLLING_DAYS}天`, 值: rollingStartDate },
          { 项目: 'API_end_date_排他', 值: endExclusiveDate },
        ]);
      }

      function buildWeeklyEstimate({
        mainSecondary,
        sinceResetRows,
        sinceResetSummary,
        sinceResetStartDate,
      }) {
        const usedPercent = n(mainSecondary.已用百分比);
        const usedRatio = usedPercent / 100;
        const includedCredits = n(sinceResetSummary.累计Credits);

        const resetDayRow = sinceResetRows.find(
          (r) => r.日期桶 === sinceResetStartDate
        );

        const resetDayCredits = n(resetDayRow?.Credits);
        const excludedCredits = Math.max(0, includedCredits - resetDayCredits);

        if (usedRatio <= 0) {
          return {
            依据: '主限制 - 7天窗口 secondary_window',
            已用百分比: usedPercent,
            说明: '已用比例为 0，无法反推总额度。',
          };
        }

        const totalWithResetDay = includedCredits / usedRatio;
        const totalWithoutResetDay = excludedCredits / usedRatio;

        const remainingWithResetDay = Math.max(
          0,
          totalWithResetDay - includedCredits
        );

        const remainingWithoutResetDay = Math.max(
          0,
          totalWithoutResetDay - excludedCredits
        );

        return {
          依据: '主限制 - 7天窗口 secondary_window',
          已用百分比: usedPercent,
          已用比例小数: round(usedRatio, 4),
          剩余比例小数: round(1 - usedRatio, 4),
          说明:
            'used_percent 表示已经用掉的比例；例如 45 = 已用 45%，不是剩余 45%。',
          日期桶口径:
            CONFIG.DATE_BUCKET_MODE === 'utc' ? 'UTC日期桶' : '本地日期桶',

          包含重置日_已用Credits: round(includedCredits, 6),
          包含重置日_已用折算USD: round(
            includedCredits * CONFIG.USD_PER_CREDIT,
            2
          ),

          重置日整天Credits: round(resetDayCredits, 6),
          重置日整天折算USD: round(
            resetDayCredits * CONFIG.USD_PER_CREDIT,
            2
          ),

          排除重置日_已用Credits: round(excludedCredits, 6),
          排除重置日_已用折算USD: round(
            excludedCredits * CONFIG.USD_PER_CREDIT,
            2
          ),

          反推周总Credits_包含重置日: round(totalWithResetDay, 2),
          反推周总USD_包含重置日: round(
            totalWithResetDay * CONFIG.USD_PER_CREDIT,
            2
          ),

          反推周总Credits_排除重置日: round(totalWithoutResetDay, 2),
          反推周总USD_排除重置日: round(
            totalWithoutResetDay * CONFIG.USD_PER_CREDIT,
            2
          ),

          剩余Credits_包含重置日口径: round(remainingWithResetDay, 2),
          剩余USD_包含重置日口径: round(
            remainingWithResetDay * CONFIG.USD_PER_CREDIT,
            2
          ),

          剩余Credits_排除重置日口径: round(remainingWithoutResetDay, 2),
          剩余USD_排除重置日口径: round(
            remainingWithoutResetDay * CONFIG.USD_PER_CREDIT,
            2
          ),

          误差说明:
            'daily analytics 只能按天聚合，不能切到具体小时分钟；实际值通常介于“排除重置日”和“包含重置日”之间。used_percent 也是整数，存在四舍五入或截断误差。',
        };
      }

      // ============================================================
      // 主流程
      // ============================================================

      const usage = await apiGet(CONFIG.USAGE_PATH);
      const windows = collectWindows(usage);

      if (!usage?.rate_limit?.secondary_window) {
        throw new Error(
          '没有找到 usage.rate_limit.secondary_window，无法反推主 7 天窗口。'
        );
      }

      const mainSecondary = parseWindow(
        '主限制 - 7天窗口',
        usage.rate_limit.secondary_window
      );

      const apiNowMs = mainSecondary._serverNowMs || Date.now();

      const apiTodayDate = ymdForApi(apiNowMs);

      // daily-workspace-usage-counts 的 end_date 是排他边界。
      // 要尽量包含当前日期桶，所以传“后端当前日期 + 1天”。
      const endExclusiveDate = ymdForApi(addDaysForApi(apiNowMs, 1));

      // 7天窗口：用 UTC 日期桶取 windowStart 所在日期。
      // 注意：因为接口只能按天，windowStart 当天只能整天纳入。
      const sinceResetStartDate = ymdForApi(mainSecondary._windowStartMs);

      // 本月初至今：按 DATE_BUCKET_MODE 取月初。
      const monthStartDate = firstDayOfMonthForApi(apiNowMs);

      // 近 N 天：包含今天，往前 N-1 个日期桶。
      const rollingStartDate = ymdForApi(
        addDaysForApi(apiNowMs, -(CONFIG.ROLLING_DAYS - 1))
      );

      printTimezoneDiagnostics({
        apiNowMs,
        windowStartMs: mainSecondary._windowStartMs,
        resetAtMs: mainSecondary._resetAtMs,
        sinceResetStartDate,
        monthStartDate,
        rollingStartDate,
        endExclusiveDate,
      });

      const sinceReset = await fetchDailyUsage(
        sinceResetStartDate,
        endExclusiveDate
      );

      const sinceResetSummary = summarizeRows(
        `上次重置至今近似 ${sinceResetStartDate} ~ ${apiTodayDate}`,
        sinceReset.rows,
        sinceResetStartDate,
        endExclusiveDate
      );

      const weeklyEstimate = buildWeeklyEstimate({
        mainSecondary,
        sinceResetRows: sinceReset.rows,
        sinceResetSummary,
        sinceResetStartDate,
      });

      const monthToDate = await fetchDailyUsage(monthStartDate, endExclusiveDate);

      const monthToDateSummary = summarizeRows(
        `本月初至今 ${monthStartDate} ~ ${apiTodayDate}`,
        monthToDate.rows,
        monthStartDate,
        endExclusiveDate
      );

      const rolling = await fetchDailyUsage(rollingStartDate, endExclusiveDate);

      const rollingSummary = summarizeRows(
        `近${CONFIG.ROLLING_DAYS}天 ${rollingStartDate} ~ ${apiTodayDate}`,
        rolling.rows,
        rollingStartDate,
        endExclusiveDate
      );

      // ============================================================
      // 输出
      // ============================================================

      console.log('1）限制窗口概览：刷新周期 UTC / 本地对照');
      console.table(windows.map(publicWindowRow));

      console.log('2）主 7 天窗口：上次重置至今，按 daily analytics 近似');
      console.log('GET', sinceReset.url);
      console.table([sinceResetSummary]);

      console.log('3）用 used_percent 反推周额度');
      console.table([weeklyEstimate]);

      console.log('4）上次重置至今每日明细');
      console.table(sinceReset.rows);

      console.log('4.1）上次重置至今客户端汇总');
      console.table(sinceReset.clients);

      console.log('5）本月初至今汇总');
      console.log('GET', monthToDate.url);
      console.table([monthToDateSummary]);

      console.log('6）本月初至今日明细');
      console.table(monthToDate.rows);

      console.log('6.1）本月初至今客户端汇总');
      console.table(monthToDate.clients);

      console.log(`7）近${CONFIG.ROLLING_DAYS}天汇总`);
      console.log('GET', rolling.url);
      console.table([rollingSummary]);

      console.log(`8）近${CONFIG.ROLLING_DAYS}天每日明细`);
      console.table(rolling.rows);

      console.log(`8.1）近${CONFIG.ROLLING_DAYS}天客户端汇总`);
      console.table(rolling.clients);

      console.log(
        '说明：end_date 是排他边界；如果今天没有返回，通常是 daily analytics 尚未刷新或当天暂无统计。'
      );

      return {
        配置: {
          日期桶模式: CONFIG.DATE_BUCKET_MODE,
          USD_PER_CREDIT: CONFIG.USD_PER_CREDIT,
          ROLLING_DAYS: CONFIG.ROLLING_DAYS,
        },

        时区诊断: {
          浏览器本地时区:
            Intl.DateTimeFormat().resolvedOptions().timeZone || '未知',
          浏览器UTC偏移: utcOffsetLabel(apiNowMs),
          后端当前_UTC: fmtUTC(apiNowMs),
          后端当前_本地: fmtLocal(apiNowMs),
          七天窗口开始_UTC: fmtUTC(mainSecondary._windowStartMs),
          七天窗口开始_本地: fmtLocal(mainSecondary._windowStartMs),
          下次重置_UTC: fmtUTC(mainSecondary._resetAtMs),
          下次重置_本地: fmtLocal(mainSecondary._resetAtMs),
          API_start_date_上次重置至今: sinceResetStartDate,
          API_start_date_本月初至今: monthStartDate,
          [`API_start_date_近${CONFIG.ROLLING_DAYS}天`]: rollingStartDate,
          API_end_date_排他: endExclusiveDate,
        },

        限制窗口概览: windows.map(publicWindowRow),

        主7天窗口_上次重置至今: {
          汇总: sinceResetSummary,
          反推周额度: weeklyEstimate,
          每日明细: sinceReset.rows,
          客户端汇总: sinceReset.clients,
        },

        本月初至今: {
          汇总: monthToDateSummary,
          每日明细: monthToDate.rows,
          客户端汇总: monthToDate.clients,
        },

        [`近${CONFIG.ROLLING_DAYS}天`]: {
          汇总: rollingSummary,
          每日明细: rolling.rows,
          客户端汇总: rolling.clients,
        },
      };
    } finally {
      window[RUNNING_KEY] = false;
    }
  }

  async function runAndReport(options = {}) {
    try {
      pendingRunPromise = pendingRunPromise || runCompass();
      const result = await pendingRunPromise;
      window[LAST_RESULT_KEY] = result;
      latestError = null;
      console.log(
        `[${SCRIPT_NAME}] Finished. Latest result is available at window.${LAST_RESULT_KEY}.`,
        result,
      );
      return result;
    } catch (error) {
      console.error(`[${SCRIPT_NAME}] Failed.`, error);
      latestError = error;
      if (!options.silentAlert) {
        alert(`${SCRIPT_NAME} failed: ${error?.message || error}`);
      }
      throw error;
    } finally {
      pendingRunPromise = null;
    }
  }

  createUi();

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Run Codex Quota Compass', () => {
      runAndRender().catch(() => {});
    });
  }

  if (isUsagePage()) {
    console.info(`[${SCRIPT_NAME}] Ready. Click the floating button to calculate usage.`);
  } else {
    console.info(
      `[${SCRIPT_NAME}] Open https://chatgpt.com/codex/cloud/settings/analytics#usage or use the floating button / Tampermonkey menu to run.`,
    );
  }
})();
