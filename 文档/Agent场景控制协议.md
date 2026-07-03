# 前台表达数据接口说明

> 文档版本：2026-07-03  
> 适用对象：后台 Agent 开发成员  
> 协议版本：`SCP/1.3`  
> 用途：**规定后台需向前台推送哪些 JSON 数据**，前台据此驱动 3D 场景表达

**实现状态说明（基于当前平台功能）**


| 状态           | 含义                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------ |
| **支持**       | 对应业务能力在**场景编辑器**和**导出预览包**中均已实现：可配置、可预览、导出后可自动生效。接入 Agent 协议时，主要补「消息接收 → 指令解析 → 调用现有能力」即可。 |
| **部分支持**     | 仅完成**手动编辑**或**静态导出**环节；**Agent 远程驱动**、**运行时动态更新**、或协议中的部分参数/模式尚未打通。详见第四节总表与第十节明细。          |
| **暂不支持**     | 平台尚无该业务能力，后台请勿下发对应指令。                                                                      |
| **不支持（已移除）** | 当前版本不纳入协议（如粒子特效）。                                                                          |


> **共性缺口**：`agent.expression` / `scene.expression` 等消息的**接收入口与指令调度**尚未建设（无 WebSocket 订阅、无按 tick 执行 commands 的总线）。因此即便标为「支持」的 action，后台目前也**无法直接推送生效**，需先完成协议接入层。

---

## 一、后台需推送的数据概览

后台每个设备 Agent 按 tick 向前台推送一条表达消息，核心数据如下：


| 数据块                                 | 是否必填 | 作用                   |
| ----------------------------------- | ---- | -------------------- |
| `agentId` / `deviceId` / `objectId` | 是    | 标识是哪个设备、对应哪个 3D 模型   |
| `tick`                              | 建议   | 仿真节拍序号               |
| `deviceState`                       | 否    | 设备业务数据（转速、液位等），供面板展示 |
| `commands`                          | 是    | **表达指令列表**，前台逐条执行    |


---

## 二、消息格式

### 2.1 单设备表达消息（主用）

```jsonc
{
  // 协议版本号，固定 SCP/1.3，前后台据此校验格式兼容性
  "protocol": "SCP/1.3",
  // 本条消息唯一 ID，防重复处理，建议格式：msg_{agentId}_tick{序号}
  "messageId": "msg_agent_pump_01_tick42",
  // 仿真会话 ID，同一场景多次运行需区分
  "sessionId": "sim_session_abc123",
  // 消息发出时间（墙钟时间，ISO 8601），非仿真逻辑时间
  "timestamp": "2026-07-03T10:30:00.000Z",
  // 消息类型：单设备表达指令
  "type": "agent.expression",
  // 业务数据体
  "payload": {
    // 后台设备 Agent 唯一 ID
    "agentId": "agent_pump_01",
    // 现实设备编号（PLC / MES / 设备台账）
    "deviceId": "P-01",
    // 前台 3D 模型 ID，须与 scene.json 中 editor.objects[].id 一致
    "objectId": "pump_01",
    // 场景项目 ID
    "sceneId": "factory_line_01",
    // 仿真节拍序号，从 0 递增，用于多设备对齐与回放
    "tick": 42,
    // 仿真逻辑时间（可选），可与现实时间不同
    "simTime": "2026-07-03T10:30:00.000Z",
    // 设备业务态摘要，供 UI 面板展示，不直接驱动物理运动
    "deviceState": {
      "status": "running",    // 运行状态：running / warning / error 等
      "rpm": 1450,            // 转速（转/分）
      "temperature": 62.5     // 温度（°C）
    },
    // 本 tick 表达指令列表，前台逐条执行，结构见第三节
    "commands": []
  }
}
```

**payload 字段说明**


| 字段            | 类型             | 必填  | 说明                                                    |
| ------------- | -------------- | --- | ----------------------------------------------------- |
| `agentId`     | string         | 是   | 后台设备 Agent ID                                         |
| `deviceId`    | string         | 是   | 现实设备编号（PLC / MES / 台账）                                |
| `objectId`    | string         | 是   | 前台 3D 模型 ID，与 `scene.json` 中 `editor.objects[].id` 一致 |
| `sceneId`     | string         | 是   | 场景项目 ID                                               |
| `tick`        | number         | 建议  | 仿真节拍，从 0 递增                                           |
| `simTime`     | string         | 否   | 仿真逻辑时间（ISO 8601）                                      |
| `deviceState` | object         | 否   | 设备业务态，供 UI 展示，**不直接驱动物理运动**                           |
| `commands`    | SceneCommand[] | 是   | 本 tick 表达指令，见第四节                                      |


> **说明**：消息接收入口与指令调度**暂不支持**。平台目前只能在编辑器内手动操作，或在导出预览包中播放导出时的固定配置，尚不能响应后台实时推送。

### 2.2 批量表达消息（可选）

同一 tick 多设备可合并为一条：

```jsonc
{
  // 消息类型：同一 tick 多设备批量表达（可选，等效于多条 agent.expression）
  "type": "scene.batch",
  "payload": {
    "sceneId": "factory_line_01",  // 场景 ID
    "tick": 42,                    // 仿真节拍
    // 各设备表达数据数组，每项结构同 agent.expression 的 payload
    "expressions": [
      {
        "agentId": "agent_pump_01",   // 设备 Agent ID
        "deviceId": "P-01",           // 现实设备编号
        "objectId": "pump_01",        // 3D 模型 ID
        "commands": []                // 该设备的表达指令
      }
    ]
  }
}
```

### 2.3 设备绑定注册（场景加载时发一次）

```jsonc
{
  // 消息类型：设备绑定注册，场景加载时发一次
  "type": "agent.registry",
  "payload": {
    "sceneId": "factory_line_01",  // 场景 ID
    // 设备 Agent 与模型绑定列表
    "agents": [
      {
        "agentId": "agent_pump_01",  // Agent ID
        "deviceId": "P-01",          // 现实设备编号
        "objectId": "pump_01",       // 主 3D 模型 ID
        "deviceType": "pump"         // 设备类型，见第六节对照表
      }
    ],
    // 可选：一个 Agent 控制多个子模型（如阀门本体 + 阀杆）
    "objectGroups": [
      {
        "agentId": "agent_valve_03",
        "objectIds": ["valve_03", "valve_03_stem"]  // 关联模型 ID 列表
      }
    ]
  }
}
```


| 字段                    | 说明                     |
| --------------------- | ---------------------- |
| `agents[].agentId`    | Agent ID               |
| `agents[].deviceId`   | 现实设备编号                 |
| `agents[].objectId`   | 主模型 ID                 |
| `agents[].deviceType` | 设备类型，见第六节对照表           |
| `objectGroups`        | 可选，一个 Agent 控制多个子模型时使用 |


### 2.4 场景级表达消息（相机 / 环境等）

不绑定单一设备时使用 `scene.expression`，结构同 payload，但无 `agentId` / `deviceId` / `objectId`：

```jsonc
{
  // 消息类型：场景级表达（相机、环境等），不绑定单一设备
  "type": "scene.expression",
  "payload": {
    "sceneId": "factory_line_01",  // 场景 ID
    "tick": 42,                    // 仿真节拍
    // 场景级指令列表，无 agentId / deviceId / objectId
    "commands": []
  }
}
```

---

## 三、指令结构 `SceneCommand`

```typescript
interface SceneCommand {
  /** 指令唯一 ID，建议 {agentId}_cmd_{序号} */
  commandId: string;
  /** 动作名，决定改前台哪一类对象，见 4.1 节 */
  action: SceneAction;
  /** 操作目标，见第五节；action 与 target.kind 有固定搭配 */
  target: SceneTarget;
  /** 动作参数，见第七节 */
  params?: Record<string, unknown>;
  /** 过渡时长（秒），0 或不传=立即生效 */
  duration?: number;
  /** 缓动：linear | easeIn | easeOut | easeInOut */
  easing?: string;
  /** 与同条消息内其他指令并行执行 */
  parallel?: boolean;
}
```

---

