import type { UIElement } from '@/types/uiEditor';
import type {
  RuntimeConfigFile,
  RuntimeDataSourceConfig,
  UIAction,
  UIBindingExportEntry,
} from '@/types/uiInteraction';
import { createDefaultDataSourceConfig } from '@/types/uiInteraction';
import { getElementDomId } from '@/utils/uiElementDom';

/** 从 UI 元素收集导出自用的事件绑定表（含隐藏元素，便于显示后再触发） */
export function collectUIBindings(elements: UIElement[]): UIBindingExportEntry[] {
  return elements
    .filter((el) => Array.isArray(el.actions) && el.actions.length > 0)
    .map((el) => ({
      domId: getElementDomId(el),
      elementId: el.id,
      elementName: el.name,
      actions: el.actions as UIAction[],
    }));
}

export function buildRuntimeConfig(options: {
  uiEnabled: boolean;
  pageId?: string;
  pageName?: string;
  designWidth?: number;
  designHeight?: number;
  dataSource?: Partial<RuntimeDataSourceConfig>;
}): RuntimeConfigFile {
  return {
    version: '1.0',
    exportTime: new Date().toISOString(),
    ui: {
      enabled: options.uiEnabled,
      pageId: options.pageId,
      pageName: options.pageName,
      designWidth: options.designWidth,
      designHeight: options.designHeight,
    },
    dataSource: {
      ...createDefaultDataSourceConfig(),
      ...options.dataSource,
    },
    dataBindings: [],
  };
}

/**
 * 导出包 UI 桥接脚本：按 bindings 绑定 DOM 事件 → window.sceneApi
 * 同一触发下一次执行全部动作（UI 显隐由 sceneApi.dispatch 侧统一排在最后）
 */
