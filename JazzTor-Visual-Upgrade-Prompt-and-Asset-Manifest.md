# JazzTor 主界面写实升级 Prompt 与美术资产清单

> Windows 项目根目录：`D:\Jazztor`  
> 目标：将现有主页从“概念级 3D 拼接感”提升到“高端、真实、电影级但可实时运行的私人爵士聆听室”。

## 一、可直接交给 Codex / Claude / 前端开发者的完整 Prompt

```text
你正在改进现有 JazzTor Web App 的主界面。项目位于 D:\Jazztor。先检查现有代码、Three.js/React Three Fiber 场景、素材加载流程、后处理、响应式布局和现有交互；在保持功能完整的前提下做增量重构，不要删除当前可用功能，也不要把整个页面改成静态图片。

核心目标

把主界面升级成一个高度写实、沉浸式、可交互、可实时运行的 Toronto 高层私人爵士聆听室。黑胶唱片机是绝对主体。画面必须呈现真实摄影级材质、准确的多伦多天际线、统一的室内外光照、清晰的玻璃与 Whiskey 质感，以及高分辨率但可根据设备性能降级的渲染。

一、必须保留的体验

1. 大型 3D 黑胶唱片机是主页主体。
2. 唱片机上保留没有明显播放图标的实体一键播放按钮，通过材质、轮廓光和轻微机械反馈引导用户发现。
3. 保留彩蛋式手动播放：从封套拖出唱片、放到转盘、切换俯视角、拖动唱臂、落针播放。
4. 保留 Day / Dusk / Night，并默认根据 Toronto 当地时间自动切换，同时允许手动覆盖。
5. 保留可开合窗帘、灯光开关和亮度、Whiskey 底座旋转、唱片柜 For You / My Crate、底部实体播放器、Jazz Map、Museum、Toronto Jazz Legacy、Collection、登录和 Preferences。
6. 播放状态、房间状态、选择的唱片、时间模式、灯光和窗帘在页面切换时保持。
7. 支持 prefers-reduced-motion 和键盘操作。

二、禁止项

1. 不使用二维图片冒充家具、唱片机、播放器、按钮、酒杯、灯、唱片柜或其他可交互物件。
2. 不使用悬浮玻璃卡片、传统 dashboard 面板、通用 streaming app 布局或大型中心文案。
3. 不使用低分辨率 Toronto 图片放大，不用 CSS blur 隐藏低清晰度。
4. 不允许窗外照片、室内光源和 3D 物件出现互相矛盾的光线方向。
5. 不要过度 bloom、橙青色滤镜、赛博朋克霓虹、赌场感、夜店感、塑料木纹或镜面黄铜。
6. 不要加入椅子、书柜或无功能装饰物。
7. 不改变 JazzTor 黑胡桃木、香槟黄铜、黑色大理石、烟熏玻璃、奶油纸张和暖琥珀灯光的设计语言。

三、Toronto 背景重建

1. 使用拥有商业使用权的真实 Toronto skyline 高分辨率照片作为窗外环境，首选从 Toronto Islands / waterfront 面向 downtown 的视角，CN Tower、Rogers Centre、湖岸线和建筑比例必须可信。
2. 准备相同或高度接近机位的 Day、Dusk、Night 三套背景。每套原图长边不低于 6000 px，优先 8K，保留无损母版并导出 AVIF/WebP。
3. 浏览器按视口加载 1920、2560、3840 三档，不得把 1920 图放大到 4K 显示。
4. 背景放在远距离弧形环境层或分层 parallax 环境中，不直接贴在窗玻璃后方。至少拆分天空、远景建筑、中景 waterfront 三个深度层；相机移动时只产生极轻微视差。
5. 窗外照片允许作为摄影环境纹理；“禁止贴图”仅指禁止用二维平面冒充真实 3D 物件。
6. 每种时间状态必须匹配独立的天空、建筑发光遮罩、环境光颜色和曝光值。不要用一张白天照片单纯改色模拟夜晚。
7. 窗玻璃是真实 3D 几何体，具有厚度、低铁玻璃 IOR、非常轻微粗糙度、室内反射和边缘亮度，但不能形成镜子。

四、灯光和色彩管理

1. 根据 Toronto 背景照片中的太阳/天空方向重建室内主光，保证唱片机、柜子、酒杯和地面的高光与阴影方向一致。
2. Day：中性偏暖自然天空光，柔和但明确的方向性阳光，灯具低强度或关闭。
3. Dusk：冷色窗外环境光 + 2400–2700 K 暖灯，保留暗部细节和黄铜高光。
4. Night：城市冷色环境填充 + 一盏暖色主灯 + 极弱设备指示灯；不使用蓝色霓虹泛光。
5. 使用 AgX 或等效 filmic tone mapping，正确设置 renderer.outputColorSpace；禁止高光爆白、黄铜变纯黄色、暗部压死。
6. 加入低强度 GTAO/SSAO、接触阴影和反射探针。阴影要软且有层次，避免所有物件像漂浮在桌面上。
7. Bloom 仅作用于极亮城市灯光和微弱指示灯，强度保持克制。

五、唱片机材质升级

1. 黑胡桃木必须使用独立 Base Color、Normal、Roughness、AO 和可选 Height，纹理方向必须符合真实木件加工方向，不能在相邻面连续拉伸。
2. 木材粗糙度包含细微变化、毛孔和使用痕迹，禁止整体高光像清漆塑料。
3. 黄铜使用 metallic workflow、各向异性拉丝和局部粗糙度变化。转盘边缘、按钮、旋钮和装饰条不能共用完全相同的材质参数。
4. 黑胶唱片增加真实细密沟槽、run-in/run-out 区域和各向异性反光；避免过深法线或波浪形表面。
5. JazzTor 字样使用真实雕刻、布尔切割或金属嵌字几何，不使用平面文字图片。
6. 唱臂、唱头、唱针、配重、转轴、按钮和旋钮保持机械可信并拥有正确 pivot。

六、Whiskey 资产升级

1. 酒瓶、瓶塞、杯体、Whiskey 液体、液面、冰球、旋转底座分别为独立网格。
2. 杯子是真实厚壁 cut-crystal glass；参考 IOR 约 1.45，roughness 约 0.02–0.08，不能像透明塑料。
3. Whiskey 使用 transmission + volume absorption 塑造琥珀色，参考 IOR 约 1.35–1.37；不要只把表面设为橙色。
4. 液体必须有真实 meniscus，不能与杯壁穿插或悬空。
5. 冰球有内部气泡、轻微裂纹、局部雾化、融化不规则边缘和适度吸收/散射；禁止完美透明玻璃球。
6. 使用低成本 screen-space 或投影纹理模拟克制焦散；桌面光斑随 50–60 秒一周的底座旋转轻微变化。
7. 为中低端设备提供简化版本：减少透明层、关闭实时折射和动态焦散，但保持轮廓和色彩品质。

七、画面清晰度与实时渲染

1. 不通过 CSS 放大低分辨率 canvas。render target 根据设备 DPR 动态设置，桌面上限约 2，移动端根据 GPU 能力控制在 1–1.5。
2. 使用 MSAA/SMAA/TAA 中适合当前技术栈的方案，消除唱臂、窗框和黄铜边缘锯齿。
3. 对唱片、木纹和大理石启用正确 mipmap 与 anisotropic filtering。
4. Hero 唱片机近景材质可使用 4K；Whiskey、柜体等 2K–4K；远景和小物件 1K–2K。发布时使用 KTX2/BasisU。
5. GLB 使用 Meshopt 或 Draco，按距离加载 LOD0/1/2。不能为了高清把所有模型永久保持最高面数。
6. 景深只用于非常轻微的摄影效果；Toronto skyline 和主要物件必须保持可辨识，禁止用强 DOF 隐藏低精度模型或背景。
7. 先加载高质量背景和房间轮廓，再加载唱片机，随后加载 Whiskey、唱片柜和次要资产，最后启用高级反射与后处理。避免用户先看到模糊占位图突然跳变。

八、构图和视觉层级

1. 唱片机占据第一视觉中心，完整可见并保留可操作区域。
2. CN Tower 不得从唱臂、酒瓶或灯具后方穿出；调整相机或照片裁切形成清晰轮廓。
3. Whiskey 是第三视觉层级，不得因过亮或过大抢走主体。
4. 唱片柜是第二功能中心，选中的唱片弹出 12–15%，并在实体铭牌上显示专辑/歌曲和艺术家。
5. 底部播放器改为真实 3D walnut/brass console，并在 DOM 中提供透明但可访问的点击层；视觉上不能像固定网页 footer。
6. 留出足够负空间，避免所有物件贴满窗口和桌面。

九、动画与交互质感

1. 转盘启动、33⅓ RPM 稳态和停止必须有真实加减速。
2. 唱臂沿机械弧线运动，落针过程缓慢、无穿模，加入短促但克制的落针声音。
3. 实体按钮有 1.5–2.5 mm 行程、阴影变化和短暂高光反馈；不要使用移动 App 弹簧动画。
4. 唱片柜滑出、窗帘、灯光和 Whiskey 旋转都使用有重量感的缓动。
5. 空闲状态仅保留极轻微城市灯光、云层、玻璃高光和 Whiskey 旋转，不能持续大幅运动。
6. reduced-motion 模式关闭相机飞行、视差、云层和非必要循环动画，用短淡入淡出替代。

十、响应式与无障碍

1. Desktop 保留完整房间；Tablet 减少城市视差和后处理；Mobile 使用更紧凑相机、简化透明材质和更低 LOD，但不能替换成静态主页截图。
2. 所有实体 3D 控件建立对应的语义化 DOM 按钮、键盘焦点、aria-label 和至少 44×44 CSS px 的可操作区域。
3. 文字与背景保持可读对比度；不要把重要文字直接烘焙进不可缩放纹理。
4. 用户首次进入时，不强制播放带声音的音乐。必须通过明确用户操作启动音频上下文。

十一、代码与文件约束

1. 项目根目录：D:\Jazztor。
2. 原始摄影：D:\Jazztor\assets\environment\source。
3. Web 背景：D:\Jazztor\app\public\assets\environment。
4. Blender 源文件：D:\Jazztor\blender\source。
5. GLB：D:\Jazztor\blender\exports。
6. PBR 源纹理：D:\Jazztor\blender\textures。
7. Web 优化纹理：D:\Jazztor\app\public\assets\textures。
8. 音效：D:\Jazztor\audio\sfx。
9. 不覆盖原始母版；所有压缩和优化资源写入 web/runtime 目录。
10. 保留当前 Git 历史和用户已有改动，不做 destructive reset。

十二、完成后的验收

1. 以 2560×1440 和 3840×2160 截图检查，Toronto 建筑和 CN Tower 清晰，无低分辨率放大。
2. Day、Dusk、Night 使用相同房间几何和相机，只改变背景、光源、环境和建筑灯光。
3. 窗外与室内光线方向一致；所有主要物件具有可信接触阴影。
4. Whiskey 杯、液体和冰球可以明确区分，玻璃没有黑边、排序错误或明显噪点。
5. 木纹无拉伸，黄铜不过曝，唱片沟槽不过度。
6. Desktop 首屏在合理网络条件下渐进加载，不因 8K 图片阻塞交互。
7. Mobile 不出现崩溃、长时间黑屏或透明材质严重错误。
8. 键盘可访问一键播放、时间切换、窗帘、灯、唱片柜和播放器。
9. reduced-motion 正常生效。
10. Lighthouse、GPU frame time 和资源体积报告记录在 D:\Jazztor\reports。

请先输出：
A. 当前代码和素材审查；
B. 要修改的文件清单；
C. 缺失资产清单；
D. 分阶段实施计划。

之后再开始实现。实现完成后给出 before/after 截图、性能数据、仍存在的限制，以及所有新资产的版权和来源记录。
```