## 四、`SceneAction` 与控制对象对照

### 4.1 总表：action → 控制的具体前台对象


| action                 | 控制对象      | `target.kind` | 改什么         | 状态       | 已有功能                                           | 待补齐                                                          |
| ---------------------- | --------- | ------------- | ----------- | -------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `setTransform`         | 3D 模型变换   | `mesh`        | 位置、旋转、缩放    | 部分支持     | 编辑器内手动拖拽/数值改位姿；导出包按导出时固定位姿加载                   | Agent 每 tick 驱动移动；点位间过渡（duration/easing）；世界/局部坐标切换；导出包运行时改位姿 |
| `setVisible`           | 3D 模型显隐   | `mesh`        | 显示/隐藏       | 部分支持     | 编辑器属性面板、场景树切换显隐                                | Agent 远程显隐；导出包运行时显隐                                          |
| `setMaterial`          | 3D 模型材质   | `material`    | 颜色、金属度、透明度等 | 部分支持     | 材质编辑器改 PBR 参数（颜色、金属度、粗糙度、自发光、透明度等）             | Agent 远程改材质；多材质槽按槽位指定；导出包运行时改色                               |
| `setMaterialState`     | 3D 模型业务外观 | `material`    | 语义状态→颜色映射   | 暂不支持     | —                                              | 状态枚举（运行/告警/故障等）到颜色的映射规则与执行                                   |
| `playTextureAnimation` | 3D 模型贴图   | `texture`     | UV 滚动       | 支持       | 编辑器配置 UV 偏移动画（启停、U/V 速度、作用贴图范围）；导出包自动播放；视口实时预览 | Agent 远程启停与调速（能力已有，差协议接入）                                    |
| `stopTextureAnimation` | 3D 模型贴图   | `texture`     | 停止 UV 滚动    | 支持       | 同上                                             | 同上                                                           |
| `setLight`             | 场景灯光      | `light`       | 开关、颜色、强度    | 部分支持     | 灯光管理（环境光/平行光/点光/聚光灯/半球光）；调开关、颜色、强度、位置、照射目标、阴影  | Agent 远程调灯；导出包运行时调灯                                          |
| `setEnvironment`       | 场景环境      | `environment` | 背景、雾、HDR、曝光 | 部分支持     | 全局环境设置（纯色背景、雾效、HDR 天空与环境反射、曝光、HDR 旋转）          | Agent 远程改环境；导出包运行时切换氛围                                       |
| `setCamera`            | 观察相机      | `camera`      | 位置、FOV、注视点  | 部分支持     | 全局相机设置（位置、注视点、FOV、裁剪面）；鼠标轨道交互                  | Agent 远程设相机；与漫游/飞行动画的冲突处理                                    |
| `focusObject`          | 观察相机      | `camera`      | 飞到模型并注视     | 暂不支持     | 漫游编辑时可「飞到指定坐标」预览                               | 按 `objectId` 自动算视角、距离并平滑飞入                                   |
| `playCameraTour`       | 相机漫游      | `cameraTour`  | 播放巡检路线      | 支持       | 编辑器编辑站点漫游/一镜到底路线并预览；导出包加载路线并可播放                | Agent 远程触发指定路线（能力已有，差协议接入）                                   |
| `stopCameraTour`       | 相机漫游      | `cameraTour`  | 停止漫游        | 支持       | 编辑器与导出包均可停止当前漫游                                | 同上                                                           |
| `setPostProcess`       | 全屏后期      | `postProcess` | Bloom、描边等   | 支持       | 后期面板（泛光、SSAO、暗角、胶片、故障等）配置与预览；导出包按配置应用          | Agent 运行时切换效果（能力已有，差协议接入）                                    |
| `setTrajectory`        | 3D 模型轨迹   | `mesh`        | 关键帧/历史路径    | 暂不支持     | —                                              | 关键帧路径插值播放、历史轨迹回放、倍速控制                                        |
| `showLabel`            | 3D 文字标签   | `label`       | 模型上方文字      | 暂不支持     | —                                              | 模型锚点上的文字标签（字号、颜色、偏移）                                         |
| `showInfoPanel`        | HTML 面板   | `panel`       | 数据卡片        | 暂不支持     | —                                              | 绑定模型的设备数据浮层面板（标题、字段列表、告警色）                                   |
| `highlight`            | 模型描边高亮    | `highlight`   | 单对象高亮       | 暂不支持     | 编辑器内「选中对象」高亮                                   | 按 `objectId` 远程描边/脉冲高亮（与选中无关）                                |
| `playAnimation`        | 骨骼动画      | `skeleton`    | GLB 动画播放    | 暂不支持     | 可导入并显示 GLB 静态模型                                | GLB 内骨骼动画的播放、循环、倍速                                           |
| `spawnEffect`          | 粒子特效      | —             | —           | 不支持（已移除） | —                                              | 粒子系统（后续单独立项）                                                 |


### 4.2 `target.kind` 枚举说明


| kind          | 前台实体    | 需提供的 ID 字段 | 适用 action                                 | 状态          |
| ------------- | ------- | ---------- | ----------------------------------------- | ----------- |
| `mesh`        | 3D 模型节点 | `objectId` | setTransform、setTrajectory、setVisible     | 部分支持 / 暂不支持 |
| `material`    | 模型材质    | `objectId` | setMaterial、setMaterialState              | 部分支持 / 暂不支持 |
| `texture`     | 模型贴图    | `objectId` | playTextureAnimation、stopTextureAnimation | 支持          |
| `skeleton`    | 骨骼动画    | `objectId` | playAnimation                             | 暂不支持        |
| `label`       | 3D 文字标签 | `objectId` | showLabel                                 | 暂不支持        |
| `panel`       | HTML 面板 | `objectId` | showInfoPanel                             | 暂不支持        |
| `highlight`   | 描边高亮    | `objectId` | highlight                                 | 暂不支持        |
| `light`       | 场景灯光    | `lightId`  | setLight                                  | 部分支持        |
| `environment` | 全局环境    | 无          | setEnvironment                            | 部分支持        |
| `camera`      | 观察相机    | 无          | setCamera、focusObject                     | 部分支持 / 暂不支持 |
| `cameraTour`  | 漫游路线    | `tourId`   | playCameraTour、stopCameraTour             | 支持          |
| `postProcess` | 后期管线    | 无          | setPostProcess                            | 支持          |


### 4.3 `SceneTarget` 结构

```typescript
interface SceneTarget {
  /** 目标类别，必须与 action 匹配，见 4.1 / 4.2 节 */
  kind: 'mesh' | 'material' | 'texture' | 'skeleton'
      | 'label' | 'panel' | 'highlight'
      | 'light' | 'environment' | 'camera' | 'cameraTour' | 'postProcess';
  /** 3D 模型 ID（kind=mesh/material/texture/skeleton/label/panel/highlight 时必填） */
  objectId?: string;
  /** 灯光 ID（kind=light 时必填） */
  lightId?: string;
  /** 漫游路线 ID（kind=cameraTour 时必填） */
  tourId?: string;
  /** 多材质模型时指定材质槽：数字=索引，字符串=材质名 */
  materialSlot?: number | string;
}
```

**action 与 target 搭配示例**

```jsonc
// 阀门旋转：控制 3D 模型变换（mesh）
{ "action": "setTransform",        "target": { "kind": "mesh",       "objectId": "valve_03" } }
// 泵运行状态色：控制模型材质（material）
{ "action": "setMaterialState",    "target": { "kind": "material",   "objectId": "pump_01" } }
// 传送带滚动：控制模型贴图（texture）
{ "action": "playTextureAnimation", "target": { "kind": "texture",   "objectId": "conveyor_belt" } }
// 传感器读数：控制 3D 文字标签（label）
{ "action": "showLabel",           "target": { "kind": "label",      "objectId": "sensor_01" } }
// 调灯光：控制场景灯光（light），用 lightId 不用 objectId
{ "action": "setLight",            "target": { "kind": "light",      "lightId": "light_main" } }
// 改背景雾效：控制全局环境（environment），无需 ID
{ "action": "setEnvironment",      "target": { "kind": "environment" } }
// 相机飞到设备：控制观察相机（camera）
{ "action": "focusObject",         "target": { "kind": "camera" } }
// 播放巡检路线：控制相机漫游（cameraTour），用 tourId
{ "action": "playCameraTour",      "target": { "kind": "cameraTour", "tourId": "tour_inspection" } }
```

