(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const provider = {
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    pick(data) {
      if (!data || data.success === false) return null;
      const latitude = Number(data.latitude);
      const longitude = Number(data.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
      return {
        latitude: Math.round(latitude * 10000) / 10000,
        longitude: Math.round(longitude * 10000) / 10000,
        city: typeof data.city === 'string' ? data.city : null,
      };
    },
  };
  async function lookup(timeoutMs = 10000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(provider.url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const found = provider.pick(await response.json());
      if (!found) throw new Error('响应里没有经纬度');
      return {...found, source: 'ip', provider: provider.name};
    } catch (error) {
      console.info('[Bilibili Ambilight] IP 定位不可用。', error?.message || error);
      return null;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  app.ipLocation = {provider, lookup};
})();
