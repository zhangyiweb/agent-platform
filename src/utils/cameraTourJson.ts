import type { CameraTour, Vec3 } from '@/types/cameraTour';
import { DEFAULT_SPLINE_DURATION, normalizeCameraTour } from '@/types/cameraTour';
import { exportSplineCurvePoints } from '@/utils/cameraTourSpline';

export interface ExportedCameraTourWaypoint {
  index: number;
  name: string;
  type: 'waypoint' | 'focus';
  position: Vec3;
  target: Vec3;
  objectId?: string;
  objectName?: string;
  dwellTime: number;
  transitionTime: number;
}

export interface ExportedCameraTourJson {
  version: string;
  exportTime: string;
  tour: {
    id: string;
    name: string;
    /** stop=站点停靠 | spline=一镜到底曲线漫游 */
    mode: 'stop' | 'spline';
    loop: boolean;
    /** 一镜到底模式：全程秒数 */
    splineDuration?: number;
  };
  /** 路线：折线点；spline 模式另含 curveSamples 平滑曲线采样 */
  route: {
    points: Vec3[];
    lineSegments: Array<{ from: Vec3; to: Vec3 }>;
    curveSamples?: Vec3[];
  };
  waypoints: ExportedCameraTourWaypoint[];
}

export function buildCameraTourJson(tour: CameraTour): ExportedCameraTourJson {
  const tourData = normalizeCameraTour(tour);

  const waypoints: ExportedCameraTourWaypoint[] = tourData.stops.map((stop, index) => ({
    index,
    name: stop.name,
    type: stop.type,
    position: { ...stop.position },
    target: { ...stop.target },
    objectId: stop.objectId,
    objectName: stop.objectName,
    dwellTime: stop.dwellTime,
    transitionTime: stop.transitionTime,
  }));

  const points = waypoints.map((w) => w.position);
  const lineSegments: Array<{ from: Vec3; to: Vec3 }> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    lineSegments.push({ from: { ...points[i] }, to: { ...points[i + 1] } });
  }

  return {
    version: '1.1',
    exportTime: new Date().toISOString(),
    tour: {
      id: tourData.id,
      name: tourData.name,
      mode: tourData.mode,
      loop: tourData.loop,
      ...(tourData.mode === 'spline'
        ? { splineDuration: tourData.splineDuration ?? DEFAULT_SPLINE_DURATION }
        : {}),
    },
    route: {
      points,
      lineSegments,
      ...(tourData.mode === 'spline' && tourData.stops.length >= 2
        ? { curveSamples: exportSplineCurvePoints(tourData) }
        : {}),
    },
    waypoints,
  };
}

function indentJson(value: unknown, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

/**
 * 生成带字段说明的 JSON 预览文本（含 // 注释，仅用于弹窗查看；下载文件仍为标准 JSON）
 */
export function buildCameraTourJsonPreview(tour: CameraTour): string {
  const data = buildCameraTourJson(tour);
  const lines: string[] = ['{'];

  lines.push('  // version — 数据格式版本号');
  lines.push(`  "version": ${JSON.stringify(data.version)},`);

  lines.push('  // exportTime — 导出时间（ISO 8601）');
  lines.push(`  "exportTime": ${JSON.stringify(data.exportTime)},`);

  lines.push('  // tour — 路线元信息');
  lines.push('  "tour": {');
  lines.push('    // id — 路线唯一标识');
  lines.push(`    "id": ${JSON.stringify(data.tour.id)},`);
  lines.push('    // name — 路线名称');
  lines.push(`    "name": ${JSON.stringify(data.tour.name)},`);
  lines.push('    // mode — 漫游方式：stop=站点停靠看设备 | spline=一镜到底曲线漫游');
  lines.push(`    "mode": ${JSON.stringify(data.tour.mode)},`);
  lines.push('    // loop — 是否循环播放');
  lines.push(`    "loop": ${JSON.stringify(data.tour.loop)}`);
  if (data.tour.splineDuration !== undefined) {
    lines.push(',');
    lines.push('    // splineDuration — 一镜到底模式下的全程播放时长（秒）');
    lines.push(`    "splineDuration": ${data.tour.splineDuration}`);
  }
  lines.push('  },');

  lines.push('  // route — 路径可视化数据（画折线/曲线用；实际动画以 waypoints 为准）');
  lines.push('  "route": {');
  lines.push('    // points — 各漫游点相机位置，按顺序排列');
  lines.push(`    "points": ${JSON.stringify(data.route.points)},`);
  lines.push('    // lineSegments — 相邻漫游点的直线连接段');
  lines.push(`    "lineSegments": ${JSON.stringify(data.route.lineSegments)}`);
  if (data.route.curveSamples) {
    lines.push(',');
    lines.push('    // curveSamples — 平滑曲线采样点（仅 spline 模式，便于绘制参观路径）');
    lines.push(`    "curveSamples": ${JSON.stringify(data.route.curveSamples)}`);
  }
  lines.push('  },');

  lines.push('  // waypoints — 漫游点列表（播放核心数据）');
  lines.push('  //   index — 序号（从 0 开始）');
  lines.push('  //   name — 漫游点名称');
  lines.push('  //   type — waypoint=路径点 | focus=设备聚焦点');
  lines.push('  //   position — 相机坐标 { x, y, z }');
  lines.push('  //   target — 注视目标点 { x, y, z }');
  lines.push('  //   dwellTime — 到达后停留秒数（站点模式）');
  lines.push('  //   transitionTime — 从上一站飞入秒数（站点模式）');
  lines.push('  //   objectId / objectName — 绑定的场景设备（可选，focus 类型）');
  lines.push(`  "waypoints": ${indentJson(data.waypoints, 2).trimStart()}`);
  lines.push('}');

  return lines.join('\n');
}

export function downloadCameraTourJson(tour: CameraTour, filename?: string) {
  const json = buildCameraTourJson(tour);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `camera-tour-${tour.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 从导出 JSON 还原为播放器可用的 tour 结构 */
export function tourFromExportedJson(json: ExportedCameraTourJson): CameraTour {
  return normalizeCameraTour({
    id: json.tour.id,
    name: json.tour.name,
    mode: json.tour.mode ?? 'stop',
    loop: json.tour.loop,
    splineDuration: json.tour.splineDuration,
    stops: json.waypoints.map((w) => ({
      id: `stop_${w.index}`,
      name: w.name,
      type: w.type,
      position: { ...w.position },
      target: { ...w.target },
      objectId: w.objectId,
      objectName: w.objectName,
      dwellTime: w.dwellTime,
      transitionTime: w.transitionTime,
    })),
  });
}