---

## 五、轨迹数据（`setTransform` / `setTrajectory`）

移动类设备（AGV、机械臂等）需传位置随时间变化的数据，分三种模式：


| 模式   | `trajectoryMode` | 发什么            | 频率        |
| ---- | ---------------- | -------------- | --------- |
| 实时坐标 | `realtime`       | 当前时刻 **单个** 位姿 | 每 tick 一次 |
| 规划路径 | `keyframes`      | **多个** 未来关键帧   | 路径变更时一次   |
| 历史回放 | `history`        | **完整** 历史点序列   | 回放开始时一次   |


### 5.1 实时坐标（默认，用 `setTransform`）

```jsonc
{
  // 动作：设置 3D 模型空间变换
  "action": "setTransform",
  // 目标：3D 模型节点（mesh）
  "target": { "kind": "mesh", "objectId": "agv_01" },
  "params": {
    "trajectoryMode": "realtime",  // 实时单点模式，每 tick 发一次
    "position": { "x": 12.5, "y": 0, "z": -3.2 },  // 当前世界坐标（米）
    "rotation": { "x": 0, "y": 1.57, "z": 0 },     // 当前朝向，弧度（1.57≈90°）
    "space": "world"               // 世界坐标系（移动设备推荐）
  },
  "duration": 0.1  // 与下一 tick 的插值时间（秒），通常等于 tick 间隔
}
```


| 参数         | 说明                          |
| ---------- | --------------------------- |
| `position` | 当前世界坐标 `{x,y,z}`            |
| `rotation` | 当前朝向，弧度                     |
| `space`    | `world`（移动设备推荐）或 `local`    |
| `duration` | 与下一 tick 的插值时间，通常等于 tick 间隔 |


### 5.2 规划路径（用 `setTrajectory` + `keyframes`）

```jsonc
{
  // 动作：下发模型运动轨迹
  "action": "setTrajectory",
  "target": { "kind": "mesh", "objectId": "agv_01" },
  "params": {
    "trajectoryMode": "keyframes",  // 关键帧模式：一次下发未来路径
    "totalDuration": 30,          // 整条轨迹总时长（秒）
    "space": "world",
    // 路径关键点，至少 2 个；t=到达该点的相对时间（秒）
    "keyframes": [
      { "t": 0,  "position": { "x": 0,  "y": 0, "z": 0 } },   // 起点
      { "t": 10, "position": { "x": 10, "y": 0, "z": 0 } },   // 10 秒到达
      { "t": 30, "position": { "x": 0,  "y": 0, "z": 10 } }   // 30 秒到达终点
    ]
  }
}
```


| 参数                     | 说明           |
| ---------------------- | ------------ |
| `keyframes`            | 路径点数组，至少 2 个 |
| `keyframes[].t`        | 相对起点的到达时间（秒） |
| `keyframes[].position` | 该时刻位置        |
| `keyframes[].rotation` | 该时刻朝向（可选）    |
| `totalDuration`        | 总时长（秒）       |


### 5.3 历史回放（用 `setTrajectory` + `history`）

```jsonc
{
  "action": "setTrajectory",
  "target": { "kind": "mesh", "objectId": "agv_01" },
  "params": {
    "trajectoryMode": "history",   // 历史回放模式：一次下发完整历史
    "playbackSpeed": 1,            // 回放倍速，1=原速，2=两倍速
    // 历史采样点，按 simTime 时间轴回放
    "samples": [
      { "simTime": 0,   "position": { "x": 0, "y": 0, "z": 0 } },
      { "simTime": 1.0, "position": { "x": 2, "y": 0, "z": 0 } },
      { "simTime": 2.0, "position": { "x": 4, "y": 0, "z": 1 } }
    ]
  }
}
```


| 参数                   | 说明                |
| -------------------- | ----------------- |
| `samples`            | 历史轨迹点数组           |
| `samples[].simTime`  | 该点仿真时刻（秒或 ISO 时间） |
| `samples[].position` | 该时刻位置             |
| `playbackSpeed`      | 回放倍速，1=原速         |


**选用规则**


| 场景            | 用哪种                                    |
| ------------- | -------------------------------------- |
| 仿真正在运行，持续更新位置 | `realtime`，每 tick 一个点                  |
| 调度已算好未来路径     | `keyframes`，一次下发                       |
| 查看历史行驶记录      | `history`，一次下发                         |
| 阀门开度、门开关      | `setTransform` 旋转/位移 + `duration`，不用轨迹 |


---

## 六、`deviceType` 与推荐 action

> 仅推荐「支持」「部分支持」的 action；标「暂不支持」的请勿下发。


| deviceType | 设备示例    | 推荐 action                                                          | 支持情况             |
| ---------- | ------- | ------------------------------------------------------------------ | ---------------- |
| `pump`     | 泵、风机、电机 | `setMaterial`（部分支持）、`setMaterialState`（暂不支持）、`showInfoPanel`（暂不支持） | 变色请用 setMaterial |
| `valve`    | 阀门、风门   | `setTransform`（部分支持）、`setMaterial`（部分支持）、`showLabel`（暂不支持）         | 开度→旋转            |
| `tank`     | 储罐、料仓   | `setMaterial`（部分支持）、`setTransform`（部分支持）、`showInfoPanel`（暂不支持）     | 液位可用 scale.y     |
| `conveyor` | 传送带     | `playTextureAnimation`（支持）、`setMaterial`（部分支持）                     | 带速→speedU        |
| `robot`    | 机械臂     | `setTransform`（部分支持）、`setTrajectory`（暂不支持）、`playAnimation`（暂不支持）   |                  |
| `agv`      | AGV、小车  | `setTransform`（部分支持）、`setTrajectory`（暂不支持）                         | 实时坐标每 tick 发     |
| `door`     | 闸门、卷帘门  | `setTransform`（部分支持）、`playAnimation`（暂不支持）                         | 位移/旋转            |
| `pipeline` | 管道      | `playTextureAnimation`（支持）、`setMaterial`（部分支持）                     | 流体→贴图滚动          |
| `sensor`   | 传感器     | `showLabel`（暂不支持）、`showInfoPanel`（暂不支持）、`highlight`（暂不支持）          | 暂勿下发             |
| `generic`  | 通用设备    | `setMaterial`（部分支持）、`setVisible`（部分支持）                             |                  |


---

## 七、各 action 的 `params` 定义

### 7.1 `setTransform`（部分支持）— 控制对象：`mesh`

**已有**：编辑器 Gizmo 拖拽、属性面板数值输入改位置/旋转/缩放；导出包加载导出时的固定位姿。  
**未有**：Agent 每 tick 更新位姿；`duration`/`easing` 过渡动画；`space` 世界/局部坐标；导出包运行时移动。


| 参数               | 类型                | 说明          |
| ---------------- | ----------------- | ----------- |
| `trajectoryMode` | `"realtime"`      | 标记为实时单点（可选） |
| `position`       | `{x,y,z}`         | 位置坐标        |
| `rotation`       | `{x,y,z}`         | 旋转角度（弧度）    |
| `scale`          | `{x,y,z}`         | 缩放比例        |
| `space`          | `local` | `world` | 坐标系         |


### 7.2 `setTrajectory`（暂不支持）— 控制对象：`mesh`

**未有**：关键帧路径自动插值移动、历史轨迹按时间轴回放、回放倍速。移动类设备目前只能用 `setTransform` + `realtime` 逐点发（但该模式本身也尚未接入 Agent）。

见第五节。`trajectoryMode` 为 `keyframes` 或 `history`。

### 7.3 `setVisible`（部分支持）— 控制对象：`mesh`

