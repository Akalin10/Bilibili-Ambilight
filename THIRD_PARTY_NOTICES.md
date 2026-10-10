# 参考项目与许可

本项目的环境光实现思路参考 [WesselKroos/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight)，本地核对的参考版本为 2.38.17。

参考范围包括画面采样、投影与模糊、帧同步及性能调节。Bilibili 页面识别、布局适配、设置界面和渲染实现位于本项目的 `src/` 与 `styles/`，不依赖原项目的 YouTube 页面适配代码。

原项目采用 MIT License，允许修改和再发布，要求在软件副本或实质性部分中保留版权和许可声明。原始声明完整保存在 [licenses/youtube-ambilight-MIT.txt](licenses/youtube-ambilight-MIT.txt)，项目根目录 LICENSE 亦保留原作者版权。

MIT 许可适用于软件代码，不授予 Bilibili 标识、视频内容或截图中第三方素材的权利。展示截图仅用于说明扩展效果，相关内容属于其权利人。本项目为非官方扩展，与 Bilibili 及参考项目作者无隶属关系。

## 日出日落计算

`src/theme/solar.js` 依据美国国家海洋和大气管理局（NOAA）发布的太阳位置算法自行实现，精度约 ±1 分钟。该算法属于美国政府作品，在美国不受版权保护（公有领域），可自由使用。

`src/theme/locations.js` 中的时区坐标表由本项目根据公开的 GeoNames 城市坐标整理，用于按系统时区估算所在位置；表中每个时区只保留一个人口较密集的代表城市。

## 位置服务

"获取我的位置"在浏览器定位不可用时，会调用 [ipwho.is](https://ipwho.is/) 的公开接口获取城市级经纬度（`src/theme/ip-location.js`）。该服务的使用需遵守其自身条款；本项目只发送一次 GET 请求，不携带任何用户标识或扩展数据。若要更换服务商，只需替换该文件里 `provider` 的地址与解析函数，并同步修改 `manifest.json` 的 `host_permissions`。
