# JazzTor 视觉、交互与可访问性审查

日期：2026-10-20（America/New_York）  
审查对象：`http://localhost:5173/`  
范围：Home Day/Dusk/Night、Night Map、Museum、Toronto Jazz Legacy、Collection、唱片选择与房间灯联动。

## 总体结论

当前版本已经建立了清晰的 JazzTor 世界观：唱片机是视觉中心，Toronto 窗景、黑胡桃木、黄铜、黑色大理石和持续播放器形成一致语言；语义层也已有按钮、单选项、滑杆和列表等基础。

目前最大的问题不是“功能不存在”，而是视觉渲染、空间交互和语义层之间尚未统一：Day 的高光过曝但暗部仍偏死；Night Map 在视觉上几乎不可用；Museum、Legacy、Collection 主要表现为二维左侧面板；唱片选择只更新播放器数据，没有提供明确的实体弹出反馈；Whiskey 杯、液体、冰球和瓶体缺乏真实的光学分层。

## 测试步骤与健康度

### 1. 首页 Dusk — 一般

![首页 Dusk](./01-home-dusk.jpg)

- 优点：唱片机层级明确，Toronto 窗景和暖色室内具有氛围，播放器持续存在。
- 问题：黑胡桃木和黑色大理石暗部接近压死；黄铜高光偏硬；Whiskey 仍像透明圆柱和橙色体块。

### 2. 首页 Day — 较差

![首页 Day](./02-home-day.jpg)

- 唱片、黄铜盘边、木质面板和大理石产生大片接近白色的高光，材质差异被曝光覆盖。
- 室外很亮，但室内阴影仍过黑，说明问题不是简单的总曝光，而是直射光、环境填充、反射强度和 tone mapping 没有分开控制。
- 建议：降低 Day 直射光和环境贴图峰值；增加更柔和的室内漫反射填充；使用 AgX 或等效高光压缩；逐材质修正 roughness、anisotropy 和 clearcoat。

### 3. 首页 Night — 一般偏差

![首页 Night](./03-home-night.jpg)

- 城市夜景和暖灯方向成立。
- 唱片机正面、唱片柜和 Whiskey 仍缺少足够的轮廓光和局部反射；主体在普通屏幕上容易丢失细节。

### 4. Night Map，主灯关闭 — 严重失败

![Night Map](./04-map-night.jpg)

- 地图、街道、地点标签和大部分控制几乎不可见。
- 视觉上无法完成“查看地点—选择地点—阅读信息”的核心任务。
- 虽然语义树中存在筛选按钮和地点列表，但可见内容与可访问语义不一致。

### 5. Museum — 功能可用，空间设计不符合目标

![Museum](./05-museum-current.jpg)

- 时间轴、章节、来源和下一章节均有结构，内容层次清楚。
- 主要体验是占据左侧的大型二维面板，和“穿过实体门进入独立 3D Museum”的目标冲突。
- 建议点击 Museum 后播放门把手、开门与镜头穿越动画，进入独立展馆；World Jazz History 使用自己的时间轴、世界地图、档案卡和试听物件，DOM 仅作为可访问语义镜像和动态文字层。

### 6. Toronto Jazz Legacy — 功能可用，空间设计不符合目标

![Legacy](./06-legacy-current.jpg)

- 人物、年份、简介、关键作品、地点与来源结构完整。
- 仍是传统详情面板；人物之间通过底部 tab 切换，没有形成 Toronto 专属的“本地地图/场地档案柜/人物索引/唱片”式空间探索，也没有与 World Jazz History 明确分馆。
- 当前肖像占位符明确说明版权未解决，这是正确的；后续所有肖像必须保持权利状态和来源记录。

### 7. Collection — 功能可用，但脱离房间

![Collection](./07-collection-current.jpg)

- 搜索、排序、For You、My Crate、Recently Played 和收藏状态均有功能基础。
- 视觉上仍是专辑网格面板，而不是实体唱片柜；专辑的纸张厚度、封套、黑胶边缘、槽位和滑出状态没有得到利用。

### 8. 选择唱片 — 功能成功，反馈不足

![选择唱片后](./08-album-cabinet-selected.jpg)

- 选择 `City Slacker` 后，播放器曲目、时长和收藏状态正确更新。
- 房间中的唱片柜没有明显把所选封套推出 12–15%，用户难以将操作与实体对象变化联系起来。
- 建议：所选封套沿柜体法线滑出；相邻唱片产生极轻微碰撞/挤压；露出的黑胶边缘、投影和黄铜铭牌同步出现。