export function buildUIBridgeJs(bindings: UIBindingExportEntry[]): string {
  return `/**
 * UI → 场景桥接
 * 依赖 window.sceneApi（由 js/main.js 在场景就绪后挂载）
 */
(function () {
  'use strict';

  var bindings = ${JSON.stringify(bindings, null, 2)};

  function runActions(actions) {
    var api = window.sceneApi;
    if (!api || typeof api.dispatch !== 'function') {
      console.warn('[ui-bridge] sceneApi 未就绪', actions);
      return;
    }
    var sceneActions = [];
    var uiActions = [];
    (actions || []).forEach(function (action) {
      if (action.type === 'ui.setVisible') uiActions.push(action);
      else sceneActions.push(action);
    });
    sceneActions.forEach(function (action) { api.dispatch(action); });
    uiActions.forEach(function (action) { api.dispatch(action); });
  }

  function bindAll() {
    bindings.forEach(function (entry) {
      var el = document.getElementById(entry.domId);
      if (!el) {
        console.warn('[ui-bridge] 未找到元素', entry.domId);
        return;
      }
      el.classList.add('ui-interactive');

      var byTrigger = {};
      (entry.actions || []).forEach(function (action) {
        var trigger = action.trigger || 'click';
        if (!byTrigger[trigger]) byTrigger[trigger] = [];
        byTrigger[trigger].push(action);
      });

      Object.keys(byTrigger).forEach(function (trigger) {
        el.addEventListener(trigger, function (ev) {
          if (trigger === 'click' || trigger === 'dblclick') {
            ev.preventDefault();
          }
          ev.stopPropagation();
          runActions(byTrigger[trigger]);
        });
      });
    });
    console.info('[ui-bridge] 已绑定', bindings.length, '个交互元素');
  }

  function start() {
    if (window.sceneApi) {
      bindAll();
      return;
    }
    window.addEventListener('dt-scene-ready', bindAll, { once: true });
    // 兜底：场景较慢时轮询
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.sceneApi) {
        clearInterval(timer);
        bindAll();
      } else if (tries > 100) {
        clearInterval(timer);
        console.warn('[ui-bridge] 等待 sceneApi 超时');
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;
}

/**
 * 预留数据桥：读取 config/runtime.json，后续接 WebSocket/HTTP 实时驱动场景与图表
 */
export function buildDataBridgeJs(): string {
  return `/**
 * 数据桥（预留）
 * - 读取 ./config/runtime.json
 * - enabled=true 时可接 WebSocket / HTTP 推送测点
 * - 收到数据后可调用 window.sceneApi 或更新 ECharts
 *
 * 协议建议（下一步对接）：
 *   { "type": "point.patch", "payload": { "P01.temp": 72.5 } }
 *   { "type": "scene.command", "payload": { "actions": [ ...UIAction ] } }
 */
(function () {
  'use strict';

  var runtimeConfig = null;
  var socket = null;

  function applyPointPatch(patch) {
    // 预留：测点 → 模型/图表绑定引擎入口
    window.dispatchEvent(new CustomEvent('dt-point-patch', { detail: patch }));
    if (window.sceneApi && typeof window.sceneApi.onPointPatch === 'function') {
      window.sceneApi.onPointPatch(patch);
    }
  }

  function connectWebSocket(url) {
    if (!url) return;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.warn('[data-bridge] WebSocket 创建失败', err);
      return;
    }
    socket.addEventListener('open', function () {
      console.info('[data-bridge] WebSocket 已连接', url);
    });
    socket.addEventListener('message', function (ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'point.patch' && msg.payload) {
          applyPointPatch(msg.payload);
        } else if (msg.type === 'scene.command' && msg.payload && Array.isArray(msg.payload.actions)) {
          msg.payload.actions.forEach(function (action) {
            if (window.sceneApi) window.sceneApi.dispatch(action);
          });
        }
      } catch (err) {
        console.warn('[data-bridge] 消息解析失败', err);
      }
    });
    socket.addEventListener('close', function () {
      var wait = (runtimeConfig && runtimeConfig.dataSource && runtimeConfig.dataSource.reconnectMs) || 3000;
      console.warn('[data-bridge] 连接关闭，' + wait + 'ms 后重连');
      setTimeout(function () {
        if (runtimeConfig && runtimeConfig.dataSource && runtimeConfig.dataSource.enabled) {
          connectWebSocket(url);
        }
      }, wait);
    });
  }

  async function bootstrap() {
    try {
      runtimeConfig = await fetch('./config/runtime.json').then(function (r) { return r.json(); });
    } catch (err) {
      console.info('[data-bridge] 无 runtime.json 或读取失败，跳过数据接入');
      return;
    }
    window.__runtimeConfig = runtimeConfig;
    var ds = runtimeConfig.dataSource;
    if (!ds || !ds.enabled) {
      console.info('[data-bridge] 数据源未启用（可在 config/runtime.json 打开）');
      return;
    }
    if (ds.type === 'websocket') {
      connectWebSocket(ds.url);
    } else if (ds.type === 'http' && ds.url) {
      var interval = ds.pollIntervalMs || 5000;
      setInterval(async function () {
        try {
          var patch = await fetch(ds.url).then(function (r) { return r.json(); });
          applyPointPatch(patch);
        } catch (err) {
          console.warn('[data-bridge] HTTP 轮询失败', err);
        }
      }, interval);
    } else {
      console.info('[data-bridge] 数据源类型暂未实现:', ds.type);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
`;
}

/** 叠层专用 CSS：透明背景，仅交互元素接收指针 */
export function buildUIOverlayExtraCss(): string {
  return `
/* ===== 场景叠层 ===== */
#ui-overlay.ui-page {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: transparent !important;
  pointer-events: none;
  z-index: 10;
  overflow: hidden;
}

#ui-overlay .ui-interactive,
#ui-overlay button.ui-el,
#ui-overlay input.ui-el-native-input,
#ui-overlay .ui-el-button {
  pointer-events: auto;
}
`;
}
