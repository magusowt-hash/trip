'use client';

import { ChangeEvent, InputHTMLAttributes, useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type LayoutMode = 'grid' | 'staggered' | 'random';
type StaggerAxis = 'horizontal' | 'vertical';

type ImageItem = {
  id: string;
  name: string;
  relativePath: string;
  folderName: string;
  size: number;
  lastModified: number;
  url: string;
};

type PositionedImage = ImageItem & {
  x: number;
  y: number;
  row: number;
  col: number;
};

type RegionKey = 'N' | 'W' | 'S' | 'E';

type AngleTestGroup = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  photoCount: number;
};

type AngleScenario = {
  id: string;
  name: string;
  description: string;
  groups: AngleTestGroup[];
};

type RegionSummary = {
  region: RegionKey;
  centerAngle: number;
  groupCount: number;
  photoCount: number;
  weight: number;
  normalizedWeight: number;
  regionAngle: number;
  startAngle: number;
  endAngle: number;
  groups: Array<AngleTestGroup & { sortValue: number }>;
};

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i;
const CARD_SIZE = 88;
const STAGE_WIDTH = 980;
const STAGE_HEIGHT = 640;
const REGION_CENTER_ANGLE: Record<RegionKey, number> = {
  E: 0,
  S: 90,
  W: 180,
  N: 270,
};

const ANGLE_TEST_SCENARIOS: AngleScenario[] = [
  {
    id: 'balanced-five',
    name: '五组均衡分布',
    description: '验证图片组刚进入大于等于五时，各区域角度是否均衡展开。',
    groups: [
      { id: 'a', name: '西北山谷', lng: 18, lat: 88, photoCount: 6 },
      { id: 'b', name: '北岸码头', lng: 51, lat: 92, photoCount: 9 },
      { id: 'c', name: '东侧街口', lng: 89, lat: 58, photoCount: 5 },
      { id: 'd', name: '南面湖滩', lng: 48, lat: 12, photoCount: 8 },
      { id: 'e', name: '西南旧桥', lng: 14, lat: 24, photoCount: 4 },
    ],
  },
  {
    id: 'north-heavy',
    name: '北区高密',
    description: '验证大量图片组与图片集中在北侧时，北区角度是否拉大到足够范围。',
    groups: [
      { id: 'a', name: '北一', lng: 12, lat: 90, photoCount: 11 },
      { id: 'b', name: '北二', lng: 26, lat: 86, photoCount: 8 },
      { id: 'c', name: '北三', lng: 43, lat: 83, photoCount: 14 },
      { id: 'd', name: '北四', lng: 58, lat: 88, photoCount: 10 },
      { id: 'e', name: '北五', lng: 77, lat: 85, photoCount: 13 },
      { id: 'f', name: '东南补点', lng: 86, lat: 28, photoCount: 3 },
      { id: 'g', name: '西南补点', lng: 16, lat: 19, photoCount: 4 },
    ],
  },
  {
    id: 'east-large-groups',
    name: '东区大组外扩',
    description: '验证东区虽然组数不多，但图片数量偏大时，角度是否会被拉大。',
    groups: [
      { id: 'a', name: '东一大组', lng: 91, lat: 76, photoCount: 18 },
      { id: 'b', name: '东二大组', lng: 95, lat: 47, photoCount: 21 },
      { id: 'c', name: '东三大组', lng: 88, lat: 19, photoCount: 16 },
      { id: 'd', name: '北侧小组', lng: 46, lat: 93, photoCount: 4 },
      { id: 'e', name: '西侧小组', lng: 8, lat: 45, photoCount: 5 },
      { id: 'f', name: '南侧小组', lng: 41, lat: 9, photoCount: 3 },
    ],
  },
];

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampAngle(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function getPreferredRegion(group: AngleTestGroup, centerLng: number, centerLat: number): RegionKey {
  const dx = group.lng - centerLng;
  const dy = group.lat - centerLat;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 'W' : 'E';
  }
  return dy < 0 ? 'S' : 'N';
}