### 9. Night Map，房间灯开启 — 严重失败

![Night Map 开灯后](./09-map-night-lamp-on.jpg)

- 开启房间灯后，地图站仍几乎全黑。
- 说明灯光状态没有传播到 Map，或地图桌材质/局部光源完全独立但没有自己的可用照明。
- Map 必须有独立、始终保证可读性的工作灯光；房间灯只改变氛围，不应决定地图是否可用。

## 最高优先级改进

1. **修复 Night Map 可见性。** 为地图站配置独立的 2700K–3000K 工作灯、玻璃边缘暗藏光、柔和填充和可控 pin emissive；不要依赖主房间灯。
2. **重建 Day 光照。** 分离背景亮度、环境光、太阳光、局部反射和总曝光；保留高光细节并抬起暗部，不使用单一 exposure 参数粗暴补偿。
3. **把 Museum 变成门后的独立空间。** 保持唱片机主页面不变；通过实体门过场进入展馆，并将 World Jazz History 与 Toronto Jazz Legacy 设计为两个不同入口、内容模型和交互系统。Collection 继续通过主页面实体唱片柜承载。
4. **重做 Whiskey。** 杯体、液体、meniscus、冰球、瓶体和瓶中液体必须是独立网格与独立光学材质。
5. **强化唱片柜交互。** selected / hover / focus / drag-ready 都应有清晰、克制、机械可信的 3D 状态。

## 其他值得提升的地方

- 唱片机正面木纹粗糙度过均匀，局部高光像湿亮清漆；需要微观 roughness variation 和正确纹理方向。
- 黄铜目前多个部件共享相近的镜面表现；盘边、按钮、旋钮、唱臂和装饰条应有不同拉丝方向及粗糙度。
- 黑胶唱片需要 run-in、音乐区、run-out 三类 groove zone 和轻微各向异性反光。
- 底部播放器文字和旋钮较小；视觉仍可保持纤细，但交互命中区需至少 44×44 CSS px。
- 顶部导航在明亮和复杂背景上对比度不稳定；应使用很轻的局部背板、文字阴影或受控背景遮罩，而不是加粗发光。
- 当前 overlay 打开时，底层房间控制、唱片列表和播放器仍出现在可访问树中。需要正确的 focus trap、`inert`/aria 管理与关闭后的焦点恢复。
- 关闭 Collection 后焦点回到了 Museum，而不是触发 Collection 的原始控制，存在焦点恢复逻辑问题。
- Day/Dusk/Night 切换存在约 1 秒左右的过渡；过渡期间会短暂显示旧背景与新 UI 状态，需把背景、环境光、反射与曝光作为同一事务切换。
- Reduced Motion 下，相机移动应替换为 150–250 ms 淡入淡出，但实体状态仍需提供非运动式选中反馈。

## 可访问性证据与限制

确认优点：主要导航、时间模式、播放器、灯、窗帘、唱片选择、Museum 时间轴、Legacy 人物、Collection 搜索/排序均有语义控件。

风险：Map 视觉对比严重不足；大量顶部文字过小；覆盖层打开后底层交互仍可能被键盘和读屏访问；关闭后的焦点恢复不正确；仅靠截图不能确认完整键盘顺序、焦点环、屏幕阅读器宣告、缩放重排和 reduced-motion 行为。

## 生成的视觉目标

- `D:\Jazztor\assets\concepts\2026-10-20\old-money-museum-upgrade\01-day-lighting-whiskey-cabinet-concept.png`
- `D:\Jazztor\assets\concepts\2026-10-20\old-money-museum-upgrade\02-night-map-lighting-concept.png`
- `D:\Jazztor\assets\concepts\2026-10-20\old-money-museum-upgrade\04-separate-museum-world-and-toronto.png`
- `D:\Jazztor\assets\concepts\2026-10-20\old-money-museum-upgrade\05-museum-door-transition.png`
- `D:\Jazztor\assets\concepts\2026-10-20\old-money-museum-upgrade\06-crystal-whiskey-pbr-model.png`

这些图片是 3D 建模、材质、灯光和交互构造参考，不得作为整屏背景图或用二维平面冒充实体对象。图片中的人物照片、专辑、地点细节和文字仅为视觉概念，生产使用前必须替换为已核实且有授权记录的内容。

