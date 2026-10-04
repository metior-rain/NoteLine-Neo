# 原作与素材来源

NoteLine Reborn 的原作为 https://github.com/metior-rain/NoteLine ，作者 metior-rain。

本次读取的原作提交：`3188fd5bd4b53397393e5b8f8a10ba0b8a221edd`。

保留的原作资源：

- `Game/Song/` 中五个 MP3 → `assets/audio/`。
- `Game/SongPictures/` 中五张曲目封面 → `assets/covers/`。
- `Game/icon/icon.png` → `assets/icon.png`。
- `Game/JSON/` 中五份谱面 → `assets/charts/`，转换为 NoteLine Score 1 / .nlchart 格式，去掉原作 3000ms 预备时间。
- 第二首谱面的内部名称原为 New Journey!，按照原作选曲界面修正为 Boring。

原作没有在所读取的仓库根目录提供 LICENSE 文件。音乐与图片的权利归各自权利人所有，本重制未改变其授权状态。

新版界面、游戏渲染、判定模块、存储、导入和录制工具重新实现；没有引入原作的商业图标字体。

新版 `assets/charts/hold-study.nlchart` 以 Boring 原谱的头部时间点为基础，将部分同轨相邻音符合并为长按练习，使用原 song2.mp3 音频和 song2.png 封面；没有新增音乐素材。

游戏采用 PixiJS 8.18.0（MIT），通过 esbuild 打包；第三方许可随 `runtime/THIRD-PARTY-LICENSES.txt` 一同保留。依赖版本记录于 package-lock.json。

