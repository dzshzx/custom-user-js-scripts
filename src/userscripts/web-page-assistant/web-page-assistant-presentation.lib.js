(function attachWebPageAssistantPresentationLib(globalObject) {
  'use strict';

  const LIB_NAME = 'WebPageAssistantPresentationLib';

  // Icons are sourced from Lucide (https://lucide.dev), ISC License.
  // Copyright (c) 2026 Lucide Icons and Contributors.
  const LUCIDE_REFRESH_CW_ICON_HTML = `
    <svg class="part-icon-svg lucide lucide-refresh-cw" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M8 16H3v5"></path>
    </svg>
  `;
  const LUCIDE_SETTINGS_ICON_HTML = `
    <svg class="part-icon-svg lucide lucide-settings" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;

  function createPageAssistantDialogContract(adapters) {
    const {
      settingsContract,
      defaultUnlockerSetting,
      formatInterval,
      defaultIntervalMs,
    } = adapters;
    const tabs = { refresh: 'refresh', unlocker: 'unlocker' };
    const roles = {
      status: 'status',
      pageKey: 'page-key',
      siteKey: 'site-key',
      presets: 'presets',
      customValue: 'custom-value',
      customUnit: 'custom-unit',
      message: 'message',
      unlockerStatus: 'unlocker-status',
      unlockerPageKey: 'unlocker-page-key',
      unlockerSiteKey: 'unlocker-site-key',
      unlockerEnabled: 'unlocker-enabled',
      unlockerSelection: 'unlocker-selection',
      unlockerCopy: 'unlocker-copy',
      unlockerContextMenu: 'unlocker-context-menu',
      unlockerDrag: 'unlocker-drag',
      unlockerBeforeUnload: 'unlocker-beforeunload',
    };
    const actions = {
      savePreset: 'save-preset',
      deletePage: 'delete-page',
      deleteSite: 'delete-site',
      deleteUnlockerPage: 'delete-unlocker-page',
      deleteUnlockerSite: 'delete-unlocker-site',
    };

    function roleSelector(role) {
      return `[data-part-role="${role}"]`;
    }

    function actionSelector(action) {
      return `[data-part-action="${action}"]`;
    }

    function normalizeTab(value, fallback = tabs.refresh) {
      return value === tabs.unlocker || value === tabs.refresh ? value : fallback;
    }

    function focusRoleForTab(tab) {
      return normalizeTab(tab) === tabs.unlocker ? roles.unlockerEnabled : roles.customValue;
    }

    function readSelectedScope(dialogNode) {
      const selected = dialogNode?.querySelector('input[name="part-scope"]:checked')?.value;
      return selected === 'site' ? 'site' : 'page';
    }

    function isChecked(dialogNode, role) {
      return dialogNode?.querySelector(roleSelector(role))?.checked === true;
    }

    function createViewModel(input) {
      const nextTab = normalizeTab(input.preferredTab, input.activeTab);
      const selectedScope = input.preferredScope
        || input.activeRefreshMatch?.scope
        || input.activeUnlockerMatch?.scope
        || 'page';
      const pageSetting = settingsContract.getRefreshSetting(input.settings, 'page', input.pageKey);
      const siteSetting = settingsContract.getRefreshSetting(input.settings, 'site', input.siteKey);
      const pageUnlockerSetting = settingsContract.getUnlockerSetting(input.settings, 'page', input.pageKey);
      const siteUnlockerSetting = settingsContract.getUnlockerSetting(input.settings, 'site', input.siteKey);
      const scopedUnlockerSetting = selectedScope === 'site' ? siteUnlockerSetting : pageUnlockerSetting;
      const defaultInterval = input.activeRefreshMatch?.setting.intervalMs || defaultIntervalMs;
      const customInterval = defaultInterval % (60 * 1000) === 0
        ? { value: String(defaultInterval / (60 * 1000)), unit: 'minutes' }
        : { value: String(Math.round(defaultInterval / 1000)), unit: 'seconds' };

      return {
        message: input.message || '',
        activeTab: nextTab,
        selectedScope,
        pageSetting,
        siteSetting,
        pageUnlockerSetting,
        siteUnlockerSetting,
        unlockerFormSetting: scopedUnlockerSetting || defaultUnlockerSetting({ enabled: false }),
        customInterval,
        statusText: input.statusText,
        unlockerStatusText: input.unlockerStatusText,
        pageRefreshText: `页面：${input.pageKey}${pageSetting ? `（${formatInterval(pageSetting.intervalMs)}）` : '（未设置）'}`,
        siteRefreshText: `站点：${input.siteKey}${siteSetting ? `（${formatInterval(siteSetting.intervalMs)}）` : '（未设置）'}`,
        pageUnlockerText: `页面：${input.pageKey}${pageUnlockerSetting ? '（已保存）' : '（未设置）'}`,
        siteUnlockerText: `站点：${input.siteKey}${siteUnlockerSetting ? '（已保存）' : '（未设置）'}`,
        focusRole: focusRoleForTab(nextTab),
      };
    }

    function applyModel(dialogNode, model, presets) {
      const textByRole = [
        [roles.status, model.statusText],
        [roles.pageKey, model.pageRefreshText],
        [roles.siteKey, model.siteRefreshText],
        [roles.unlockerStatus, model.unlockerStatusText],
        [roles.unlockerPageKey, model.pageUnlockerText],
        [roles.unlockerSiteKey, model.siteUnlockerText],
      ];
      for (const [role, text] of textByRole) {
        const node = dialogNode.querySelector(roleSelector(role));
        if (node) node.textContent = text;
      }

      const scopeInput = dialogNode.querySelector(`input[name="part-scope"][value="${model.selectedScope}"]`);
      if (scopeInput) scopeInput.checked = true;

      const presetsNode = dialogNode.querySelector(roleSelector(roles.presets));
      for (const preset of presets) {
        const presetButton = dialogNode.ownerDocument.createElement('button');
        presetButton.type = 'button';
        presetButton.className = 'part-preset';
        presetButton.dataset.partAction = actions.savePreset;
        presetButton.dataset.intervalMs = String(preset.ms);
        presetButton.textContent = preset.label;
        presetsNode.append(presetButton);
      }

      dialogNode.querySelector(roleSelector(roles.customValue)).value = model.customInterval.value;
      dialogNode.querySelector(roleSelector(roles.customUnit)).value = model.customInterval.unit;
      dialogNode.querySelector(actionSelector(actions.deletePage)).disabled = !model.pageSetting;
      dialogNode.querySelector(actionSelector(actions.deleteSite)).disabled = !model.siteSetting;
      dialogNode.querySelector(roleSelector(roles.unlockerEnabled)).checked = model.unlockerFormSetting.enabled;
      dialogNode.querySelector(roleSelector(roles.unlockerSelection)).checked = model.unlockerFormSetting.allowSelection;
      dialogNode.querySelector(roleSelector(roles.unlockerCopy)).checked = model.unlockerFormSetting.allowCopy;
      dialogNode.querySelector(roleSelector(roles.unlockerContextMenu)).checked = model.unlockerFormSetting.allowContextMenu;
      dialogNode.querySelector(roleSelector(roles.unlockerDrag)).checked = model.unlockerFormSetting.allowDrag;
      dialogNode.querySelector(roleSelector(roles.unlockerBeforeUnload)).checked = model.unlockerFormSetting.suppressBeforeUnload;
      dialogNode.querySelector(actionSelector(actions.deleteUnlockerPage)).disabled = !model.pageUnlockerSetting;
      dialogNode.querySelector(actionSelector(actions.deleteUnlockerSite)).disabled = !model.siteUnlockerSetting;
      dialogNode.querySelector(roleSelector(model.focusRole))?.focus();
    }

    function readUnlockerFormSetting(dialogNode) {
      return defaultUnlockerSetting({
        enabled: isChecked(dialogNode, roles.unlockerEnabled),
        allowSelection: isChecked(dialogNode, roles.unlockerSelection),
        allowCopy: isChecked(dialogNode, roles.unlockerCopy),
        allowContextMenu: isChecked(dialogNode, roles.unlockerContextMenu),
        allowDrag: isChecked(dialogNode, roles.unlockerDrag),
        suppressBeforeUnload: isChecked(dialogNode, roles.unlockerBeforeUnload),
      });
    }

    return {
      roles,
      tabs,
      actions,
      roleSelector,
      actionSelector,
      normalizeTab,
      focusRoleForTab,
      readSelectedScope,
      createViewModel,
      applyModel,
      readUnlockerFormSetting,
    };
  }


  function createWidgetElement({ documentObject, model }) {
    if (!documentObject) throw new Error(`${LIB_NAME}: documentObject is required.`);
    if (!model) throw new Error(`${LIB_NAME}: widget model is required.`);

    const widget = documentObject.createElement('section');
    widget.className = 'part-widget';
    widget.setAttribute('aria-live', 'polite');
    widget.innerHTML = `
      <button type="button" class="part-widget-button" aria-label="自动刷新倒计时，悬停或聚焦查看控制">
        <span class="part-widget-button-icon" aria-hidden="true">
          ${LUCIDE_REFRESH_CW_ICON_HTML}
        </span>
        <span class="part-widget-button-text" data-part-role="countdown">--:--</span>
      </button>
      <div class="part-widget-panel">
        <div class="part-widget-panel-header">
          <p class="part-title">自动刷新</p>
          <button type="button" class="part-icon-button" data-part-action="open-settings" aria-label="打开自动刷新设置">${LUCIDE_SETTINGS_ICON_HTML}</button>
        </div>
        <div class="part-widget-countdown" data-part-role="countdown">--:--</div>
        <div class="part-muted" data-part-role="widget-summary"></div>
        <div class="part-widget-actions">
          <button type="button" class="part-button" data-part-action="toggle-pause"></button>
          <button type="button" class="part-button" data-variant="danger" data-part-action="disable-active">停用</button>
        </div>
      </div>
    `;

    widget.querySelector('[data-part-role="widget-summary"]').textContent = model.summary;

    return {
      widget,
      widgetButton: widget.querySelector('.part-widget-button'),
      countdownNodes: [...widget.querySelectorAll('[data-part-role="countdown"]')],
    };
  }

  function createDialogElement({ documentObject, model }) {
    if (!documentObject) throw new Error(`${LIB_NAME}: documentObject is required.`);
    if (!model) throw new Error(`${LIB_NAME}: dialog model is required.`);

    const dialog = documentObject.createElement('div');
    dialog.className = 'part-backdrop';
    dialog.dataset.partAction = 'close-dialog';

    const panel = documentObject.createElement('section');
    panel.className = 'part-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'part-dialog-title');
    panel.dataset.partDialogPanel = 'true';

    panel.innerHTML = `
      <div class="part-dialog-header">
        <div class="part-dialog-header-top">
          <div>
            <h2 class="part-title" id="part-dialog-title">网页助手</h2>
            <p class="part-subtitle">按页面或站点管理自动刷新与限制解除。</p>
          </div>
          <button type="button" class="part-icon-button" data-part-action="close-dialog" aria-label="关闭">
            <span class="part-close-icon" aria-hidden="true"></span>
          </button>
        </div>
        <div class="part-tabs" role="tablist" aria-label="网页助手功能">
          <button type="button" class="part-tab" role="tab" aria-selected="${model.activeTab === 'refresh'}" data-part-action="switch-tab" data-part-tab="refresh">自动刷新</button>
          <button type="button" class="part-tab" role="tab" aria-selected="${model.activeTab === 'unlocker'}" data-part-action="switch-tab" data-part-tab="unlocker">限制解除</button>
        </div>
	      </div>
	      <div class="part-dialog-body">
	        <section class="part-section">
	          <p class="part-section-title">保存范围</p>
	          <div class="part-scope-grid">
            <label class="part-scope-card">
              <input type="radio" name="part-scope" value="page">
              当前页面
              <span class="part-key">只匹配当前完整页面地址。</span>
            </label>
            <label class="part-scope-card">
              <input type="radio" name="part-scope" value="site">
              整个站点
              <span class="part-key">匹配同一 hostname 下的页面。</span>
            </label>
	          </div>
	        </section>

        <section class="part-tab-panel" data-part-tab-panel="refresh"${model.activeTab === 'refresh' ? '' : ' hidden'}>
          <section class="part-section">
            <p class="part-section-title">当前状态</p>
            <div class="part-status-box">
              <div data-part-role="status"></div>
              <span class="part-key" data-part-role="page-key"></span>
              <span class="part-key" data-part-role="site-key"></span>
            </div>
          </section>

          <section class="part-section">
            <p class="part-section-title">常用刷新时间</p>
            <div class="part-presets" data-part-role="presets"></div>
          </section>

          <section class="part-section">
            <p class="part-section-title">自定义刷新时间</p>
            <div class="part-custom-row">
              <input type="number" min="1" step="1" inputmode="decimal" data-part-role="custom-value" aria-label="自定义刷新时间">
              <select data-part-role="custom-unit" aria-label="自定义刷新时间单位">
                <option value="seconds">秒</option>
                <option value="minutes">分钟</option>
              </select>
              <button type="button" class="part-button" data-part-action="save-custom">保存自定义时间</button>
            </div>
            <div class="part-muted">有效范围：1 秒到 60 分钟。</div>
          </section>

          <section class="part-section">
            <p class="part-section-title">删除设置</p>
            <div class="part-dialog-actions">
              <button type="button" class="part-button" data-variant="danger" data-part-action="delete-page">删除当前页面设置</button>
              <button type="button" class="part-button" data-variant="danger" data-part-action="delete-site">删除整个站点设置</button>
            </div>
          </section>
        </section>

        <section class="part-tab-panel" data-part-tab-panel="unlocker"${model.activeTab === 'unlocker' ? '' : ' hidden'}>
	          <section class="part-section">
	            <p class="part-section-title">当前状态</p>
	            <div class="part-status-box">
	              <div data-part-role="unlocker-status"></div>
	              <span class="part-key" data-part-role="unlocker-page-key"></span>
	              <span class="part-key" data-part-role="unlocker-site-key"></span>
	            </div>
	          </section>

	          <section class="part-section">
	            <p class="part-section-title">解除能力</p>
	            <div class="part-row">
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-enabled">
	                <span>启用当前范围的限制解除</span>
	              </label>
	            </div>
	            <div class="part-row part-check-list">
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-selection">
	                <span>允许选择文本</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-copy">
	                <span>允许复制/剪切</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-context-menu">
	                <span>允许右键菜单</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-drag">
	                <span>允许拖拽</span>
	              </label>
	              <label class="part-check-card">
	                <input type="checkbox" data-part-role="unlocker-beforeunload">
	                <span>忽略离开页面提示</span>
	              </label>
	            </div>
	          </section>

	          <section class="part-section">
	            <p class="part-section-title">保存与删除</p>
	            <div class="part-dialog-actions">
	              <button type="button" class="part-button" data-part-action="save-unlocker">保存限制解除设置</button>
	              <button type="button" class="part-button" data-variant="danger" data-part-action="delete-unlocker-page">删除当前页面限制解除</button>
	              <button type="button" class="part-button" data-variant="danger" data-part-action="delete-unlocker-site">删除整个站点限制解除</button>
	            </div>
	          </section>
	        </section>

	        <div class="part-message" data-part-role="message" aria-live="polite"></div>
	      </div>
    `;

    dialog.append(panel);
    return dialog;
  }

  globalObject[LIB_NAME] = Object.freeze({
    createPageAssistantDialogContract,
    createWidgetElement,
    createDialogElement,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
