(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const dayMs = 86400000;
  const toDegrees = 180 / Math.PI;
  const toRadians = Math.PI / 180;
  const sunriseAltitude = -0.833 * toRadians;
  function sunTimes(latitude, longitude, date, offsetMinutes = null) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return null;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

    const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : -date.getTimezoneOffset();
    const julianDay = date.getTime() / dayMs + 2440587.5;
    const century = (julianDay - 2451545) / 36525;
    const meanLongitude = (280.46646 + century * (36000.76983 + century * 0.0003032)) % 360;
    const meanAnomaly = 357.52911 + century * (35999.05029 - 0.0001537 * century);
    const eccentricity = 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
    const anomaly = meanAnomaly * toRadians;

    const center = Math.sin(anomaly) * (1.914602 - century * (0.004817 + 0.000014 * century)) +
      Math.sin(2 * anomaly) * (0.019993 - 0.000101 * century) +
      Math.sin(3 * anomaly) * 0.000289;
    const omega = (125.04 - 1934.136 * century) * toRadians;
    const apparentLongitude = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * toRadians;
    const meanObliquity = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
    const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * toRadians;

    const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
    const y = Math.tan(obliquity / 2) ** 2;
    const equationOfTime = 4 * toDegrees * (y * Math.sin(2 * apparentLongitude) -
      2 * eccentricity * Math.sin(anomaly) +
      4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * apparentLongitude) -
      0.5 * y * y * Math.sin(4 * apparentLongitude) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * anomaly));

    const noon = 720 - 4 * lng - equationOfTime + offset;
    const zenith = Math.PI / 2 - sunriseAltitude;
    const cosHourAngle = (Math.cos(zenith) - Math.sin(lat * toRadians) * Math.sin(declination)) /
      (Math.cos(lat * toRadians) * Math.cos(declination));

    if (cosHourAngle > 1) return {sunrise: null, sunset: null, noon, polar: 'night'};
    if (cosHourAngle < -1) return {sunrise: null, sunset: null, noon, polar: 'day'};

    const hourAngle = Math.acos(cosHourAngle) * toDegrees * 4;
    return {
      sunrise: ((noon - hourAngle) % 1440 + 1440) % 1440,
      sunset: ((noon + hourAngle) % 1440 + 1440) % 1440,
      noon,
      polar: null,
    };
  }

  app.solar = {sunTimes};
})();
