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

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i;
const CARD_SIZE = 88;
const STAGE_WIDTH = 980;
const STAGE_HEIGHT = 640;

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
