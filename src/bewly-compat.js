(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight;
  let style = null;
  let voteObserver = null;
  let voteTimer = null;
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
  function visitVoteTree(node) {
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (node.shadowRoot) {
        const root = node.shadowRoot;
        if (!watchedRoots.has(root)) {
          watchedRoots.add(root);
          voteObserver.observe(root, {childList: true, subtree: true});
          if (node.localName === 'bili-comments-vote-card') {
            const override = document.createElement('style');
            override.dataset.bilibiliAmbilightCompat = 'vote';
            override.textContent = voteCss;
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
    // Shadow attachment itself does not produce a childList mutation.
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
  // BewlyCat mounts its custom navigation in an open shadow root.
  // Keep overrides local to that root and only while the light is active.
  app.syncBewlyCompatibility = active => {
    const root = document.getElementById('bewly')?.shadowRoot;
    if (!active || !root || style?.getRootNode() !== root) {
      style?.remove();
      style = null;
    }
    if (!active || !root || style) return;
    style = document.createElement('style');
    style.dataset.bilibiliAmbilightCompat = 'bewly';
    style.textContent = `
      .top-bar-header {
        --bew-text-1: #f4f5f7;
        --bew-text-2: #edf1f5;
        --bew-text-3: #dce3eb;
        --bew-content: rgba(22,23,26,.35);
        --bew-content-hover: rgba(22,23,26,.65);
        --bew-border-color: rgba(255,255,255,.18);
        color: #edf1f5;
      }
      /* Popovers may be teleported outside the header. Pair every text
         override with an opaque surface instead of inheriting white text
         onto BewlyCat's light-theme panels. */
      .bew-popover, .bew-popover-surface {
        --bew-text-1: #f4f5f7;
        --bew-text-2: #dce3eb;
        --bew-text-3: #b9c3d0;
        --bew-text-4: #9ba8ba;
        --bew-bg: #202226;
        --bew-elevated: #202226;
        --bew-elevated-solid: #202226;
        --bew-elevated-hover: #343942;
        --bew-elevated-solid-hover: #343942;
        --bew-content: #292c31;
        --bew-content-hover: #343942;
        --bew-content-solid: #292c31;
        --bew-content-solid-hover: #343942;
        --bew-fill-1: rgba(255,255,255,.06);
        --bew-fill-2: rgba(255,255,255,.12);
        --bew-fill-3: rgba(255,255,255,.18);
        --bew-border-color: rgba(255,255,255,.18);
        --bew-popover-border-color: rgba(255,255,255,.18);
        --bew-theme-color-auto: #f4f5f7;
        color: #f4f5f7 !important;
        background: #202226 !important;
        text-shadow: none;
        color-scheme: dark;
      }
      .top-bar-header__fog {
        background: linear-gradient(to bottom, rgba(11,11,11,.55), transparent) !important;
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
        --b-search-bar-normal-color: rgba(22,23,26,.75) !important;
        --b-search-bar-hover-color: #292c31 !important;
        --b-search-bar-focus-color: #202226 !important;
        --b-search-bar-normal-text-color: #edf1f5 !important;
        --b-search-bar-hover-text-color: #edf1f5 !important;
        --b-search-bar-focus-text-color: #edf1f5 !important;
        --b-search-bar-normal-icon-color: #edf1f5 !important;
        --b-search-bar-normal-placeholder-color: #dce3eb !important;
        --b-search-bar-hover-placeholder-color: #dce3eb !important;
        --b-search-bar-focus-placeholder-color: #dce3eb !important;
      }
    `;
    root.append(style);
  };
})();