**已有**：编辑器属性面板、场景树眼睛图标切换显示/隐藏。  
**未有**：Agent 远程显隐；导出包运行时显隐。


| 参数        | 类型      | 说明                   |
| --------- | ------- | -------------------- |
| `visible` | boolean | `true` 显示，`false` 隐藏 |


### 7.4 `setMaterial`（部分支持）— 控制对象：`material`

**已有**：材质编辑器修改 PBR 外观（颜色、金属度、粗糙度、自发光、透明度等）。  
**未有**：Agent 远程改色；`materialSlot` 多材质槽精确指定；导出包运行时动态改材质。


| 参数                  | 类型      | 范围        | 说明     |
| ------------------- | ------- | --------- | ------ |
| `color`             | string  | `#RRGGBB` | 表面颜色   |
| `opacity`           | number  | 0~1       | 不透明度   |
| `transparent`       | boolean | —         | 是否透明混合 |
| `metalness`         | number  | 0~1       | 金属度    |
| `roughness`         | number  | 0~1       | 粗糙度    |
| `emissive`          | string  | `#RRGGBB` | 自发光颜色  |
| `emissiveIntensity` | number  | ≥0        | 自发光强度  |


### 7.5 `setMaterialState`（暂不支持）— 控制对象：`material`

**未有**：将业务语义（运行/告警/故障等）自动映射为统一外观的规则与执行。  

> 当前请用 `setMaterial` 直接传颜色；本 action 待映射能力实现后再下发。


| 参数         | 类型     | 说明                                                                    |
| ---------- | ------ | --------------------------------------------------------------------- |
| `state`    | string | `normal` `running` `warning` `error` `offline` `maintenance` `custom` |
| `override` | object | `state=custom` 时覆盖材质参数，结构同 setMaterial                                |



| state 值       | 含义  | 前台默认表现  |
| ------------- | --- | ------- |
| `normal`      | 正常  | 默认材质色   |
| `running`     | 运行中 | 绿色或微蓝发光 |
| `warning`     | 预警  | 黄色      |
| `error`       | 故障  | 红色发光    |
| `offline`     | 离线  | 灰色半透明   |
| `maintenance` | 维护  | 橙色      |


### 7.6 `playTextureAnimation`（支持）— 控制对象：`texture`

**已有**：属性面板「贴图动画」配置启停、U/V 速度、作用范围（漫反射或全部贴图）；视口实时预览；导出包按配置自动滚动。  
**待补齐**：Agent 远程启停与调速（功能完整，差协议接入）。


| 参数        | 类型            | 说明           |
| --------- | ------------- | ------------ |
| `speedU`  | number        | U 方向每秒偏移量    |
| `speedV`  | number        | V 方向每秒偏移量    |
| `target`  | `map` | `all` | 作用贴图范围       |
| `enabled` | boolean       | 是否启用，默认 true |


### 7.7 `stopTextureAnimation`（支持）— 控制对象：`texture`

**已有**：编辑器关闭贴图动画开关即停止；导出包识别 `enabled: false` 停止滚动。  
**待补齐**：Agent 远程停止（差协议接入）。

无 params，或：

```jsonc
{ "enabled": false }  // 停止贴图 UV 滚动
```

### 7.8 `playAnimation`（暂不支持）— 控制对象：`skeleton`

**已有**：可导入 GLB 模型并静态展示。  
**未有**：播放模型内嵌骨骼动画（片段名、循环、倍速）。


| 参数          | 类型      | 说明         |
| ----------- | ------- | ---------- |
| `clipName`  | string  | GLB 内动画片段名 |
| `loop`      | boolean | 是否循环       |
| `timeScale` | number  | 播放倍速       |
| `weight`    | number  | 混合权重 0~1   |


### 7.9 `showLabel`（暂不支持）— 控制对象：`label`

**未有**：在模型上方或旁侧显示可更新的文字标签（内容、字号、颜色、偏移）。


| 参数                      | 类型        | 说明       |
| ----------------------- | --------- | -------- |
| `text`                  | string    | 显示文字     |
| `visible`               | boolean   | 是否显示     |
| `offset`                | `{x,y,z}` | 相对模型锚点偏移 |
| `style.fontSize`        | number    | 字号       |
| `style.color`           | string    | 文字颜色     |
| `style.backgroundColor` | string    | 背景色      |


### 7.10 `showInfoPanel`（暂不支持）— 控制对象：`panel`

**未有**：点击或绑定模型后弹出设备数据卡片（标题、字段、单位、告警色）。`deviceState` 目前无对应 UI 展示层。


| 参数                | 类型              | 说明                                 |
| ----------------- | --------------- | ---------------------------------- |
| `visible`         | boolean         | 显示/关闭                              |
| `title`           | string          | 面板标题                               |
| `fields`          | array           | 数据字段列表                             |
| `fields[].key`    | string          | 字段键                                |
| `fields[].label`  | string          | 显示名                                |
| `fields[].value`  | string | number | 当前值                                |
| `fields[].unit`   | string          | 单位                                 |
| `fields[].status` | string          | `normal` `warning` `error`         |
| `position`        | string          | `left` `right` `bottom` `floating` |


### 7.11 `highlight`（暂不支持）— 控制对象：`highlight`

**已有**：编辑器中选中对象时的默认高亮（仅编辑态）。  
**未有**：按 `objectId` 远程开启描边/脉冲高亮，且不影响其他对象。


| 参数             | 类型      | 说明     |
| -------------- | ------- | ------ |
| `enabled`      | boolean | 开/关    |
| `color`        | string  | 高亮颜色   |
| `pulse`        | boolean | 是否脉冲闪烁 |
| `outlineWidth` | number  | 描边宽度   |


### 7.12 `setLight`（部分支持）— 控制对象：`light`

**已有**：灯光面板管理环境光/平行光/点光/聚光灯/半球光；调开关、颜色、强度、位置、照射目标、阴影。  
**未有**：Agent 远程调灯；导出包运行时改灯光参数。


| 参数           | 类型        | 说明           |
| ------------ | --------- | ------------ |
| `enabled`    | boolean   | 开关           |
| `color`      | string    | 光色 `#RRGGBB` |
| `intensity`  | number    | 强度           |
| `position`   | `{x,y,z}` | 灯光位置         |
| `target`     | `{x,y,z}` | 照射目标点        |
| `angle`      | number    | 聚光灯角度（弧度）    |
| `penumbra`   | number    | 边缘柔和度 0~1    |
| `distance`   | number    | 光照距离         |
| `castShadow` | boolean   | 是否投影         |


### 7.13 `setEnvironment`（部分支持）— 控制对象：`environment`

**已有**：全局环境页设置纯色背景、雾效、HDR 天空/环境反射、曝光、HDR 旋转角度。  
**未有**：Agent 远程切换天气/氛围；导出包运行时动态改环境。


| 参数                      | 类型      | 说明         |
| ----------------------- | ------- | ---------- |
| `backgroundColor`       | string  | 背景色        |
| `fog.enabled`           | boolean | 是否起雾       |
| `fog.color`             | string  | 雾颜色        |
| `fog.near`              | number  | 雾开始距离      |
| `fog.far`               | number  | 雾结束距离      |
| `environment.intensity` | number  | HDR 环境反射强度 |
| `environment.rotationY` | number  | 环境旋转（弧度）   |
| `exposure`              | number  | 曝光         |


### 7.14 `setCamera`（部分支持）— 控制对象：`camera`

**已有**：全局相机页设置位置、注视点、FOV、近远裁剪面；鼠标轨道旋转/缩放场景。  
**未有**：Agent 远程设相机；与正在进行的漫游/飞行动画协调。


| 参数         | 类型        | 说明      |
| ---------- | --------- | ------- |
| `position` | `{x,y,z}` | 相机位置    |
| `target`   | `{x,y,z}` | 注视点     |
| `fov`      | number    | 视野角度（度） |
| `near`     | number    | 近裁剪面    |
| `far`      | number    | 远裁剪面    |


### 7.15 `focusObject`（暂不支持）— 控制对象：`camera`