## 二、需要准备的美术素材

### A. Toronto 环境摄影

| 文件 | 规格 | 用途 |
|---|---|---|
| `toronto-day-master.tif` | 6000–8000+ px，16-bit 优先 | 白天母版 |
| `toronto-dusk-master.tif` | 相同/接近机位，6000–8000+ px | 黄昏母版 |
| `toronto-night-master.tif` | 相同/接近机位，6000–8000+ px | 夜晚母版 |
| `toronto-*-3840.avif` | 3840 px 宽 | 4K 桌面 |
| `toronto-*-2560.avif` | 2560 px 宽 | 普通桌面 |
| `toronto-*-1920.webp` | 1920 px 宽 | 低带宽/移动端 |
| `toronto-*-sky-mask.png` | 4K 灰度 | 天空分层、云层动画 |
| `toronto-*-city-emissive.png` | 4K 灰度/彩色 | 夜晚建筑灯光 |
| `toronto-waterfront-depth.exr` | 16-bit depth | 轻微 parallax |

摄影必须保存作者、来源链接、授权类型、下载日期、允许的商业用途和是否要求署名。不要使用 Google Images、新闻照片或来源不明的 Pinterest 图片。

### B. HDRI 与灯光参考

- `toronto-day-8k.hdr`
- `toronto-dusk-8k.hdr`
- `toronto-night-8k.hdr`
- 三套灯光参考球：chrome ball、gray ball、color chart。
- Window key、sky fill、lamp practical、city rim 的照度/色温记录。