function buildRegionSummaries(groups: AngleTestGroup[]): RegionSummary[] {
  const centerLng = groups.reduce((sum, group) => sum + group.lng, 0) / groups.length;
  const centerLat = groups.reduce((sum, group) => sum + group.lat, 0) / groups.length;
  const regionMap = new Map<RegionKey, AngleTestGroup[]>([
    ['N', []],
    ['W', []],
    ['S', []],
    ['E', []],
  ]);

  for (const group of groups) {
    const region = getPreferredRegion(group, centerLng, centerLat);
    regionMap.get(region)!.push(group);
  }

  for (const [region, regionGroups] of regionMap) {
    if (region === 'N' || region === 'S') {
      regionGroups.sort((a, b) => a.lng - b.lng);
    } else {
      regionGroups.sort((a, b) => b.lat - a.lat);
    }
  }

  const totalGroupCount = groups.length || 1;
  const totalPhotoCount = groups.reduce((sum, group) => sum + group.photoCount, 0) || 1;
  const rawWeights = (['N', 'W', 'S', 'E'] as RegionKey[]).map((region) => {
    const regionGroups = regionMap.get(region)!;
    const groupCount = regionGroups.length;
    const photoCount = regionGroups.reduce((sum, group) => sum + group.photoCount, 0);
    const weight = 0.65 * (groupCount / totalGroupCount) + 0.35 * (photoCount / totalPhotoCount);
    return { region, groupCount, photoCount, weight, regionGroups };
  });
  const maxWeight = Math.max(...rawWeights.map((item) => item.weight), 1);

  return rawWeights.map((item) => {
    const normalizedWeight = item.weight / maxWeight;
    const regionAngle = 60 + 120 * normalizedWeight;
    return {
      region: item.region,
      centerAngle: REGION_CENTER_ANGLE[item.region],
      groupCount: item.groupCount,
      photoCount: item.photoCount,
      weight: item.weight,
      normalizedWeight,
      regionAngle,
      startAngle: clampAngle(REGION_CENTER_ANGLE[item.region] - regionAngle / 2),
      endAngle: clampAngle(REGION_CENTER_ANGLE[item.region] + regionAngle / 2),
      groups: item.regionGroups.map((group) => ({
        ...group,
        sortValue: item.region === 'N' || item.region === 'S' ? group.lng : group.lat,
      })),
    };
  });
}

function buildGridOffsets(count: number, gapX: number, gapY: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const stepX = CARD_SIZE + gapX;
  const stepY = CARD_SIZE + gapY;

  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      col,
      row,
      offsetX: (col - (cols - 1) / 2) * stepX,
      offsetY: (row - (rows - 1) / 2) * stepY,
    };
  });
}

function buildStaggeredOffsets(count: number, gapX: number, gapY: number, axis: StaggerAxis) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const stepX = CARD_SIZE + gapX;
  const stepY = CARD_SIZE + gapY;

  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const baseX = (col - (cols - 1) / 2) * stepX;
    const baseY = (row - (rows - 1) / 2) * stepY;

    if (axis === 'horizontal') {
      return {
        col,
        row,
        offsetX: baseX,
        offsetY: baseY + (col % 2 === 1 ? stepY / 2 : 0),
      };
    }

    return {
      col,
      row,
      offsetX: baseX + (row % 2 === 1 ? stepX / 2 : 0),
      offsetY: baseY,
    };
  });
}