**已有**：相机漫游编辑时，可手动飞到某一组坐标做预览。  
**未有**：传入 `objectId` 后自动计算合适距离与视角并平滑飞入。


| 参数         | 类型        | 说明        |
| ---------- | --------- | --------- |
| `objectId` | string    | 要聚焦的模型 ID |
| `distance` | number    | 与模型距离     |
| `offset`   | `{x,y,z}` | 相机偏移      |
| `duration` | number    | 飞入动画时长（秒） |


### 7.16 `playCameraTour`（支持）— 控制对象：`cameraTour`

**已有**：编辑器创建/编辑漫游路线（站点逐站停留、一镜到底样条）；视口预览播放；导出包加载路线并播放。  
**待补齐**：Agent 远程指定 `tourId` 触发播放（差协议接入）。


| 参数               | 类型      | 说明                                       |
| ---------------- | ------- | ---------------------------------------- |
| `tourId`         | string  | 路线 ID，对应 scene.json 中 `cameraTours[].id` |
| `loop`           | boolean | 是否循环                                     |
| `startStopIndex` | number  | 从第几站开始，默认 0                              |


### 7.17 `stopCameraTour`（支持）— 控制对象：`cameraTour`

**已有**：编辑器与导出包均可停止当前漫游。  
**待补齐**：Agent 远程停止（差协议接入）。


| 参数       | 类型     | 说明            |
| -------- | ------ | ------------- |
| `tourId` | string | 要停止的路线，省略则停当前 |


### 7.18 `setPostProcess`（支持）— 控制对象：`postProcess`

**已有**：后期面板选择效果（泛光、SSAO、暗角、胶片颗粒、景深、故障等）并调参；导出包按导出配置应用全屏后期。  
**待补齐**：Agent 运行时切换效果与参数（差协议接入）。


| 参数        | 类型      | 说明                                             |
| --------- | ------- | ---------------------------------------------- |
| `enabled` | boolean | 是否启用                                           |
| `effect`  | string  | `none` `bloom` `vignette` `glitch` `outline` 等 |
| `params`  | object  | 效果专属参数，如 `params.bloom.intensity`              |


---

## 八、完整示例

以下示例均来自场景 `factory_line_01`（工厂产线）。每个设备 Agent 独立向前台推送一条 `agent.expression`；场景级操作（如相机聚焦）用 `scene.expression`。

### 8.0 示例总览：Agent → 设备 → 模型 → 指令


| 示例  | Agent               | 现实设备     | objectId        | deviceType | 下发指令                            | 状态          |
| --- | ------------------- | -------- | --------------- | ---------- | ------------------------------- | ----------- |
| 8.1 | `agent_pump_01`     | `P-01`   | `pump_01`       | pump       | `setMaterial`                   | 部分支持        |
| 8.2 | `agent_valve_03`    | `V-03`   | `valve_03`      | valve      | `setTransform` + `showLabel`    | 部分支持 + 暂不支持 |
| 8.3 | `agent_conveyor_01` | `CV-01`  | `conveyor_belt` | conveyor   | `playTextureAnimation`          | 支持          |
| 8.4 | `agent_tank_02`     | `T-02`   | `tank_02`       | tank       | `setMaterial` + `showInfoPanel` | 部分支持 + 暂不支持 |
| 8.5 | `agent_agv_01`      | `AGV-01` | `agv_01`        | agv        | `setTransform`                  | 部分支持        |
| 8.6 | 场景服务                | —        | —               | —          | `focusObject`                   | 暂不支持        |


**对应关系示意**

```
现实设备          后台 Agent              前台 3D 模型           下发的指令
────────          ──────────              ────────────           ──────────
P-01 离心泵  →  agent_pump_01      →  pump_01（泵模型）   →  改材质状态色
V-03 调节阀  →  agent_valve_03     →  valve_03（阀模型）  →  旋转阀杆 + 显示标签
CV-01 传送带 →  agent_conveyor_01  →  conveyor_belt       →  贴图滚动
T-02 储罐    →  agent_tank_02      →  tank_02（罐模型）   →  告警变色 + 弹面板
AGV-01 小车  →  agent_agv_01       →  agv_01（车模型）    →  实时位移
（场景级）   →  scene.expression   →  camera（相机）      →  聚焦到 tank_02
```

---

### 8.1 泵：运行状态 → 改材质颜色

**谁发给谁**


| 项目       | 值                      |
| -------- | ---------------------- |
| 后台 Agent | `agent_pump_01`        |
| 现实设备     | 1# 离心泵，编号 `P-01`       |
| 前台模型     | `pump_01`（场景中的泵 3D 模型） |
| 设备类型     | `pump`                 |


**下发什么、控制什么**


| 指令                                      | 控制对象                                 | 前台效果                       |
| --------------------------------------- | ------------------------------------ | -------------------------- |
| `setMaterialState` → `state: "running"` | `pump_01` 的 **材质**（`kind: material`） | 泵模型外观变为「运行中」状态色（默认绿色或微蓝发光） |


**业务背景**：泵 Agent 读到 `rpm: 1450`，判断设备在运行，于是下发一条改材质状态的指令；`deviceState` 里的转速供面板展示，不直接改模型。

```jsonc
{
  "type": "agent.expression",
  "payload": {
    "agentId": "agent_pump_01",      // 泵 Agent
    "deviceId": "P-01",              // 现实：1# 离心泵
    "objectId": "pump_01",           // 前台：泵 3D 模型
    "sceneId": "factory_line_01",
    "tick": 42,
    "deviceState": { "rpm": 1450, "status": "running" },  // 业务数据，供 UI 展示
    "commands": [
      {
        "commandId": "agent_pump_01_cmd_1",
        "action": "setMaterialState",             // 指令：改业务外观状态
        "target": { "kind": "material", "objectId": "pump_01" },  // 控制：泵模型的材质
        "params": { "state": "running" }          // 运行中
      }
    ]
  }
}
```

---

### 8.2 阀门：开度 75% → 旋转阀杆 + 显示标签

**谁发给谁**


| 项目       | 值                        |
| -------- | ------------------------ |
| 后台 Agent | `agent_valve_03`         |
| 现实设备     | 3# 调节阀，编号 `V-03`         |
| 前台模型     | `valve_03`（场景中的阀门 3D 模型） |
| 设备类型     | `valve`                  |


**下发什么、控制什么**


| 指令                                | 控制对象                                 | 前台效果                     |
| --------------------------------- | ------------------------------------ | ------------------------ |
| `setTransform` → 旋转 Y 轴 1.178 rad | `valve_03` 的 **3D 模型**（`kind: mesh`） | 阀杆在 0.8 秒内旋转到 75% 开度对应角度 |
| `showLabel` → `"开度 75%"`          | `valve_03` 的 **文字标签**（`kind: label`） | 阀门上方显示「开度 75%」浮动文字       |


**业务背景**：阀门 Agent 内部 `openPercent: 75`，自行换算为旋转角度，同时显示开度标签。两条指令 `parallel: true` 并行执行。

```jsonc
{
  // 以下为 payload.commands 部分；外层 agentId/deviceId/objectId 同 8.1 结构
  "agentId": "agent_valve_03",
  "deviceId": "V-03",
  "objectId": "valve_03",
  "commands": [
    {
      "commandId": "agent_valve_03_cmd_1",
      "action": "setTransform",                              // 指令：旋转模型
      "target": { "kind": "mesh", "objectId": "valve_03" },  // 控制：阀门 3D 模型
      "params": {
        "rotation": { "x": 0, "y": 1.178, "z": 0 },        // 75% 开度 ≈ 67.5°
        "space": "local"
      },
      "duration": 0.8,
      "easing": "easeInOut"
    },
    {
      "commandId": "agent_valve_03_cmd_2",
      "action": "showLabel",                                 // 指令：显示标签
      "target": { "kind": "label", "objectId": "valve_03" }, // 控制：阀门头顶文字
      "params": { "text": "开度 75%", "visible": true },
      "parallel": true
    }
  ]
}
```

---

### 8.3 传送带：带速 0.25 → 贴图滚动

**谁发给谁**


