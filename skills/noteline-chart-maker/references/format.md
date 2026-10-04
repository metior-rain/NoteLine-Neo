# 格式与时间

本资料对应当前项目，实际打包以仓库实现为准；若版本变化，先检查源码再更新技能。

## 编排源谱

```json
{"charts":{"normal":{"name":"曲名 · 作者","bpm":125,"beatOffset":240,"duration":5000,"notes":[{"lane":0,"time":240},{"lane":2,"time":240},{"lane":1,"time":720,"end":1680}]}}}
```

- 难度键只能是 `easy`、`normal`、`hard`，允许按请求只提供部分难度；每档必须有音符，所有难度共用同一音频时长。
- `lane`: 0–3，分别 D/F/J/K（橙、蓝、粉、绿）；0/1 左手，2/3 右手。
- `time` 和 `end`: 相对音频起点的毫秒，可带小数。长按至少 80ms。同轨音符不能重复、重叠，也不能在前一长按尾部的同一时刻再起一个头。
- `duration`: 解码后完整音频时长；不得用最后一个音符时间来替代或通过增加它来掩盖越界。
- `bpm`: 20–400，参考节拍网格；`beatOffset`: 网格原点，允许负值。音符本身必须非负。
- 等分拍点：`beatOffset + (beatIndex + subdivisionFraction) * 60000 / bpm`。先算绝对时间再四舍五入到微秒，避免把单拍周期先取整后反复累加产生漂移。

## 流星与弹跳源谱

```json
{"kind":"meteor","lane":0,"time":1000,"end":3000,"path":[{"lane":1,"time":2000},{"lane":2,"time":3000}]}
```

将 `kind` 换为 `bounce` 即为弹跳；其余结构相同。

- 头部 `lane/time` 单独存放，`path` 只含后续节点，不能重复存头部。所有节点时间都是相对音频零点的绝对毫秒，不是相对前一节点的时长。
- `path` 有 1–256 个后续节点，轨道都是整数 0–3，严格按时间排列，相邻节点及头到首节点至少间隔 160ms；`end` 必须等于最后节点的 `time`。
- 整条路径均须在实际音频时长内。每档包含头部在内的路径点总数最多 50000。
- 同轨停留可通过后续同轨节点表达；一个节点仍是一个判定。流星节点不是动画关键帧，不要为了画曲线添加没有音乐依据的密集节点。
- 流星冲突检查按 `occupiedSpans` 的真实停留/变轨区间；弹跳只占用头和各落点。不要把整条路径压在起始轨上检查，也不能只检查流星的节点而忽略中间的持续占用。
- `notes` 是音符对象数；实际判定数由 `judgmentCount` 计算：普通单击/长按各 1，流星/弹跳各为 `1 + path.length`。长按的尾部不另加 Combo，路径最后一个节点也不重复计数。

## 成品格式

`.nlchart` 是一个完整二进制包，**不是** JSON 文件改扩展名。

- 8 字节 ASCII 魔数 `NLCHART2`，随后 4 字节 little-endian 元数据长度。
- UTF-8 JSON 元数据：`format: noteline.package`，`revision: 3`，`title`，`charts` 和 `assets`。
- `charts` 的每档为 NoteLine Score：`format: noteline.score`、`meta.title`、`audio.durationUs`、`timing.bpm/originUs`、四个 `tracks`。只含单击/长按时 `revision: 1`；该档含任意路径音符时 `revision: 2`，由 `encodeScore` 自动选择。
- 每个 track 为 `{key,events}`；事件为 `{atUs,kind:"tap"}` 或 `{atUs,kind:"hold",lengthUs}`。所有时间单位为整数微秒。
- Score 2 增加 `{atUs,kind:"meteor"|"bounce",nodes:[{key,atUs},...]}`。事件放在起始轨的 `events` 内，节点时间同样为绝对整数微秒；不写 `lengthUs`，末节点给出结束时间。Score 1 不支持路径事件。
- 元数据后依次存原音频字节和可选封面字节；`assets.audio/cover` 声明各自长度与 MIME，没有封面是 `null`。
- 当前限制：元数据 8MB、音频 100MB、封面 5MB；每档 1–50000 判定点（路径的头部与后续节点均计入）；时间最多 1 小时。
- **Package revision 与 Score revision 是两层独立版本**：旧 Package 2 只含一档，会被映射为普通；新制包使用 Package 3，由项目 `createScorePackage` 生成，同一个包可以含 Score 1 与 Score 2 的不同难度。
- 导入与编辑器保存将资源持久化为独立 ArrayBuffer；不要把 `blob:` URL 或文件切片引用当作可跨网页重开的资源。谱面交付仍是内嵌音频/封面字节的 `.nlchart`，不输出浏览器曲库记录。