如果无法获得 Toronto 实拍 HDRI，可使用许可明确的同类天气 HDRI，再依据 skyline 照片手工匹配太阳方向和色温。

### C. 必需 3D 模型

| 模型 | 文件 | 推荐 LOD0 / LOD1 / LOD2 |
|---|---|---:|
| 房间、墙体、地面、窗框 | `JT_Room.glb` | 250k / 120k / 50k tris |
| 唱片机完整机械结构 | `JT_Turntable.glb` | 150k / 60k / 20k |
| 唱片、内袋、封套 | `JT_VinylSet.glb` | 35k / 15k / 6k |
| 唱片柜与可弹出唱片 | `JT_Cabinet.glb` | 100k / 45k / 18k |
| 台灯与开关/调光旋钮 | `JT_Lamp.glb` | 25k / 12k / 5k |
| 窗帘 Open/Half/Closed | `JT_Curtains.glb` | 80k / 35k / 15k |
| 酒瓶、杯、液体、冰球、底座 | `JT_Whiskey.glb` | 45k / 20k / 8k |
| 黑色大理石唱片机家具 | `JT_Console.glb` | 45k / 20k / 8k |
| 实体播放器/VU 表 | `JT_PlayerConsole.glb` | 55k / 25k / 10k |
| 实体导航与房间控制器 | `JT_RoomControls.glb` | 40k / 18k / 7k |
| Jazz Map 桌面 | `JT_MapStation.glb` | 90k / 40k / 15k |
| Museum/Legacy 展示台 | `JT_ArchiveStation.glb` | 90k / 40k / 15k |
| Toronto 视差代理几何 | `JT_TorontoDepth.glb` | 80k / 30k / 10k |