function buildRandomOffsets(count: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const xMatrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const yMatrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      if (index >= count) continue;

      if (col > 0) {
        xMatrix[row][col] = xMatrix[row][col - 1] + CARD_SIZE + randomInt(1, 100);
      }
      if (row > 0) {
        yMatrix[row][col] = yMatrix[row - 1][col] + CARD_SIZE + randomInt(1, 100);
      }
    }
  }

  const points = Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      col,
      row,
      x: xMatrix[row][col],
      y: yMatrix[row][col],
    };
  });

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return points.map((point) => ({
    col: point.col,
    row: point.row,
    offsetX: point.x - centerX,
    offsetY: point.y - centerY,
  }));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TestCssPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [rootName, setRootName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [mode, setMode] = useState<LayoutMode>('grid');
  const [gapX, setGapX] = useState(24);
  const [gapY, setGapY] = useState(24);
  const [staggerAxis, setStaggerAxis] = useState<StaggerAxis>('horizontal');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(ANGLE_TEST_SCENARIOS[0].id);

  const directoryInputProps = {
    webkitdirectory: '',
  } as InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string };

  useEffect(() => {
    return () => {
      for (const image of images) {
        URL.revokeObjectURL(image.url);
      }
    };
  }, [images]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ImageItem[]>();
    for (const image of images) {
      const bucket = grouped.get(image.folderName) ?? [];
      bucket.push(image);
      grouped.set(image.folderName, bucket);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
      .map(([folderName, items]) => ({
        folderName,
        items: items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      }));
  }, [images]);

  useEffect(() => {
    if (!selectedFolder && groups[0]) {
      setSelectedFolder(groups[0].folderName);
      return;
    }
    if (selectedFolder && !groups.some((group) => group.folderName === selectedFolder)) {
      setSelectedFolder(groups[0]?.folderName || '');
    }
  }, [groups, selectedFolder]);

  const activeGroup = groups.find((group) => group.folderName === selectedFolder) || null;

  const positionedImages = useMemo<PositionedImage[]>(() => {
    if (!activeGroup) return [];

    const safeGapX = clampNonNegative(gapX);
    const safeGapY = clampNonNegative(gapY);
    let offsets: Array<{ offsetX: number; offsetY: number; row: number; col: number }> = [];

    if (mode === 'grid') {
      offsets = buildGridOffsets(activeGroup.items.length, safeGapX, safeGapY);
    } else if (mode === 'staggered') {
      offsets = buildStaggeredOffsets(activeGroup.items.length, safeGapX, safeGapY, staggerAxis);
    } else {
      offsets = buildRandomOffsets(activeGroup.items.length);
    }

    return activeGroup.items.map((image, index) => ({
      ...image,
      x: STAGE_WIDTH / 2 + offsets[index].offsetX,
      y: STAGE_HEIGHT / 2 + offsets[index].offsetY,
      row: offsets[index].row,
      col: offsets[index].col,
    }));
  }, [activeGroup, gapX, gapY, mode, staggerAxis]);

  const summary = useMemo(() => {
    const totalSize = images.reduce((sum, image) => sum + image.size, 0);
    return {
      folderCount: groups.length,
      imageCount: images.length,
      totalSize,
    };
  }, [groups.length, images]);

  const activeScenario = useMemo(
    () => ANGLE_TEST_SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) ?? ANGLE_TEST_SCENARIOS[0],
    [selectedScenarioId],
  );

  const regionSummaries = useMemo(
    () => buildRegionSummaries(activeScenario.groups),
    [activeScenario],
  );

  function handleFolderPick(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    for (const image of images) {
      URL.revokeObjectURL(image.url);
    }

    if (selectedFiles.length === 0) {
      setImages([]);
      setRootName('');
      setSelectedFolder('');
      return;
    }

    const firstPath = (selectedFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const nextRootName = firstPath.split('/').filter(Boolean)[0] || '';
    setRootName(nextRootName);

    const nextImages = selectedFiles
      .filter((file) => IMAGE_EXT_RE.test(file.name))
      .map((file, index) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const segments = relativePath.split('/').filter(Boolean);
        const folderName = segments.length >= 3 ? segments[1] : '根目录';
        return {
          id: `${relativePath}-${file.size}-${file.lastModified}-${index}`,
          name: file.name,
          relativePath,
          folderName,
          size: file.size,
          lastModified: file.lastModified,
          url: URL.createObjectURL(file),
        };
      });

    setImages(nextImages);
    setSelectedFolder('');
    event.target.value = '';
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Photo Layout Playground</p>
          <h1>三种可选排列方案测试页</h1>
          <p className={styles.description}>
            当前页面专门验证图片自动排布逻辑。支持整齐排列、错位排列、随机排列，并允许实时切换参数观察结果。
          </p>
        </div>

        <div className={styles.uploadCard}>
          <span className={styles.cardLabel}>测试素材</span>
          <strong>{rootName || '未选择主文件夹'}</strong>
          <p>目录建议使用“主文件夹 / 地点名 / 图片文件”结构，页面会按地点自动分组。</p>
          <label className={styles.pickerLabel}>
            <input
              {...directoryInputProps}
              className={styles.fileInput}
              type="file"
              multiple
              onChange={handleFolderPick}
            />
            <span className={styles.pickerButton}>选择测试文件夹</span>
          </label>
        </div>
      </section>

      <section className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>地点组数</span>
          <strong>{summary.folderCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>图片总数</span>
          <strong>{summary.imageCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>素材体积</span>
          <strong>{formatBytes(summary.totalSize)}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>当前地点</span>
          <strong>{activeGroup?.folderName || '未选择'}</strong>
        </div>
      </section>

      <section className={styles.angleLab}>
        <div className={styles.angleLabHeader}>
          <div>
            <p className={styles.eyebrow}>Region Angle Lab</p>
            <h2>区域角度测试数据</h2>
            <p className={styles.description}>
              这里使用固定测试数据验证区域角度算法，方便观察图片组数量、图片数量变化后，`N/W/S/E` 四区角度是否需要继续优化。
            </p>
          </div>
          <div className={styles.scenarioPicker}>
            {ANGLE_TEST_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className={`${styles.toggleBtn} ${selectedScenarioId === scenario.id ? styles.toggleBtnActive : ''}`}
                onClick={() => setSelectedScenarioId(scenario.id)}
              >
                {scenario.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.angleScenarioCard}>
          <strong>{activeScenario.name}</strong>
          <p>{activeScenario.description}</p>
          <span>当前共 {activeScenario.groups.length} 个图片组，{activeScenario.groups.reduce((sum, group) => sum + group.photoCount, 0)} 张图。</span>
        </div>

        <div className={styles.regionGrid}>
          {regionSummaries.map((summaryItem) => (
            <article key={summaryItem.region} className={styles.regionCard}>
              <div className={styles.regionCardHeader}>
                <div>
                  <span className={styles.regionTag}>区域 {summaryItem.region}</span>
                  <h3>{summaryItem.groupCount} 组 / {summaryItem.photoCount} 图</h3>
                </div>
                <strong>{summaryItem.regionAngle.toFixed(1)}°</strong>
              </div>
              <div className={styles.regionMeta}>
                <span>权重 {summaryItem.weight.toFixed(4)}</span>
                <span>归一化 {summaryItem.normalizedWeight.toFixed(4)}</span>
                <span>中心角 {summaryItem.centerAngle}°</span>
                <span>范围 {summaryItem.startAngle.toFixed(1)}° - {summaryItem.endAngle.toFixed(1)}°</span>
              </div>
              <div className={styles.regionGroupList}>
                {summaryItem.groups.length === 0 ? (
                  <div className={styles.emptyHint}>当前测试数据中没有分到该区域的图片组</div>
                ) : summaryItem.groups.map((group, index) => (
                  <div key={group.id} className={styles.regionGroupItem}>
                    <strong>{index + 1}. {group.name}</strong>
                    <span>lng {group.lng} / lat {group.lat}</span>
                    <span>{group.photoCount} 图</span>
                    <span>{summaryItem.region === 'N' || summaryItem.region === 'S' ? `经度序值 ${group.sortValue}` : `纬度序值 ${group.sortValue}`}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <h2>地点列表</h2>
            <p>点击切换当前用于测试排列的地点分组。</p>
            <div className={styles.folderList}>
              {groups.length === 0 ? (
                <div className={styles.emptyHint}>选择文件夹后显示地点列表</div>
              ) : groups.map((group) => (
                <button
                  key={group.folderName}
                  type="button"
                  className={`${styles.folderButton} ${selectedFolder === group.folderName ? styles.folderButtonActive : ''}`}
                  onClick={() => setSelectedFolder(group.folderName)}
                >
                  <span>{group.folderName}</span>
                  <strong>{group.items.length}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <h2>排列控制</h2>
            <div className={styles.optionGroup}>
              <span className={styles.optionLabel}>一级方案</span>
              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${mode === 'grid' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setMode('grid')}
                >
                  整齐排列
                </button>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${mode === 'staggered' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setMode('staggered')}
                >
                  错位排列
                </button>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${mode === 'random' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setMode('random')}
                >
                  随机排列
                </button>
              </div>
            </div>

            {mode === 'staggered' ? (
              <div className={styles.optionGroup}>
                <span className={styles.optionLabel}>二级选项</span>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${staggerAxis === 'horizontal' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setStaggerAxis('horizontal')}
                  >
                    横向错位
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${staggerAxis === 'vertical' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setStaggerAxis('vertical')}
                  >
                    竖向错位
                  </button>
                </div>
              </div>
            ) : null}

            {mode !== 'random' ? (
              <div className={styles.optionGroup}>
                <span className={styles.optionLabel}>距离参数</span>
                <label className={styles.field}>
                  <span>横向距离</span>
                  <input
                    type="number"
                    min={0}
                    value={gapX}
                    onChange={(event) => setGapX(clampNonNegative(Number(event.target.value)))}
                  />
                </label>
                <label className={styles.field}>
                  <span>竖向距离</span>
                  <input
                    type="number"
                    min={0}
                    value={gapY}
                    onChange={(event) => setGapY(clampNonNegative(Number(event.target.value)))}
                  />
                </label>
              </div>
            ) : (
              <div className={styles.optionGroup}>
                <span className={styles.optionLabel}>随机规则</span>
                <p className={styles.ruleText}>每张图片相对横向 / 竖向相邻图片的附加距离在 1-100 中随机。</p>
              </div>
            )}

            <div className={styles.ruleBlock}>
              <span className={styles.optionLabel}>规则说明</span>
              <ul className={styles.ruleList}>
                <li>整齐排列：规则网格，横向和竖向距离最低为 0。</li>
                <li>错位排列：当距离为 0 时，第一列与第三列共基准，第二列相对其错开半格。</li>
                <li>随机排列：无二级选项，每次重新计算都会生成新的随机间距。</li>
              </ul>
            </div>
          </div>
        </aside>

        <section className={styles.previewSection}>
          <div className={styles.previewHeader}>
            <div>
              <p className={styles.previewEyebrow}>Preview Stage</p>
              <h2>{activeGroup?.folderName || '等待选择地点'}</h2>
            </div>
            <div className={styles.previewMeta}>
              <span>{mode === 'grid' ? '整齐排列' : mode === 'staggered' ? '错位排列' : '随机排列'}</span>
              <strong>{positionedImages.length} 张</strong>
            </div>
          </div>

          <div className={styles.stage}>
            <div className={styles.stageCenterCross} />
            {positionedImages.length === 0 ? (
              <div className={styles.emptyStage}>选择测试文件夹并切换地点后，这里会显示排列结果。</div>
            ) : positionedImages.map((image) => (
              <figure
                key={image.id}
                className={styles.photoCard}
                style={{
                  left: image.x,
                  top: image.y,
                  width: CARD_SIZE,
                  height: CARD_SIZE,
                }}
              >
                <img src={image.url} alt={image.name} />
                <figcaption>
                  <strong title={image.name}>{image.name}</strong>
                  <span>R{image.row + 1} / C{image.col + 1}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