| 项目       | 值                              |
| -------- | ------------------------------ |
| 后台 Agent | `agent_conveyor_01`            |
| 现实设备     | 1# 传送带，编号 `CV-01`              |
| 前台模型     | `conveyor_belt`（场景中的传送带 3D 模型） |
| 设备类型     | `conveyor`                     |


**下发什么、控制什么**


| 指令                                      | 控制对象                                      | 前台效果                   |
| --------------------------------------- | ----------------------------------------- | ---------------------- |
| `playTextureAnimation` → `speedU: 0.25` | `conveyor_belt` 的 **贴图**（`kind: texture`） | 皮带表面贴图沿 U 方向滚动，视觉上皮带在动 |


**业务背景**：传送带 Agent 将 `beltSpeed: 0.25` 直接映射为贴图滚动速度，不需要移动模型本身。

```jsonc
{
  "agentId": "agent_conveyor_01",
  "deviceId": "CV-01",
  "objectId": "conveyor_belt",
  "commands": [
    {
      "action": "playTextureAnimation",
      "target": { "kind": "texture", "objectId": "conveyor_belt" },  // 控制：传送带贴图
      "params": { "speedU": 0.25 }   // 滚动速度 ∝ 带速
    }
  ]
}
```

---

### 8.4 储罐：液位/温度告警 → 变黄 + 弹面板

**谁发给谁**


| 项目       | 值                       |
| -------- | ----------------------- |
| 后台 Agent | `agent_tank_02`         |
| 现实设备     | 2# 储罐，编号 `T-02`         |
| 前台模型     | `tank_02`（场景中的储罐 3D 模型） |
| 设备类型     | `tank`                  |


**下发什么、控制什么**


| 指令                                      | 控制对象                                   | 前台效果                 |
| --------------------------------------- | -------------------------------------- | -------------------- |
| `setMaterialState` → `state: "warning"` | `tank_02` 的 **材质**（`kind: material`）   | 储罐模型外观变为预警黄色         |
| `showInfoPanel` → 液位 92%、温度 85°C        | `tank_02` 的 **HTML 面板**（`kind: panel`） | 屏幕弹出数据卡片，显示液位和温度及告警色 |


**业务背景**：储罐 Agent 检测到 `level: 92`、`temperature: 85` 超阈值，同时改模型颜色并弹出详情面板。

```jsonc
{
  "agentId": "agent_tank_02",
  "deviceId": "T-02",
  "objectId": "tank_02",
  "deviceState": { "level": 92, "temperature": 85, "status": "warning" },
  "commands": [
    {
      "action": "setMaterialState",
      "target": { "kind": "material", "objectId": "tank_02" },  // 控制：储罐材质 → 变黄
      "params": { "state": "warning" }
    },
    {
      "action": "showInfoPanel",
      "target": { "kind": "panel", "objectId": "tank_02" },     // 控制：储罐数据面板
      "params": {
        "visible": true,
        "title": "储罐 T-02",
        "fields": [
          { "key": "level", "label": "液位", "value": 92, "unit": "%", "status": "warning" },
          { "key": "temp",  "label": "温度", "value": 85, "unit": "°C", "status": "error" }
        ]
      },
      "parallel": true
    }
  ]
}
```

---

### 8.5 AGV：实时定位 → 模型移动到当前坐标

**谁发给谁**


| 项目       | 值                        |
| -------- | ------------------------ |
| 后台 Agent | `agent_agv_01`           |
| 现实设备     | 1# AGV 小车，编号 `AGV-01`    |
| 前台模型     | `agv_01`（场景中的 AGV 3D 模型） |
| 设备类型     | `agv`                    |


**下发什么、控制什么**


| 指令                         | 控制对象                               | 前台效果                                                 |
| -------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `setTransform` → 实时坐标 + 朝向 | `agv_01` 的 **3D 模型**（`kind: mesh`） | AGV 模型在 0.1 秒内插值移动到 `(12.5, 0, -3.2)`，车头朝 Y=1.57 rad |


**业务背景**：仿真正在运行时，AGV Agent **每个 tick 发一个当前坐标**（`trajectoryMode: realtime`），不传历史路径。`duration` 填 tick 间隔避免模型跳动。

```jsonc
{
  "agentId": "agent_agv_01",
  "deviceId": "AGV-01",
  "objectId": "agv_01",
  "commands": [
    {
      "action": "setTransform",
      "target": { "kind": "mesh", "objectId": "agv_01" },  // 控制：AGV 3D 模型位置
      "params": {
        "trajectoryMode": "realtime",
        "position": { "x": 12.5, "y": 0, "z": -3.2 },
        "rotation": { "x": 0, "y": 1.57, "z": 0 },
        "space": "world"
      },
      "duration": 0.1
    }
  ]
}
```

---

### 8.6 场景级：储罐告警后 → 相机自动聚焦

**谁发给谁**


| 项目   | 值                                         |
| ---- | ----------------------------------------- |
| 发送方  | 场景服务（非设备 Agent），消息类型 `scene.expression`   |
| 关联设备 | 储罐 `T-02` / 模型 `tank_02`（仅作为聚焦目标，不由本消息控制） |
| 控制对象 | 前台 **观察相机**（`kind: camera`）               |


**下发什么、控制什么**


| 指令                           | 控制对象                     | 前台效果                     |
| ---------------------------- | ------------------------ | ------------------------ |
| `focusObject` → 聚焦 `tank_02` | **观察相机**（`kind: camera`） | 相机在 2 秒内飞到储罐旁 8 米处并注视该模型 |


**业务背景**：储罐告警（8.4）后，场景服务自动把镜头切到告警设备，方便用户查看。此消息 **不含 agentId**，不修改储罐模型本身。

```jsonc
{
  "type": "scene.expression",   // 场景级，非 agent.expression
  "payload": {
    "sceneId": "factory_line_01",
    "tick": 42,
    "commands": [
      {
        "action": "focusObject",
        "target": { "kind": "camera" },     // 控制：观察相机（不是储罐模型）
        "params": {
          "objectId": "tank_02",  // 注视目标：储罐模型 ID
          "distance": 8,
          "duration": 2
        }
      }
    ]
  }
}
```

---

### 8.7 同一 tick 多设备并行下发（组合说明）

tick=42 时，产线上 4 台设备 Agent **各自独立发一条消息**，前台同时收到并执行：

```
tick 42 时刻
├── agent_pump_01      → pump_01      → setMaterialState(running)     泵变运行色
├── agent_valve_03     → valve_03     → setTransform + showLabel      阀旋转+标签
├── agent_conveyor_01  → conveyor_belt → playTextureAnimation          皮带滚动
├── agent_tank_02      → tank_02      → setMaterialState + showInfoPanel  罐告警
└── scene.expression   → camera       → focusObject(tank_02)          镜头切到储罐
```

也可通过 `scene.batch` 合并为一条消息（见 2.2 节），前台拆包后效果相同。

---

## 九、后台发送数据速查表

### 9.1 Agent / 设备 / 模型 ID 对应表


| agentId             | deviceId | objectId        | deviceType | 备注      |
| ------------------- | -------- | --------------- | ---------- | ------- |
| `agent_pump_01`     | `P-01`   | `pump_01`       | pump       | 1# 离心泵  |
| `agent_valve_03`    | `V-03`   | `valve_03`      | valve      | 3# 调节阀  |
| `agent_tank_02`     | `T-02`   | `tank_02`       | tank       | 2# 储罐   |
| `agent_conveyor_01` | `CV-01`  | `conveyor_belt` | conveyor   | 1# 传送带  |
| `agent_agv_01`      | `AGV-01` | `agv_01`        | agv        | 1# AGV  |
| *待填写*               | *待填写*    | *待填写*           | *待填写*      | 新增设备追加行 |



| 字段         | 类型     | 备注                                                |
| ---------- | ------ | ------------------------------------------------- |
| `agentId`  | string | 后台 Agent ID，建议 `agent_{类型}_{序号}`                  |
| `deviceId` | string | 现实设备编号，与 PLC/MES 台账一致                             |
| `objectId` | string | 前台模型 ID，与 `scene.json` → `editor.objects[].id` 一致 |
| `sceneId`  | string | 场景 ID                                             |
| `lightId`  | string | 灯光 ID，对应 `editor.lights[].id`                     |
| `tourId`   | string | 漫游路线 ID，对应 `cameraTours[].id`                     |