每个可操作部件必须单独命名并设置正确 pivot，例如：

```text
JT_Turntable_Platter
JT_Turntable_TonearmRig
JT_Turntable_PlayButton
JT_Cabinet_Sleeve_001
JT_Curtain_Left
JT_Curtain_Right
JT_Whiskey_Liquid
JT_Whiskey_IceSphere
JT_Whiskey_Pedestal
JT_Player_VU_Left
JT_Player_VU_Right
```

### D. PBR 材质套装

每套至少包含 Base Color、Normal、Roughness、AO；金属增加 Metallic，必要时增加 Height/Displacement。

1. `walnut-dark-4k`：纵纹、横切面、边缘三种 UV/材质变体。
2. `brass-satin-4k`：拉丝方向、指纹和微划痕遮罩。
3. `brass-aged-2k`：极轻氧化，仅用于小部件。
4. `marble-black-gold-4k`：无明显重复纹理。
5. `vinyl-grooves-4k`：沟槽 normal/roughness 与 label mask。
6. `glass-crystal`：程序化主材质 + cut-crystal normal。
7. `whiskey-volume`：吸收颜色、密度参数和移动端简化版。
8. `ice-sphere`：normal、内部 bubble/crack volume mask。
9. `curtain-wool-4k`：双面材质、织物 normal、roughness。
10. `smoked-glass`：窗户/展柜两套不同厚度参数。
11. `cream-paper-2k`：档案卡、唱片说明牌。
12. `blackened-metal-2k`：播放器面板和控制器。

