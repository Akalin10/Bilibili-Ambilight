# Bilibili Ambilight

为 Bilibili 视频播放器添加**随画面变化的柔和环境光**（Ambilight）的浏览器扩展。播放视频时，插件会实时采样画面边缘的颜色，经过投影、模糊与衰减后铺在播放器四周甚至整页背景上，形成类似电视氛围灯的效果。

本项目 fork 自 [WesselKroos/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight) 的实现思路，页面适配、设置界面与渲染实现均为针对 Bilibili 重写，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

> 非官方扩展，与 Bilibili 无隶属关系。

## 功能

- **环境光渲染**：WebGL 优先、Canvas2D 兜底；画面采样 → 边缘投影 → 两级模糊 → 时间平滑
- **两种背景模式**
  - 玩家模式：环境光只围绕播放器
  - 页面模式：环境光延伸到整个页面背景（视频页滚动时依然连续）
- **亮色模式**：把背景板由黑底换成白底，并可跟随调节顶部搜索条、搜索面板、评论区、弹幕列表、页面滚动条等区域的配色
- **性能自适应**：自动调节渲染分辨率与帧率，检测掉帧后降级
- **设置项**：强度 / 模糊 / 扩散 / 渐变时长 / 饱和度 / 亮度 / 渲染质量 / 帧率上限
- **BewlyCat 兼容**：适配 BewlyCat 深色设计与它的影子根样式

## 安装（开发模式加载）

1. 下载或克隆本仓库到本地任意目录；
2. 打开 `edge://extensions`（Chrome 为 `chrome://extensions`）；
3. 打开右上角 **开发者模式**；
4. 点击 **加载解压缩的扩展**，选择本仓库根目录（含 `manifest.json` 的那一层）；
5. 打开任意 Bilibili 视频页，点击工具栏中的扩展图标即可调节。

> 修改代码后，需要在扩展管理页点击该扩展的 **刷新** 按钮，并 `Ctrl+F5` 强刷页面，样式改动才会生效。

## 目录结构

```
manifest.json           扩展清单（MV3）
popup.html              设置面板
src/
  settings.js           设置项的默认值、归一化、存储与订阅
  content.js            内容脚本入口：页面识别、挂载/销毁、主题类同步
  bewly-compat.js       BewlyCat 影子根样式适配
  bilibili/player.js    Bilibili 页面结构与播放器定位
  ambilight/
    AmbientLight.js     环境光主控：生命周期、几何、调度
    PerformancePolicy.js 自适应画质与帧率策略
    Projection.js       采样映射与盒式模糊
    Renderer.js         Canvas2D 渲染器
    WebGLRenderer.js    WebGL 渲染器
styles/
  ambilight.css         页面样式与亮色模式覆盖
  popup.css             设置面板样式
assets/                 图标与图标导出脚本
licenses/               第三方许可原文
```

## 隐私

扩展不收集、不传输任何数据；所有设置仅保存在浏览器本地（`chrome.storage.local`）。详见 [PRIVACY.md](PRIVACY.md)。

## 许可

MIT License，见 [LICENSE](LICENSE)。第三方参考与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [licenses/](licenses/)。