---

### 9.2 消息 payload 字段


| 字段            | 类型     | 必填  | 备注                 |
| ------------- | ------ | --- | ------------------ |
| `agentId`     | string | 是   | 设备 Agent ID        |
| `deviceId`    | string | 是   | 现实设备编号             |
| `objectId`    | string | 是   | 绑定的 3D 模型 ID       |
| `sceneId`     | string | 是   | 场景 ID              |
| `tick`        | number | 建议  | 仿真节拍，递增            |
| `simTime`     | string | 否   | 仿真逻辑时间（ISO 8601）   |
| `deviceState` | object | 否   | 业务数据，供 UI 展示，不驱动运动 |
| `commands`    | array  | 是   | 表达指令列表             |



| 消息 type            | 必填 payload                         | 备注            |
| ------------------ | ---------------------------------- | ------------- |
| `agent.registry`   | `sceneId`, `agents[]`              | 场景加载后发一次      |
| `agent.expression` | 上表全部（设备级）                          | 每 tick 每设备一条  |
| `scene.batch`      | `sceneId`, `tick`, `expressions[]` | 多设备合并（可选）     |
| `scene.expression` | `sceneId`, `commands`              | 场景级，无 agentId |


---

### 9.3 SceneCommand 字段


| 字段          | 类型      | 必填       | 备注                                      |
| ----------- | ------- | -------- | --------------------------------------- |
| `commandId` | string  | 是        | 指令唯一 ID                                 |
| `action`    | string  | 是        | 方法名，见 9.4                               |
| `target`    | object  | 是        | 操作目标，含 `kind`、ID                        |
| `params`    | object  | 视 action | 方法参数，见 9.4                              |
| `duration`  | number  | 否        | 过渡时长（秒）                                 |
| `easing`    | string  | 否        | `linear` `easeIn` `easeOut` `easeInOut` |
| `parallel`  | boolean | 否        | 与同条消息内其他指令并行                            |



| target 字段      | 类型              | 必填     | 备注           |
| -------------- | --------------- | ------ | ------------ |
| `kind`         | string          | 是      | 控制对象类型，见 9.4 |
| `objectId`     | string          | 视 kind | 模型 ID        |
| `lightId`      | string          | 视 kind | 灯光 ID        |
| `tourId`       | string          | 视 kind | 漫游路线 ID      |
| `materialSlot` | number | string | 否      | 多材质槽位        |


---

### 9.4 action 方法及 params


| action                 | 状态   | target.kind   | 参数                  | 类型        | 必填          | 备注                                 |
| ---------------------- | ---- | ------------- | ------------------- | --------- | ----------- | ---------------------------------- |
| `setTransform`         | 部分支持 | `mesh`        | `position`          | `{x,y,z}` | 否           | 位置                                 |
|                        |      |               | `rotation`          | `{x,y,z}` | 否           | 旋转（弧度）                             |
|                        |      |               | `scale`             | `{x,y,z}` | 否           | 缩放                                 |
|                        |      |               | `space`             | string    | 否           | `local` `world`                    |
|                        |      |               | `trajectoryMode`    | string    | 否           | 实时点填 `realtime`                    |
| `setTrajectory`        | 暂不支持 | `mesh`        | `trajectoryMode`    | string    | 是           | `keyframes` `history`              |
|                        |      |               | `keyframes`         | array     | keyframes 时 | `{t, position, rotation?}`         |
|                        |      |               | `samples`           | array     | history 时   | `{simTime, position, rotation?}`   |
|                        |      |               | `totalDuration`     | number    | 否           | 总时长（秒）                             |
|                        |      |               | `playbackSpeed`     | number    | 否           | 回放倍速                               |
|                        |      |               | `space`             | string    | 否           | `local` `world`                    |
| `setVisible`           | 部分支持 | `mesh`        | `visible`           | boolean   | 是           | 显隐                                 |
| `setMaterial`          | 部分支持 | `material`    | `color`             | string    | 否           | `#RRGGBB`                          |
|                        |      |               | `opacity`           | number    | 否           | 0~1                                |
|                        |      |               | `metalness`         | number    | 否           | 0~1                                |
|                        |      |               | `roughness`         | number    | 否           | 0~1                                |
|                        |      |               | `emissive`          | string    | 否           | 自发光色                               |
|                        |      |               | `emissiveIntensity` | number    | 否           | 自发光强度                              |
| `setMaterialState`     | 暂不支持 | `material`    | `state`             | string    | 是           | 见 9.5；暂用 setMaterial               |
|                        |      |               | `override`          | object    | 否           | `state=custom` 时覆盖材质               |
| `playTextureAnimation` | 支持   | `texture`     | `speedU`            | number    | 否           | U 方向速度                             |
|                        |      |               | `speedV`            | number    | 否           | V 方向速度                             |
|                        |      |               | `target`            | string    | 否           | `map` `all`                        |
| `stopTextureAnimation` | 支持   | `texture`     | `enabled`           | boolean   | 否           | 填 false                            |
| `playAnimation`        | 暂不支持 | `skeleton`    | `clipName`          | string    | 是           | 暂勿下发                               |
|                        |      |               | `loop`              | boolean   | 否           | 循环                                 |
|                        |      |               | `timeScale`         | number    | 否           | 播放倍速                               |
| `showLabel`            | 暂不支持 | `label`       | `text`              | string    | 是           | 暂勿下发                               |
|                        |      |               | `visible`           | boolean   | 否           | 是否显示                               |
|                        |      |               | `offset`            | `{x,y,z}` | 否           | 相对偏移                               |
| `showInfoPanel`        | 暂不支持 | `panel`       | `visible`           | boolean   | 是           | 暂勿下发                               |
|                        |      |               | `title`             | string    | 否           | 标题                                 |
|                        |      |               | `fields`            | array     | 否           | `{key,label,value,unit?,status?}`  |
|                        |      |               | `position`          | string    | 否           | `left` `right` `bottom` `floating` |
| `highlight`            | 暂不支持 | `highlight`   | `enabled`           | boolean   | 是           | 暂勿下发                               |
|                        |      |               | `color`             | string    | 否           | 高亮色                                |
|                        |      |               | `pulse`             | boolean   | 否           | 脉冲闪烁                               |
| `setLight`             | 部分支持 | `light`       | `enabled`           | boolean   | 否           | 开关                                 |
|                        |      |               | `color`             | string    | 否           | 光色                                 |
|                        |      |               | `intensity`         | number    | 否           | 强度                                 |
|                        |      |               | `position`          | `{x,y,z}` | 否           | 位置                                 |
|                        |      |               | `target`            | `{x,y,z}` | 否           | 照射目标                               |
| `setEnvironment`       | 部分支持 | `environment` | `backgroundColor`   | string    | 否           | 背景色                                |
|                        |      |               | `fog`               | object    | 否           | `{enabled,color,near,far}`         |
|                        |      |               | `environment`       | object    | 否           | `{intensity,rotationY}`            |
|                        |      |               | `exposure`          | number    | 否           | 曝光                                 |
| `setCamera`            | 部分支持 | `camera`      | `position`          | `{x,y,z}` | 否           | 相机位置                               |
|                        |      |               | `target`            | `{x,y,z}` | 否           | 注视点                                |
|                        |      |               | `fov`               | number    | 否           | 视野（度）                              |
| `focusObject`          | 暂不支持 | `camera`      | `objectId`          | string    | 是           | 暂勿下发                               |
|                        |      |               | `distance`          | number    | 否           | 距离                                 |
|                        |      |               | `duration`          | number    | 否           | 飞入时长（秒）                            |
| `playCameraTour`       | 支持   | `cameraTour`  | `tourId`            | string    | 是           | 路线 ID                              |
|                        |      |               | `loop`              | boolean   | 否           | 循环                                 |
| `stopCameraTour`       | 支持   | `cameraTour`  | `tourId`            | string    | 否           | 省略则停当前                             |
| `setPostProcess`       | 支持   | `postProcess` | `enabled`           | boolean   | 是           | 开关                                 |
|                        |      |               | `effect`            | string    | 否           | `bloom` `vignette` `glitch` 等      |
|                        |      |               | `params`            | object    | 否           | 效果参数                               |


