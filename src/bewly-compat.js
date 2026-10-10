(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight;
  const isDark = () => {
    const auto = app.themeSchedule?.getDark?.();
    return auto === null || auto === undefined ? app.settings.value.darkMode === true : auto;
  };
  let style = null;
  let voteObserver = null;
  let voteTimer = null;
  let voteLight = false;
  const voteStyles = new Set();
  const watchedRoots = new Set();
  const pendingHosts = new Set();
  const voteCss = `
    :host(bili-comments-vote-card) {
      --option-color: #f4f5f7 !important;
      --bew-text-1: #f4f5f7 !important;
      --bew-text-2: #dce3eb !important;
      color: #f4f5f7 !important;
    }
  `;
  const badgeCss = `
    #tags .tag {
      --bili-comment-tag-color: var(--bili-comment-tag-color-dark, #dce3eb) !important;
      --bili-comment-tag-bg: var(--bili-comment-tag-bg-dark, #292c31) !important;
      color: var(--bili-comment-tag-color) !important;
      background-color: var(--bili-comment-tag-bg) !important;
      text-shadow: none !important;
    }
  `;
  function visitVoteTree(node) {
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (node.shadowRoot) {
        const root = node.shadowRoot;
        if (!watchedRoots.has(root)) {
          watchedRoots.add(root);
          voteObserver.observe(root, {childList: true, subtree: true});
          if (node.localName === 'bili-comments-vote-card' || ['bili-comment-renderer', 'bili-comment-reply-renderer', 'bili-comment-box'].includes(node.localName)) {
            const override = document.createElement('style');
            override.dataset.bilibiliAmbilightCompat = 'vote';
            override.textContent = node.localName === 'bili-comments-vote-card' ?
              (voteLight ? voteCss.replaceAll('#f4f5f7','#18191c').replaceAll('#dce3eb','#303133') : voteCss) :
              (node.localName === 'bili-comment-box' ? (voteLight ? `
                #editor, .brt-editor { background: rgba(255,255,255,.72) !important; color: #18191c !important; }
                #editor:is(:hover,:focus-within) { background: rgba(255,255,255,.95) !important; }
              ` : '') : (voteLight ? '#tags .tag { text-shadow: none !important; }' : badgeCss));
            voteStyles.add(override);
            root.append(override);
          }
          visitVoteTree(root);
        }
      } else if (node.localName.includes('-')) {
        pendingHosts.add(node);
      }
    }
    for (const child of node.children || []) visitVoteTree(child);
  }
  app.syncVoteCompatibility = active => {
    const light=!isDark();
    if(active && voteObserver && voteLight!==light)app.syncVoteCompatibility(false);
    voteLight=light;
    if (!active) {
      voteObserver?.disconnect();
      voteObserver = null;
      clearInterval(voteTimer);
      voteTimer = null;
      for (const override of voteStyles) override.remove();
      voteStyles.clear();
      watchedRoots.clear();
      pendingHosts.clear();
      return;
    }
    if (voteObserver) return;
    voteObserver = new MutationObserver(records => {
      for (const record of records)
        for (const node of record.addedNodes) visitVoteTree(node);
    });
    voteObserver.observe(document.documentElement, {childList: true, subtree: true});
    visitVoteTree(document.documentElement);
    voteTimer = setInterval(() => {
      for (const host of pendingHosts) {
        if (!host.isConnected) pendingHosts.delete(host);
        else if (host.shadowRoot) {
          pendingHosts.delete(host);
          visitVoteTree(host);
        }
      }
      for (const override of voteStyles) {
        if (!override.isConnected) voteStyles.delete(override);
      }
      for (const root of watchedRoots) {
        if (!root.host.isConnected) watchedRoots.delete(root);
      }
    }, 1000);
  };
  function palette(light) {
    return light ? {
      text1: '#18191c', text2: '#303133', text3: '#61666d',
      content: 'rgba(255,255,255,.72)', contentHover: 'rgba(255,255,255,.92)',
      border: 'rgba(0,0,0,.12)', textShadow: 'none',
      popoverBg: '#ffffff', popoverText1: '#18191c', popoverText2: '#303133',
      popoverText3: '#61666d', popoverText4: '#9499a0', popoverLine: 'rgba(0,0,0,.1)',
      surface: '#ffffff', surfaceHover: '#eef0f3', fill1: 'rgba(0,0,0,.03)',
      fill2: 'rgba(0,0,0,.06)', fill3: 'rgba(0,0,0,.09)',
      fog: 'linear-gradient(to bottom, rgba(255,255,255,.75), transparent)',
      searchNormal: 'rgba(255,255,255,.85)', searchHover: '#ffffff', searchFocus: '#ffffff',
      colorScheme: 'light',
    } : {
      text1: '#f4f5f7', text2: '#edf1f5', text3: '#dce3eb',
      content: 'rgba(22,23,26,.35)', contentHover: 'rgba(22,23,26,.65)',
      border: 'rgba(255,255,255,.18)', textShadow: '0 1px 3px rgba(0,0,0,.8)',
      popoverBg: '#202226', popoverText1: '#f4f5f7', popoverText2: '#dce3eb',
      popoverText3: '#b9c3d0', popoverText4: '#9ba8ba', popoverLine: 'rgba(255,255,255,.18)',
      surface: '#292c31', surfaceHover: '#343942', fill1: 'rgba(255,255,255,.06)',
      fill2: 'rgba(255,255,255,.12)', fill3: 'rgba(255,255,255,.18)',
      fog: 'linear-gradient(to bottom, rgba(11,11,11,.55), transparent)',
      searchNormal: 'rgba(22,23,26,.75)', searchHover: '#292c31', searchFocus: '#202226',
      colorScheme: 'dark',
    };
  }
  app.syncBewlyCompatibility = active => {
    const root = document.getElementById('bewly')?.shadowRoot;
    const light=!isDark();
    if (!active || !root || style?.getRootNode() !== root || (style && style.dataset.lightMode !== String(light))) {
      style?.remove();
      style = null;
    }
    if (!active || !root || style) return;
    const p = palette(light);
    style = document.createElement('style');
    style.dataset.bilibiliAmbilightCompat = 'bewly';
    style.dataset.lightMode = String(light);
    style.textContent = `
      .top-bar-header {
        --bew-text-1: ${p.text1};
        --bew-text-2: ${p.text2};
        --bew-text-3: ${p.text3};
        --bew-content: ${p.content};
        --bew-content-hover: ${p.contentHover};
        --bew-border-color: ${p.border};
        color: ${p.text2};
        text-shadow: ${p.textShadow};
      }

      .bew-popover, .bew-popover-surface {
        --bew-text-1: ${p.popoverText1};
        --bew-text-2: ${p.popoverText2};
        --bew-text-3: ${p.popoverText3};
        --bew-text-4: ${p.popoverText4};
        --bew-bg: ${p.popoverBg};
        --bew-elevated: ${p.popoverBg};
        --bew-elevated-solid: ${p.popoverBg};
        --bew-elevated-hover: ${p.surfaceHover};
        --bew-elevated-solid-hover: ${p.surfaceHover};
        --bew-content: ${p.surface};
        --bew-content-hover: ${p.surfaceHover};
        --bew-content-solid: ${p.surface};
        --bew-content-solid-hover: ${p.surfaceHover};
        --bew-fill-1: ${p.fill1};
        --bew-fill-2: ${p.fill2};
        --bew-fill-3: ${p.fill3};
        --bew-border-color: ${p.border};
        --bew-popover-border-color: ${p.border};
        --bew-theme-color-auto: ${p.popoverText1};
        color: ${p.popoverText1} !important;
        background: ${p.popoverBg} !important;
        text-shadow: none;
        color-scheme: ${p.colorScheme};
      }
      .top-bar-header__fog {
        background: ${p.fog} !important;
      }
      .top-bar-header__glass-overlay,
      .top-bar-header__legacy-mask {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .top-bar-header #search-wrap {
        --b-search-bar-glass: none;
        --bew-shadow-2: 0 0 transparent;
        --bew-shadow-edge-glow-1: 0 0 transparent;
        --b-search-bar-normal-color: ${p.searchNormal} !important;
        --b-search-bar-hover-color: ${p.searchHover} !important;
        --b-search-bar-focus-color: ${p.searchFocus} !important;
        --b-search-bar-normal-text-color: ${p.text2} !important;
        --b-search-bar-hover-text-color: ${p.text2} !important;
        --b-search-bar-focus-text-color: ${p.text2} !important;
        --b-search-bar-normal-icon-color: ${p.text2} !important;
        --b-search-bar-normal-placeholder-color: ${p.text3} !important;
        --b-search-bar-hover-placeholder-color: ${p.text3} !important;
        --b-search-bar-focus-placeholder-color: ${p.text3} !important;
      }
    `;
    root.append(style);
  };
})();
