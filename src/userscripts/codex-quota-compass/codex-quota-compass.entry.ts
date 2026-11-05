// ==UserScript==
// @name         Codex Quota Compass
// @name:zh-CN   Codex 配额统计
// @name:en      Codex Quota Compass
// @namespace    https://github.com/dzshzx/custom-user-js-scripts
// @version      0.5.31
// @description  No longer maintained: shows a notice asking you to uninstall this script.
// @description:zh-CN  已停止维护：只在页面上提示在脚本管理器里卸载本脚本。
// @description:en     No longer maintained: shows a notice asking you to uninstall this script.
// @author       BlueSkyXN, dzshzx
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/dzshzx/custom-user-js-scripts
// @supportURL   https://github.com/dzshzx/custom-user-js-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/codex-quota-compass.user.js
// @updateURL    https://raw.githubusercontent.com/dzshzx/custom-user-js-scripts/master/dist/codex-quota-compass.user.js
// @license      MIT
// ==/UserScript==

// Final release before retirement: every former feature is gone; the page only
// shows one dismissible notice. Saved data in GM storage and localStorage is
// left untouched for the user to export or clear.

export const RETIRED_NOTICE_ID = 'codex-quota-compass-retired-notice';
export const RETIRED_MESSAGE = 'Codex Quota Compass 已停止维护，请在脚本管理器里卸载。';

export function showRetiredNotice(doc: Document): HTMLElement {
  const existing = doc.getElementById(RETIRED_NOTICE_ID);
  if (existing) return existing;
  const notice = doc.createElement('div');
  notice.id = RETIRED_NOTICE_ID;
  notice.setAttribute('role', 'status');
  notice.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:2147483647',
    'max-width:320px',
    'display:flex',
    'gap:12px',
    'align-items:flex-start',
    'padding:12px 14px',
    'border-radius:8px',
    'background:oklch(0.98 0.01 250)',
    'color:oklch(0.25 0.02 250)',
    'box-shadow:0 4px 16px oklch(0 0 0 / 0.18)',
    'font:14px/1.5 system-ui,sans-serif',
  ].join(';');
  const text = doc.createElement('span');
  text.textContent = RETIRED_MESSAGE;
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.setAttribute('aria-label', '关闭提示');
  close.style.cssText = 'flex:none;border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:0';
  close.addEventListener('click', () => notice.remove());
  notice.append(text, close);
  (doc.body || doc.documentElement).append(notice);
  return notice;
}

showRetiredNotice(document);