### E. 专辑与动态内容

- 至少 12 张拥有展示权的专辑封面；开发期使用原创占位封面。
- 每张封面导出 1024×1024 AVIF/WebP。
- 对应的平均色、主色、辅助色和推荐灯光色 JSON。
- 艺术家、专辑、歌曲、年份和授权字段。
- 封面只作为真实 3D 封套表面的内容纹理，不能替代封套网格。

示例：

```json
{
  "albumId": "jt-demo-001",
  "cover": "/assets/albums/jt-demo-001-1024.avif",
  "dominant": "#8A3B27",
  "accent": "#D7B46A",
  "title": "Demo Album",
  "artist": "Licensed Artist",
  "licenseId": "LICENSE-RECORD-ID"
}
```

### F. 音效素材

全部使用 48 kHz / 24-bit WAV 母版，Web 端导出 Opus/AAC：

- `button-press.wav`
- `relay-click.wav`
- `platter-start.wav`
- `platter-stop.wav`
- `vinyl-lead-in.wav`
- `needle-drop.wav`
- `tonearm-move.wav`
- `sleeve-paper-slide.wav`
- `record-spindle-contact.wav`
- `cabinet-album-slide.wav`
- `curtain-open.wav`
- `lamp-switch.wav`
- `rotary-detent.wav`
- `whiskey-motor-roomtone.wav`
- `toronto-room-ambience-day.wav`
- `toronto-room-ambience-night.wav`

不要把持续的唱片爆豆声覆盖在所有音乐上；仅在落针和开头短暂使用，或作为可关闭的 ambience。

### G. 后期与运行时资源

- Day / Dusk / Night 三套 reflection probe/cubemap。
- 室内静态 lightmap（如项目采用 baked lighting）。
- 接触阴影 blob 仅作低端设备 fallback，主版本使用真实阴影。
- 轻微 film grain LUT/噪声图。
- 建筑灯光 emissive mask。
- Whiskey 低成本 caustic projector texture。
- GPU 分级配置：Ultra、High、Balanced、Mobile。

## 三、推荐目录结构

```text
D:\Jazztor
├─ assets
│  ├─ environment
│  │  ├─ source
│  │  ├─ masks
│  │  └─ licenses
│  └─ albums
├─ blender
│  ├─ source
│  ├─ textures
│  └─ exports
├─ audio
│  ├─ source
│  ├─ sfx
│  └─ licenses
├─ app
│  └─ public
│     └─ assets
│        ├─ environment
│        ├─ models
│        ├─ textures
│        ├─ albums
│        └─ audio
└─ reports
```

## 四、最低可用资产（先完成这一批）

如果暂时无法一次准备全部素材，先完成以下 10 项即可获得最明显的质感提升：

1. Toronto Day/Dusk/Night 三张授权高清照片。
2. 三套与照片匹配的环境光/HDRI。
3. 黑胡桃木 4K PBR。
4. 拉丝黄铜 4K PBR。
5. 黑金大理石 4K PBR。
6. 改进后的 Whiskey 玻璃、液体、冰球模型和材质。
7. 唱片沟槽 normal/roughness。
8. 窗玻璃真实几何与反射配置。
9. 实体播放器 GLB。
10. 经过 KTX2、Meshopt/Draco 和 LOD 优化的主唱片机 GLB。

## 五、视觉验收标准

- 用户第一眼明确认为这是 Toronto，而不是模糊的通用城市。
- 窗外、唱片机和 Whiskey 像处于同一个真实光照环境中。
- 4K 屏幕没有明显背景像素化或 3D 边缘锯齿。
- 木材不是塑料，黄铜不是纯金色镜面，黑胶不是黑色圆盘贴图。
- Whiskey 能看出杯壁、液体、冰球和折射层次。
- 所有可交互物件是有厚度、机械状态和触碰反馈的真实 3D 对象。
- 页面在视觉升级后仍能在普通桌面和现代手机上流畅降级运行。
