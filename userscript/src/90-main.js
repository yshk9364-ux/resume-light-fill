// 启动引导。
//
// 整个脚本在 document-start 就跑进来了，但此刻 DOM 还没有 body，面板和气泡都挂不上去，
// 所以真正的初始化等 DOMContentLoaded 再做。引擎的 create() 本身是纯计算、不碰 DOM，
// 早跑没问题（这样 SPA 首个路由的页面也能被后续扫描看到）。
(function (root) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function boot() {
    // 1) 把面板挂上并立刻显示右下角入口
    const panel = root.ResumePanel;
    if (panel) {
      panel.ensure();
      // 首次进来就把按钮露出来，用户不该先去找油猴图标
      const b = document.querySelector('[data-resume-panel]');
      if (b) b.style.setProperty('display', 'block', 'important');
    }
    root.ResumeAIUI?.ensure();

    // 2) 打开资料管理页由面板按钮触发，这里不自动开

    // 3) 快捷键：Alt+Shift+F 打开面板（和扩展的点击图标等价，但更快）
    document.addEventListener('keydown', e => {
      if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); panel?.launch(); }
    }, true);

    // 4) 页面是 SPA 时，路由变了要重新探测
    if (panel) {
      const tick = () => { panel.watchRoute(); setTimeout(tick, 800); };
      setTimeout(tick, 800);
    }

    // 5) 记住当前投递上下文，供 AI 气泡用
    try { root.ResumeContext?.detect(); } catch (e) { /* 抓不到不影响 */ }
  }

  ready(boot);

  // 暴露一个手动刷新入口，调试用。
  root.ResumeReload = () => { try { root.ResumeContext?.detect(); root.ResumePanel?.watchRoute(); } catch (e) {} };
})(typeof globalThis !== 'undefined' ? globalThis : this);
