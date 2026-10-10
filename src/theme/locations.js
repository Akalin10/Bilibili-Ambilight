(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};

  // 时区 → 代表点坐标。仅用于估算日出日落时刻（无需定位权限、不发起网络请求），
  // 因此取该时区内人口较密集的城市经纬度，而非时区几何中心。
  const zoneTable = [
    // 中国（单一时区，取各区域代表城市以贴近当地实际日照）
    ['Asia/Shanghai', 31.23, 121.47],
    ['Asia/Chongqing', 29.56, 106.55],
    ['Asia/Harbin', 45.75, 126.65],
    ['Asia/Urumqi', 43.83, 87.62],
    ['Asia/Kashgar', 39.47, 75.99],
    ['Asia/Kolkata', 22.57, 88.36],
    ['Asia/Calcutta', 22.57, 88.36],
    ['Asia/Dhaka', 23.81, 90.41],
    ['Asia/Kathmandu', 27.72, 85.32],
    ['Asia/Colombo', 6.93, 79.86],
    ['Asia/Karachi', 24.86, 67.01],
    // 东亚与东南亚
    ['Asia/Hong_Kong', 22.32, 114.17],
    ['Asia/Macau', 22.2, 113.54],
    ['Asia/Taipei', 25.03, 121.57],
    ['Asia/Tokyo', 35.68, 139.69],
    ['Asia/Seoul', 37.57, 126.98],
    ['Asia/Pyongyang', 39.03, 125.75],
    ['Asia/Ulaanbaatar', 47.89, 106.91],
    ['Asia/Singapore', 1.35, 103.82],
    ['Asia/Kuala_Lumpur', 3.14, 101.69],
    ['Asia/Bangkok', 13.76, 100.5],
    ['Asia/Ho_Chi_Minh', 10.82, 106.63],
    ['Asia/Saigon', 10.82, 106.63],
    ['Asia/Phnom_Penh', 11.56, 104.92],
    ['Asia/Vientiane', 17.97, 102.6],
    ['Asia/Yangon', 16.87, 96.2],
    ['Asia/Rangoon', 16.87, 96.2],
    ['Asia/Manila', 14.6, 120.98],
    ['Asia/Jakarta', -6.21, 106.85],
    ['Asia/Makassar', -5.15, 119.43],
    ['Asia/Jayapura', -2.53, 140.72],
    ['Asia/Brunei', 4.9, 114.94],
    ['Asia/Dili', -8.56, 125.57],
    // 中亚、西亚与高加索
    ['Asia/Almaty', 43.24, 76.89],
    ['Asia/Aqtobe', 50.28, 57.17],
    ['Asia/Aqtau', 44.65, 51.17],
    ['Asia/Bishkek', 42.87, 74.6],
    ['Asia/Dushanbe', 38.56, 68.79],
    ['Asia/Ashgabat', 37.95, 58.38],
    ['Asia/Samarkand', 39.65, 66.96],
    ['Asia/Tashkent', 41.3, 69.24],
    ['Asia/Kabul', 34.53, 69.17],
    ['Asia/Tehran', 35.69, 51.39],
    ['Asia/Baghdad', 33.31, 44.36],
    ['Asia/Kuwait', 29.38, 47.98],
    ['Asia/Qatar', 25.29, 51.53],
    ['Asia/Bahrain', 26.23, 50.59],
    ['Asia/Riyadh', 24.71, 46.68],
    ['Asia/Dubai', 25.2, 55.27],
    ['Asia/Muscat', 23.59, 58.41],
    ['Asia/Aden', 12.79, 45.03],
    ['Asia/Jerusalem', 31.77, 35.21],
    ['Asia/Tel_Aviv', 32.08, 34.78],
    ['Asia/Amman', 31.95, 35.93],
    ['Asia/Beirut', 33.89, 35.5],
    ['Asia/Damascus', 33.51, 36.29],
    ['Asia/Nicosia', 35.19, 33.38],
    ['Asia/Famagusta', 35.12, 33.94],
    ['Asia/Tbilisi', 41.72, 44.79],
    ['Asia/Yerevan', 40.18, 44.51],
    ['Asia/Baku', 40.41, 49.87],
    // 俄罗斯与北亚
    ['Asia/Yekaterinburg', 56.84, 60.61],
    ['Asia/Omsk', 54.99, 73.37],
    ['Asia/Novosibirsk', 55.03, 82.92],
    ['Asia/Krasnoyarsk', 56.02, 92.87],
    ['Asia/Irkutsk', 52.28, 104.28],
    ['Asia/Chita', 52.03, 113.5],
    ['Asia/Yakutsk', 62.03, 129.73],
    ['Asia/Vladivostok', 43.12, 131.89],
    ['Asia/Khandyga', 62.65, 135.55],
    ['Asia/Magadan', 59.56, 150.8],
    ['Asia/Kamchatka', 53.02, 158.65],
    ['Asia/Sakhalin', 46.96, 142.74],
    ['Europe/Kaliningrad', 54.71, 20.51],
    ['Europe/Moscow', 55.75, 37.62],
    ['Europe/Samara', 53.2, 50.15],
    ['Europe/Volgograd', 48.71, 44.51],
    // 欧洲
    ['Europe/Kyiv', 50.45, 30.52],
    ['Europe/Kiev', 50.45, 30.52],
    ['Europe/Minsk', 53.9, 27.57],
    ['Europe/Chisinau', 47.01, 28.86],
    ['Europe/Bucharest', 44.43, 26.1],
    ['Europe/Sofia', 42.7, 23.32],
    ['Europe/Athens', 37.98, 23.73],
    ['Europe/Istanbul', 41.01, 28.98],
    ['Europe/Helsinki', 60.17, 24.94],
    ['Europe/Tallinn', 59.44, 24.75],
    ['Europe/Riga', 56.95, 24.11],
    ['Europe/Vilnius', 54.69, 25.28],
    ['Europe/Warsaw', 52.23, 21.01],
    ['Europe/Prague', 50.08, 14.44],
    ['Europe/Bratislava', 48.15, 17.11],
    ['Europe/Budapest', 47.5, 19.04],
    ['Europe/Vienna', 48.21, 16.37],
    ['Europe/Berlin', 52.52, 13.4],
    ['Europe/Munich', 48.14, 11.58],
    ['Europe/Zurich', 47.37, 8.54],
    ['Europe/Rome', 41.9, 12.5],
    ['Europe/Paris', 48.86, 2.35],
    ['Europe/Brussels', 50.85, 4.35],
    ['Europe/Amsterdam', 52.37, 4.9],
    ['Europe/Luxembourg', 49.61, 6.13],
    ['Europe/London', 51.51, -0.13],
    ['Europe/Dublin', 53.35, -6.26],
    ['Europe/Madrid', 40.42, -3.7],
    ['Europe/Lisbon', 38.72, -9.14],
    ['Europe/Copenhagen', 55.68, 12.57],
    ['Europe/Oslo', 59.91, 10.75],
    ['Europe/Stockholm', 59.33, 18.06],
    ['Europe/Belgrade', 44.79, 20.45],
    ['Europe/Zagreb', 45.81, 15.98],
    ['Europe/Sarajevo', 43.86, 18.41],
    ['Europe/Skopje', 41.99, 21.43],
    ['Europe/Tirane', 41.33, 19.82],
    ['Atlantic/Reykjavik', 64.15, -21.94],
    // 非洲
    ['Africa/Cairo', 30.04, 31.24],
    ['Africa/Tripoli', 32.89, 13.19],
    ['Africa/Tunis', 36.81, 10.18],
    ['Africa/Algiers', 36.75, 3.06],
    ['Africa/Casablanca', 33.57, -7.59],
    ['Africa/El_Aaiun', 27.15, -13.2],
    ['Africa/Nouakchott', 18.08, -15.98],
    ['Africa/Dakar', 14.72, -17.47],
    ['Africa/Bamako', 12.64, -8.0],
    ['Africa/Abidjan', 5.36, -4.01],
    ['Africa/Accra', 5.6, -0.19],
    ['Africa/Lagos', 6.52, 3.38],
    ['Africa/Niamey', 13.51, 2.11],
    ['Africa/Ndjamena', 12.13, 15.06],
    ['Africa/Khartoum', 15.5, 32.56],
    ['Africa/Addis_Ababa', 9.03, 38.74],
    ['Africa/Nairobi', -1.29, 36.82],
    ['Africa/Kampala', 0.35, 32.58],
    ['Africa/Dar_es_Salaam', -6.79, 39.21],
    ['Africa/Kinshasa', -4.44, 15.27],
    ['Africa/Luanda', -8.84, 13.23],
    ['Africa/Lusaka', -15.39, 28.32],
    ['Africa/Harare', -17.83, 31.05],
    ['Africa/Maputo', -25.97, 32.58],
    ['Africa/Johannesburg', -26.2, 28.05],
    ['Africa/Gaborone', -24.63, 25.91],
    ['Africa/Windhoek', -22.56, 17.08],
    ['Africa/Antananarivo', -18.88, 47.51],
    ['Indian/Mauritius', -20.16, 57.5],
    ['Indian/Reunion', -20.88, 55.45],
    // 南亚与印度洋
    ['Indian/Maldives', 4.17, 73.51],
    ['Indian/Mahe', -4.62, 55.45],
    // 大洋洲
    ['Australia/Perth', -31.95, 115.86],
    ['Australia/Adelaide', -34.93, 138.6],
    ['Australia/Darwin', -12.46, 130.84],
    ['Australia/Brisbane', -27.47, 153.03],
    ['Australia/Sydney', -33.87, 151.21],
    ['Australia/Melbourne', -37.81, 144.96],
    ['Australia/Hobart', -42.88, 147.33],
    ['Pacific/Port_Moresby', -9.44, 147.18],
    ['Pacific/Guadalcanal', -9.43, 159.95],
    ['Pacific/Noumea', -22.28, 166.46],
    ['Pacific/Auckland', -36.85, 174.76],
    ['Pacific/Fiji', -18.14, 178.44],
    ['Pacific/Tongatapu', -21.14, -175.2],
    ['Pacific/Apia', -13.83, -171.77],
    ['Pacific/Honolulu', 21.31, -157.86],
    ['Pacific/Guam', 13.48, 144.75],
    ['Pacific/Pago_Pago', -14.28, -170.7],
    ['Pacific/Tarawa', 1.33, 172.98],
    ['Pacific/Majuro', 7.09, 171.38],
    // 美洲
    ['America/Anchorage', 61.22, -149.9],
    ['America/Vancouver', 49.28, -123.12],
    ['America/Los_Angeles', 34.05, -118.24],
    ['America/Phoenix', 33.45, -112.07],
    ['America/Denver', 39.74, -104.99],
    ['America/Edmonton', 53.55, -113.49],
    ['America/Chicago', 41.88, -87.63],
    ['America/Mexico_City', 19.43, -99.13],
    ['America/Monterrey', 25.69, -100.32],
    ['America/Tijuana', 32.51, -117.04],
    ['America/New_York', 40.71, -74.01],
    ['America/Toronto', 43.65, -79.38],
    ['America/Havana', 23.11, -82.37],
    ['America/Santo_Domingo', 18.49, -69.93],
    ['America/Puerto_Rico', 18.47, -66.11],
    ['America/Panama', 8.98, -79.52],
    ['America/Bogota', 4.71, -74.07],
    ['America/Lima', -12.05, -77.04],
    ['America/Caracas', 10.48, -66.9],
    ['America/La_Paz', -16.5, -68.15],
    ['America/Santiago', -33.45, -70.67],
    ['America/Argentina/Buenos_Aires', -34.6, -58.38],
    ['America/Buenos_Aires', -34.6, -58.38],
    ['America/Montevideo', -34.9, -56.16],
    ['America/Asuncion', -25.26, -57.58],
    ['America/Sao_Paulo', -23.55, -46.63],
    ['America/Fortaleza', -3.73, -38.53],
    ['America/Manaus', -3.12, -60.02],
    ['America/Recife', -8.05, -34.88],
    ['America/Bahia', -12.97, -38.5],
    ['Atlantic/Azores', 37.74, -25.68],
    ['Atlantic/Canary', 28.1, -15.41],
    ['Atlantic/Cape_Verde', 14.93, -23.51],
  ];

  // 时区数据不完整时的兜底：标准时偏移 → 该时区中央经线，纬度取中纬度。
  // 覆盖全球实际存在的偏移范围（UTC-12:00 ~ UTC+14:00）。
  const offsetLongitudes = {
    '-720': -180, '-660': -165, '-600': -150, '-570': -142.5, '-540': -135,
    '-480': -120, '-420': -105, '-360': -90, '-300': -75, '-240': -60,
    '-210': -52.5, '-180': -45, '-120': -30, '-60': -15, '0': 0,
    '60': 15, '120': 30, '180': 45, '210': 52.5, '240': 60, '270': 67.5,
    '300': 75, '330': 82.5, '345': 86.25, '360': 90, '390': 97.5,
    '420': 105, '480': 120, '540': 135, '570': 142.5, '600': 150,
    '660': 165, '720': 180, '780': 195, '840': 210,
  };

  // 注意：不要写成 new Map(zoneTable)，那样每行会被当成 [key, value] 而丢掉经度。
  const zoneMap = new Map(zoneTable.map(([name, latitude, longitude]) => [name, [latitude, longitude]]));
  const aliases = new Map([
    ['asia/calcutta', 'Asia/Kolkata'], ['asia/saigon', 'Asia/Ho_Chi_Minh'],
    ['asia/rangoon', 'Asia/Yangon'], ['asia/tel_aviv', 'Asia/Jerusalem'],
    ['asia/katmandu', 'Asia/Kathmandu'], ['asia/ulan_bator', 'Asia/Ulaanbaatar'],
    ['asia/chungking', 'Asia/Chongqing'], ['asia/macao', 'Asia/Macau'],
    ['europe/kiev', 'Europe/Kyiv'], ['america/buenos_aires', 'America/Argentina/Buenos_Aires'],
    ['america/calcutta', 'America/Argentina/Buenos_Aires'], ['us/eastern', 'America/New_York'],
    ['us/central', 'America/Chicago'], ['us/mountain', 'America/Denver'],
    ['us/pacific', 'America/Los_Angeles'], ['us/alaska', 'America/Anchorage'],
    ['us/hawaii', 'Pacific/Honolulu'], ['prc', 'Asia/Shanghai'], ['roc', 'Asia/Taipei'],
    ['japan', 'Asia/Tokyo'], ['singapore', 'Asia/Singapore'], ['hongkong', 'Asia/Hong_Kong'],
  ]);

  function systemZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (error) {
      return null;
    }
  }

  // 返回 {latitude, longitude, match}：match 为 'zone' 表示命中内置坐标表，'offset' 表示按时区偏移粗估。
  function zoneCoordinates(zone) {
    if (!zone || typeof zone !== 'string') return null;
    const key = aliases.get(zone.toLowerCase()) || zone;
    const exact = zoneMap.get(key);
    if (exact) return {latitude: exact[0], longitude: exact[1], match: 'zone'};
    const tail = key.split('/').pop().toLowerCase();
    if (tail !== key.toLowerCase()) {
      const repaired = aliases.get(tail);
      const entry = repaired && zoneMap.get(repaired);
      if (entry) return {latitude: entry[0], longitude: entry[1], match: 'zone'};
    }
    const offset = -new Date().getTimezoneOffset();
    const longitude = offsetLongitudes[String(offset)];
    if (longitude === undefined) return null;
    return {latitude: 35, longitude, match: 'offset'};
  }

  function parseCoordinates(text) {
    if (typeof text !== 'string') return null;
    const cleaned = text.trim().replace(/[（(].*?[)）]/g, ' ').replace(/[，、；;]/g, ',');
    if (!cleaned) return null;
    const numbers = cleaned.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) return null;
    const latitude = Number(numbers[0]);
    const longitude = Number(numbers[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return {latitude: Math.round(latitude * 10000) / 10000, longitude: Math.round(longitude * 10000) / 10000};
  }

  function formatCoordinates(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
    return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
  }

  app.locations = {zoneCoordinates, parseCoordinates, formatCoordinates, systemZone};
})();
