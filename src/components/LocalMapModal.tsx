'use client';

import { ChangeEvent, InputHTMLAttributes, useEffect, useMemo, useState } from 'react';
import styles from './LocalMapModal.module.css';

export type LocalMappedAssetDraft = {
  relativePath: string;
  folderName: string;
  name: string;
  size: number;
  lastModified: number;
  matchedPlaceTitle: string;
  frameX: number | null;
  frameY: number | null;
  missing: boolean;
  url: string;
};

export type LocalMapLayoutMode = 'grid' | 'staggered' | 'random';
export type LocalMapStaggerAxis = 'horizontal' | 'vertical';

export type LocalMapLayoutSettings = {
  mode: LocalMapLayoutMode;
  gapX: number;
  gapY: number;
  staggerAxis: LocalMapStaggerAxis;
};

type SavedRecord = {
  rootName: string;
  savedAt: string;
  assets: Array<{
    relativePath: string;
    folderName: string;
    name: string;
    size: number;
    lastModified: number;
    matchedPlaceTitle: string;
    frameX: number | null;
    frameY: number | null;
    missing: boolean;
  }>;
  unmatchedFolders: string[];
};

type Props = {
  open: boolean;
  placeTitles: string[];
  onClose: () => void;
  onApply: (payload: {
    rootName: string;
    matchedAssets: LocalMappedAssetDraft[];
    unmatchedFolders: string[];
    missingAssets: Array<{ relativePath: string; name: string }>;
    layout: LocalMapLayoutSettings;
  }) => void;
};

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i;

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export default function LocalMapModal({ open, placeTitles, onClose, onApply }: Props) {
  const [rootName, setRootName] = useState('');
  const [knownRootNames, setKnownRootNames] = useState<string[]>([]);
  const [savedRecord, setSavedRecord] = useState<SavedRecord | null>(null);
  const [matchedAssets, setMatchedAssets] = useState<LocalMappedAssetDraft[]>([]);
  const [unmatchedFolders, setUnmatchedFolders] = useState<string[]>([]);
  const [missingAssets, setMissingAssets] = useState<Array<{ relativePath: string; name: string }>>([]);
  const [addedAssets, setAddedAssets] = useState<string[]>([]);
  const [changedAssets, setChangedAssets] = useState<string[]>([]);
  const [statusText, setStatusText] = useState('选择主文件夹后开始扫描');
  const [needsOverwriteConfirm, setNeedsOverwriteConfirm] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LocalMapLayoutMode>('grid');
  const [layoutGapX, setLayoutGapX] = useState(24);
  const [layoutGapY, setLayoutGapY] = useState(24);
  const [layoutStaggerAxis, setLayoutStaggerAxis] = useState<LocalMapStaggerAxis>('horizontal');

  const directoryInputProps = {
    webkitdirectory: '',
  } as InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string };

  const summary = useMemo(() => ({
    matchedCount: matchedAssets.length,
    unmatchedCount: unmatchedFolders.length,
    addedCount: addedAssets.length,
    missingCount: missingAssets.length,
    changedCount: changedAssets.length,
  }), [matchedAssets.length, unmatchedFolders.length, addedAssets.length, missingAssets.length, changedAssets.length]);

  const matchedPlaceCount = useMemo(() => {
    const matchedPlaces = new Set(matchedAssets.map((asset) => asset.matchedPlaceTitle));
    return placeTitles.filter((title) => matchedPlaces.has(title)).length;
  }, [matchedAssets, placeTitles]);

  const unmatchedPlaceCount = Math.max(placeTitles.length - matchedPlaceCount, 0);
  const knownRootSummary = knownRootNames.length > 0 ? knownRootNames.join(' / ') : '无';
  const savedRecordSummary = savedRecord?.rootName || '无';

  useEffect(() => {
    if (!open) return;
    setRootName('');
    setSavedRecord(null);
    setMatchedAssets([]);
    setUnmatchedFolders([]);
    setMissingAssets([]);
    setAddedAssets([]);
    setChangedAssets([]);
    setStatusText('选择主文件夹后开始扫描');
    setNeedsOverwriteConfirm(false);
    setLayoutMode('grid');
    setLayoutGapX(24);
    setLayoutGapY(24);
    setLayoutStaggerAxis('horizontal');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/footprints/local-map', {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        setKnownRootNames(Array.isArray(data.knownRootNames) ? data.knownRootNames : []);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  async function fetchRecord(nextRootName: string) {
    const res = await fetch(`/api/footprints/local-map?rootName=${encodeURIComponent(nextRootName)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('读取本地映射记录失败');
    const data = await res.json();
    setKnownRootNames(Array.isArray(data.knownRootNames) ? data.knownRootNames : []);
    return (data.record ?? null) as SavedRecord | null;
  }

  async function handleFolderPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const firstPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const nextRootName = firstPath.split('/').filter(Boolean)[0] || '';
    setRootName(nextRootName);
    setStatusText('正在读取旧记录并扫描目录...');

    try {
      const record = await fetchRecord(nextRootName);
      setSavedRecord(record);
      setNeedsOverwriteConfirm(Boolean(record));

      const placeTitleSet = new Set(placeTitles);
      const oldAssetMap = new Map((record?.assets ?? []).map((asset) => [asset.relativePath, asset]));
      const currentSeen = new Set<string>();
      const nextMatched: LocalMappedAssetDraft[] = [];
      const nextUnmatched = new Set<string>();
      const nextAdded: string[] = [];
      const nextChanged: string[] = [];

      for (const file of files) {
        if (!IMAGE_EXT_RE.test(file.name)) continue;
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const segments = relativePath.split('/').filter(Boolean);
        const folderName = segments.length >= 3 ? segments[1] : '根目录';
        currentSeen.add(relativePath);

        if (!placeTitleSet.has(folderName)) {
          nextUnmatched.add(folderName);
          continue;
        }

        const oldAsset = oldAssetMap.get(relativePath);
        if (!oldAsset) {
          nextAdded.push(relativePath);
        } else if (oldAsset.size !== file.size || oldAsset.lastModified !== file.lastModified) {
          nextChanged.push(relativePath);
        }

        nextMatched.push({
          relativePath,
          folderName,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          matchedPlaceTitle: folderName,
          frameX: oldAsset?.frameX ?? null,
          frameY: oldAsset?.frameY ?? null,
          missing: false,
          url: URL.createObjectURL(file),
        });
      }

      const nextMissing = (record?.assets ?? [])
        .filter((asset) => !currentSeen.has(asset.relativePath))
        .map((asset) => ({ relativePath: asset.relativePath, name: asset.name }));

      setMatchedAssets(nextMatched);
      setUnmatchedFolders(Array.from(nextUnmatched).sort((a, b) => a.localeCompare(b, 'zh-CN')));
      setMissingAssets(nextMissing);
      setAddedAssets(nextAdded);
      setChangedAssets(nextChanged);
      setStatusText('扫描完成，可确认映射');
    } catch (error: any) {
      setStatusText(error?.message || '扫描失败');
    } finally {
      event.target.value = '';
    }
  }

  function handleApply() {
    if (!rootName || matchedAssets.length === 0) return;
    if (savedRecord && needsOverwriteConfirm) {
      const ok = window.confirm(`主文件夹「${rootName}」已有记录。继续将以本次扫描结果覆盖旧记录，是否继续？`);
      if (!ok) return;
    }
    onApply({
      rootName,
      matchedAssets,
      unmatchedFolders,
      missingAssets,
      layout: {
        mode: layoutMode,
        gapX: clampNonNegative(layoutGapX),
        gapY: clampNonNegative(layoutGapY),
        staggerAxis: layoutStaggerAxis,
      },
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2>映射本地</h2>
          <p>规则：只读取主文件夹第一层子文件夹，且子文件夹名必须与足迹地点名称完全一致。未匹配目录不会进入正式足迹页。刷新后需重新选择主文件夹，才能恢复本地图片。</p>
        </div>

        <div className={styles.body}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>主文件夹记录</h3>
            <div className={styles.recordGrid}>
              <div className={styles.recordBox}>
                <span>主文件夹记录</span>
                <strong>{knownRootSummary}</strong>
              </div>
              <div className={styles.recordBox}>
                <span>保存记录</span>
                <strong>{savedRecordSummary}</strong>
              </div>
            </div>
            {(rootName && (summary.addedCount > 0 || summary.changedCount > 0)) ? (
              <div className={styles.recordGrid}>
                <div className={styles.recordBox}>
                  <span>新增文件</span>
                  <strong>{summary.addedCount}</strong>
                </div>
                <div className={styles.recordBox}>
                  <span>变化文件</span>
                  <strong>{summary.changedCount}</strong>
                </div>
              </div>
            ) : null}
            <p className={styles.hint}>当前会使用主文件夹名称作为唯一记录键。同名主文件夹会命中同一份位置记录。</p>
          </div>

          <div className={styles.summaryGrid}>
            <div className={styles.summaryBox}>
              <span>主文件夹</span>
              <strong>{rootName || '未选择'}</strong>
            </div>
            <div className={styles.summaryBox}>
              <span>已匹配图片</span>
              <strong>{summary.matchedCount}</strong>
            </div>
            <div className={styles.summaryBox}>
              <span>已匹配目录</span>
              <strong>{matchedPlaceCount}/{placeTitles.length}</strong>
              <em className={styles.summaryMeta}>未匹配地点 {unmatchedPlaceCount}</em>
            </div>
            <div className={styles.summaryBox}>
              <span>缺失文件</span>
              <strong>{summary.missingCount}</strong>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>排列方案</h3>
            <div className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutMode === 'grid' ? styles.toggleBtnActive : ''}`}
                onClick={() => setLayoutMode('grid')}
              >
                整齐排列
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutMode === 'staggered' ? styles.toggleBtnActive : ''}`}
                onClick={() => setLayoutMode('staggered')}
              >
                错位排列
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutMode === 'random' ? styles.toggleBtnActive : ''}`}
                onClick={() => setLayoutMode('random')}
              >
                随机排列
              </button>
            </div>

            {layoutMode === 'staggered' ? (
              <div className={styles.optionBlock}>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${layoutStaggerAxis === 'horizontal' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setLayoutStaggerAxis('horizontal')}
                  >
                    横向错位
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${layoutStaggerAxis === 'vertical' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setLayoutStaggerAxis('vertical')}
                  >
                    竖向错位
                  </button>
                </div>
              </div>
            ) : null}

            {layoutMode !== 'random' ? (
              <div className={styles.fieldsRow}>
                <label className={styles.field}>
                  <span>横向距离</span>
                  <input
                    type="number"
                    min={0}
                    value={layoutGapX}
                    onChange={(event) => setLayoutGapX(clampNonNegative(Number(event.target.value)))}
                  />
                </label>
                <label className={styles.field}>
                  <span>竖向距离</span>
                  <input
                    type="number"
                    min={0}
                    value={layoutGapY}
                    onChange={(event) => setLayoutGapY(clampNonNegative(Number(event.target.value)))}
                  />
                </label>
              </div>
            ) : (
              <p className={styles.hint}>随机排列会让每张图片相对于相邻图片产生 1-100 的随机附加距离。</p>
            )}
          </div>

          {unmatchedFolders.length > 0 ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>未匹配目录列表</h3>
              <div className={styles.list}>
                {unmatchedFolders.map((item) => (
                  <code key={item}>{item}</code>
                ))}
              </div>
            </div>
          ) : null}

          {missingAssets.length > 0 ? (
            <div className={styles.warning}>
              <h3>检测到缺失文件</h3>
              <p>以下文件在旧记录中存在，但本次扫描未找到。若本次执行保存，这些文件的位置记录将被删除。</p>
              <div className={styles.list}>
                {missingAssets.slice(0, 12).map((item) => (
                  <code key={item.relativePath}>{item.relativePath}</code>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.statusText}>{statusText}</div>
        </div>

        <div className={styles.footer}>
          <label className={styles.footerPicker}>
            <input
              {...directoryInputProps}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFolderPick}
            />
            <span className={styles.pickerButton}>选择主文件夹</span>
          </label>
          <button className={styles.secondaryBtn} type="button" onClick={onClose}>取消</button>
          <button className={styles.actionBtn} type="button" onClick={handleApply} disabled={!rootName || matchedAssets.length === 0}>
            确认映射
          </button>
        </div>
      </div>
    </div>
  );
}