---

### 9.5 枚举值

**setMaterialState → state**


| 值             | 备注              |
| ------------- | --------------- |
| `normal`      | 正常              |
| `running`     | 运行中             |
| `warning`     | 预警              |
| `error`       | 故障              |
| `offline`     | 离线              |
| `maintenance` | 维护              |
| `custom`      | 自定义，配合 override |


**setTrajectory → trajectoryMode**


| 值           | 备注                        |
| ----------- | ------------------------- |
| `realtime`  | 每 tick 一个点，用 setTransform |
| `keyframes` | 一次发未来路径                   |
| `history`   | 一次发历史回放                   |


**deviceState 常用字段（按 deviceType）**


| deviceType | 字段                                        | 类型            | 备注           |
| ---------- | ----------------------------------------- | ------------- | ------------ |
| pump       | `rpm` `current` `temperature` `status`    | number/string | 转速、电流、温度、状态  |
| valve      | `openPercent` `flowRate` `status`         | number/string | 开度%、流量、状态    |
| tank       | `level` `temperature` `pressure` `status` | number/string | 液位%、温度、压力、状态 |
| conveyor   | `beltSpeed` `status`                      | number/string | 带速、状态        |
| agv        | `battery` `speed` `status`                | number/string | 电量%、速度、状态    |
| sensor     | `value` `unit` `status`                   | number/string | 读数、单位、状态     |


---

## 十、平台能力明细与后续优化指引

本节按功能说明「支持 / 部分支持 / 暂不支持」的具体含义，供前台迭代时对照。凡未单独说明的，**编辑器手动操作**与**导出预览包自动播放**均指当前平台已具备的能力。

### 10.1 全局共性（优先建设）


| 能力         | 现状     | 优化方向                                                                                                 |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Agent 消息接入 | 暂不支持   | 订阅 WebSocket；解析 `agent.expression` / `scene.expression` / `scene.batch`；按 `tick` 去重、排队、执行 `commands` |
| 设备绑定注册     | 暂不支持   | 场景加载时处理 `agent.registry`，建立 `agentId` ↔ `objectId` 映射表                                               |
| 指令并行与过渡    | 暂不支持   | 实现 `parallel`、`duration`、`easing` 的通用调度（目前各 action 均无运行时过渡）                                          |
| 导出包运行时控制   | 大部分不支持 | 导出包目前以「导出时配置」为主；除贴图动画、相机漫游、后期外，其余 action 需在预览包中增加运行时 API                                             |


### 10.2 标为「支持」的 action（4 项）

这四项**业务能力已闭环**（能配、能预览、导出能跑），后台接入后主要是「桥接」，不需从零造功能。


| action                 | 编辑器能做什么                   | 导出预览包能做什么    | 还差什么                   |
| ---------------------- | ------------------------- | ------------ | ---------------------- |
| `playTextureAnimation` | 为模型配置贴图 UV 滚动（速度、方向、作用贴图） | 自动播放已配置的贴图动画 | Agent 远程改速度/启停         |
| `stopTextureAnimation` | 关闭贴图动画开关                  | 识别停止指令配置     | Agent 远程停止             |
| `playCameraTour`       | 编辑站点漫游 / 一镜到底路线，视口试播      | 加载路线并播放      | Agent 远程指定 `tourId` 播放 |
| `stopCameraTour`       | 停止当前漫游                    | 停止当前漫游       | Agent 远程停止             |
| `setPostProcess`       | 选后期效果（泛光、SSAO、暗角等）并调参     | 按导出配置应用全屏后期  | Agent 运行时切换效果          |


### 10.3 标为「部分支持」的 action（6 项）

这类 action **手动编辑链路已有**，但 **Agent 驱动链路** 和/或 **导出包运行时更新** 未打通。


| action           | 已支持的部分                         | 不支持的部分                                                      | 建议优化顺序                                            |
| ---------------- | ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| `setTransform`   | 编辑器 Gizmo / 数值改位置、旋转、缩放；导出固定位姿 | Agent 每 tick 更新；`duration`/`easing` 插值；`space` 坐标系；导出包运行时移动 | ① 协议执行器直接改模型变换 → ② 补 tick 插值 → ③ 导出包运行时 API       |
| `setVisible`     | 编辑器切换显隐                        | Agent 远程显隐；导出包运行时显隐                                         | ① 协议执行器 → ② 导出包同步                                 |
| `setMaterial`    | 材质编辑器改 PBR 参数                  | Agent 远程改色；`materialSlot` 多槽；导出包运行时改材质                      | ① 协议执行器（单槽）→ ② 多材质槽 → ③ 导出包                       |
| `setLight`       | 五类灯光的增删与参数调节                   | Agent 远程调灯；导出包运行时调灯                                         | ① 协议执行器 → ② 导出包                                   |
| `setEnvironment` | 背景色、雾、HDR、曝光、旋转                | Agent 远程改环境；导出包运行时切换                                        | ① 协议执行器 → ② 导出包                                   |
| `setCamera`      | 相机位置、注视点、FOV、裁剪面               | Agent 远程设相机；与漫游冲突处理                                         | ① 协议执行器 → ② 与 `playCameraTour`/`focusObject` 互斥策略 |


### 10.4 标为「暂不支持」的 action（7 项）

需**新建业务能力**，不能仅靠协议桥接。


| action             | 缺什么功能           | 可参考的现有基础                  | 建议做法                                |
| ------------------ | --------------- | ------------------------- | ----------------------------------- |
| `setTrajectory`    | 关键帧路径插值、历史回放、倍速 | `setTransform` 单点更新（也未接入） | 在模型变换层之上加轨迹播放器                      |
| `setMaterialState` | 业务状态→外观映射       | 材质编辑器改色                   | 维护状态-颜色映射表，内部转调 `setMaterial`       |
| `showLabel`        | 模型旁文字标签         | 无                         | 增加 3D/HTML 文字叠加层                    |
| `showInfoPanel`    | 设备数据浮层          | UI 组件库已有，无绑定逻辑            | 按 `objectId` 弹出数据卡片，读 `deviceState` |
| `highlight`        | 远程单对象描边         | 仅有编辑器选中高亮                 | 单对象描边通道，与选中态分离                      |
| `playAnimation`    | GLB 骨骼动画播放      | 可加载 GLB 静态模型              | 增加动画片段播放与混合                         |
| `focusObject`      | 按模型 ID 自动飞入视角   | 漫游点手动飞入预览                 | 根据包围盒算距离与角度，复用相机飞行动画                |


### 10.5 后台当前可用替代方案

在能力未补齐前，后台可这样绕开限制：


| 原意图       | 现状                                 | 临时替代                                                |
| --------- | ---------------------------------- | --------------------------------------------------- |
| 泵/阀/罐变色告警 | `setMaterialState` 暂不支持            | 用 `setMaterial` 直接传 `color` / `emissive`（需等协议接入后生效） |
| 传送带/管道流动  | `playTextureAnimation` 支持          | 编辑器预先配好默认速度，接入后 Agent 调 `speedU`                    |
| AGV 实时位置  | `setTransform` 部分支持                | 每 tick 发 `realtime` 单点（需先完成协议 + 插值）                 |
| 传感器读数展示   | `showLabel` / `showInfoPanel` 暂不支持 | 仅发 `deviceState`，前台暂无 UI；或等业务面板能力上线                 |
| 镜头切到设备    | `focusObject` 暂不支持                 | 预先做相机漫游路线，用 `playCameraTour` 切到附近站点                 |
| 设备开关门动画   | `playAnimation` 暂不支持               | 用 `setTransform` 旋转/位移模拟（需协议接入）                     |


