# 参考项目与许可

本项目的环境光实现思路参考 [WesselKroos/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight)，本地核对的参考版本为 2.38.17。

参考范围包括画面采样、投影与模糊、帧同步及性能调节。Bilibili 页面识别、布局适配、设置界面和渲染实现位于本项目的 `src/` 与 `styles/`，不依赖原项目的 YouTube 页面适配代码。

原项目采用 MIT License，允许修改和再发布，要求在软件副本或实质性部分中保留版权和许可声明。原始声明完整保存在 [licenses/youtube-ambilight-MIT.txt](licenses/youtube-ambilight-MIT.txt)，项目根目录 LICENSE 亦保留原作者版权。

MIT 许可适用于软件代码，不授予 Bilibili 标识、视频内容或截图中第三方素材的权利。展示截图仅用于说明扩展效果，相关内容属于其权利人。本项目为非官方扩展，与 Bilibili 及参考项目作者无隶属关系。
