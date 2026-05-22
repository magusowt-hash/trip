'use client';

import { ChangeEvent, InputHTMLAttributes, useEffect, useMemo, useState } from 'react';
import styles from './LocalMapModal.module.css';

export type LocalMappedAssetDraft = {
  relativePath: string;
  folderName: string;
  name: string;
  size: number;
  lastModified: number;
  pixelWidth: number | null;
  pixelHeight: number | null;
  matchedPlaceTitle: string;
  frameX: number | null;
  frameY: number | null;
  missing: boolean;
  url: string;
  thumbnailUrl?: string;
  matchType?: 'exact' | 'fuzzy';
};

type FuzzyMatchCandidate = {
  folderName: string;
  matchedPlaceTitle: string;
  checked: boolean;
};

export type LocalMapLayoutMode = 'grid' | 'staggered' | 'random';
export type LocalMapStaggerAxis = 'horizontal' | 'vertical';

export type LocalMapLayoutSettings = {
  mode: LocalMapLayoutMode;
  gapX: number;
  gapY: number;
  staggerAxis: LocalMapStaggerAxis;
  enabled: boolean;
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
    footprintItemId: number;
    matchedPlaceTitle: string;
    frameX: number | null;
    frameY: number | null;
    missing: boolean;
  }>;
  unmatchedFolders: string[];
};

type LocalMapPlace = {
  id: number;
  title: string;
};

type Props = {
  open: boolean;
  places: LocalMapPlace[];
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

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  });
}

export default function LocalMapModal({ open, places, onClose, onApply }: Props) {
  const [rootName, setRootName] = useState('');
  const [knownRootNames, setKnownRootNames] = useState<string[]>([]);
  const [savedRecord, setSavedRecord] = useState<SavedRecord | null>(null);
  const [matchedAssets, setMatchedAssets] = useState<LocalMappedAssetDraft[]>([]);
  const [unmatchedFolders, setUnmatchedFolders] = useState<string[]>([]);
  const [missingAssets, setMissingAssets] = useState<Array<{ relativePath: string; name: string }>>([]);
  const [addedAssets, setAddedAssets] = useState<string[]>([]);
  const [changedAssets, setChangedAssets] = useState<string[]>([]);
  const [fuzzyMatches, setFuzzyMatches] = useState<FuzzyMatchCandidate[]>([]);
  const [pendingExactAssets, setPendingExactAssets] = useState<LocalMappedAssetDraft[]>([]);
  const [pendingFuzzyAssets, setPendingFuzzyAssets] = useState<LocalMappedAssetDraft[]>([]);
  const [statusText, setStatusText] = useState('选择主文件夹后开始扫描');
  const [needsOverwriteConfirm, setNeedsOverwriteConfirm] = useState(false);
  const [layoutEnabled, setLayoutEnabled] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LocalMapLayoutMode>('grid');
  const [layoutGapX, setLayoutGapX] = useState(24);
  const [layoutGapY, setLayoutGapY] = useState(24);
  const [layoutStaggerAxis, setLayoutStaggerAxis] = useState<LocalMapStaggerAxis>('horizontal');

  const directoryInputProps = {
    webkitdirectory: '',
  } as InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string };

  const approvedFuzzyFolders = useMemo(
    () => new Set(fuzzyMatches.filter((item) => item.checked).map((item) => item.folderName)),
    [fuzzyMatches],
  );
  const effectiveMatchedAssets = useMemo(
    () => [...pendingExactAssets, ...pendingFuzzyAssets.filter((asset) => approvedFuzzyFolders.has(asset.folderName))],
    [approvedFuzzyFolders, pendingExactAssets, pendingFuzzyAssets],
  );

  const summary = useMemo(() => ({
    matchedCount: effectiveMatchedAssets.length,
    unmatchedCount: unmatchedFolders.length,
    addedCount: addedAssets.length,
    missingCount: missingAssets.length,
    changedCount: changedAssets.length,
  }), [effectiveMatchedAssets.length, unmatchedFolders.length, addedAssets.length, missingAssets.length, changedAssets.length]);

  const matchedPlaceCount = useMemo(() => {
    const matchedPlaces = new Set(effectiveMatchedAssets.map((asset) => asset.matchedPlaceTitle));
    return places.filter((place) => matchedPlaces.has(place.title)).length;
  }, [effectiveMatchedAssets, places]);

  const unmatchedPlaceCount = Math.max(places.length - matchedPlaceCount, 0);
  const knownRootSummary = knownRootNames.length > 0 ? knownRootNames.join(' / ') : '无';
  const savedRecordSummary = savedRecord?.rootName || '无';
  const approvedFuzzyMatchCount = fuzzyMatches.filter((item) => item.checked).length;
  const canApply = !!rootName && (pendingExactAssets.length + approvedFuzzyMatchCount) > 0;

  useEffect(() => {
    if (!open) return;
    setRootName('');
    setSavedRecord(null);
    setMatchedAssets([]);
    setUnmatchedFolders([]);
    setMissingAssets([]);
    setAddedAssets([]);
    setChangedAssets([]);
    setFuzzyMatches([]);
    setPendingExactAssets([]);
    setPendingFuzzyAssets([]);
    setStatusText('选择主文件夹后开始扫描');
    setNeedsOverwriteConfirm(false);
    setLayoutEnabled(true);
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
    const params = new URLSearchParams({ rootName: nextRootName });
    for (const place of places) {
      params.append('footprint_item_id', String(place.id));
    }
    const res = await fetch(`/api/footprints/local-map?${params.toString()}`, {
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
      setLayoutEnabled(!record);

      const placeTitleSet = new Set(places.map((place) => place.title));
      const placeIdByTitle = new Map(places.map((place) => [place.title, place.id]));
      const oldAssetMap = new Map((record?.assets ?? []).map((asset) => [asset.relativePath, asset]));
      const currentSeen = new Set<string>();
      const nextExactMatched: LocalMappedAssetDraft[] = [];
      const nextFuzzyMatched: LocalMappedAssetDraft[] = [];
      const nextUnmatched = new Set<string>();
      const nextAdded: string[] = [];
      const nextChanged: string[] = [];
      const folderFuzzyMatchMap = new Map<string, string>();

      for (const folderName of Array.from(new Set(
        files
          .filter((file) => IMAGE_EXT_RE.test(file.name))
          .map((file) => {
            const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
            const segments = relativePath.split('/').filter(Boolean);
            return segments.length >= 3 ? segments[1] : '根目录';
          }),
      ))) {
        if (placeTitleSet.has(folderName)) continue;
        const matches = places.map((place) => place.title).filter((title) => title.includes(folderName));
        if (matches.length === 1) {
          folderFuzzyMatchMap.set(folderName, matches[0]);
        } else {
          nextUnmatched.add(folderName);
        }
      }

      for (const file of files) {
        if (!IMAGE_EXT_RE.test(file.name)) continue;
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const segments = relativePath.split('/').filter(Boolean);
        const folderName = segments.length >= 3 ? segments[1] : '根目录';
        currentSeen.add(relativePath);

        const exactMatched = placeTitleSet.has(folderName);
        const fuzzyMatchedPlaceTitle = folderFuzzyMatchMap.get(folderName) || '';

        if (!exactMatched && !fuzzyMatchedPlaceTitle) {
          continue;
        }

        const oldAsset = oldAssetMap.get(relativePath);
        if (!oldAsset) {
          nextAdded.push(relativePath);
        } else if (oldAsset.size !== file.size || oldAsset.lastModified !== file.lastModified) {
          nextChanged.push(relativePath);
        }

        const dimensions = await readImageDimensions(file);

        const nextAsset: LocalMappedAssetDraft = {
          relativePath,
          folderName,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          pixelWidth: dimensions?.width ?? null,
          pixelHeight: dimensions?.height ?? null,
          matchedPlaceTitle: exactMatched ? folderName : fuzzyMatchedPlaceTitle,
          footprintItemId: placeIdByTitle.get(exactMatched ? folderName : fuzzyMatchedPlaceTitle) ?? 0,
          frameX: oldAsset?.frameX ?? null,
          frameY: oldAsset?.frameY ?? null,
          missing: false,
          url: URL.createObjectURL(file),
          matchType: exactMatched ? 'exact' : 'fuzzy',
        };

        if (!nextAsset.footprintItemId) {
          nextUnmatched.add(folderName);
          continue;
        }

        if (exactMatched) {
          nextExactMatched.push(nextAsset);
        } else {
          nextFuzzyMatched.push(nextAsset);
        }
      }

      const nextMissing = (record?.assets ?? [])
        .filter((asset) => !currentSeen.has(asset.relativePath))
        .map((asset) => ({ relativePath: asset.relativePath, name: asset.name }));

      const nextFuzzyCandidates = Array.from(folderFuzzyMatchMap.entries())
        .map(([folderName, matchedPlaceTitle]) => ({
          folderName,
          matchedPlaceTitle,
          checked: true,
        }))
        .sort((a, b) => a.folderName.localeCompare(b.folderName, 'zh-CN'));

      setMatchedAssets(nextExactMatched);
      setPendingExactAssets(nextExactMatched);
      setPendingFuzzyAssets(nextFuzzyMatched);
      setFuzzyMatches(nextFuzzyCandidates);
      setUnmatchedFolders(Array.from(nextUnmatched).sort((a, b) => a.localeCompare(b, 'zh-CN')));
      setMissingAssets(nextMissing);
      setAddedAssets(nextAdded);
      setChangedAssets(nextChanged);
      setStatusText(nextFuzzyCandidates.length > 0 ? '扫描完成，请确认模糊匹配项' : '扫描完成，可确认映射');
    } catch (error: any) {
      setStatusText(error?.message || '扫描失败');
    } finally {
      event.target.value = '';
    }
  }

  function handleToggleFuzzyMatch(folderName: string) {
    setFuzzyMatches((current) => current.map((item) => (
      item.folderName === folderName
        ? { ...item, checked: !item.checked }
        : item
    )));
  }

  function handleApply() {
    if (!rootName) return;
    const nextMatchedAssets = effectiveMatchedAssets;
    if (nextMatchedAssets.length === 0) {
      window.alert('当前没有可确认的匹配项');
      return;
    }
    if (savedRecord && needsOverwriteConfirm) {
      const ok = window.confirm(`主文件夹「${rootName}」已有记录。继续将以本次扫描结果覆盖旧记录，是否继续？`);
      if (!ok) return;
    }
    onApply({
      rootName,
      matchedAssets: nextMatchedAssets,
      unmatchedFolders,
      missingAssets,
      layout: {
        enabled: layoutEnabled,
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
          <p>规则：先执行文件夹名与地点名完全一致的精准匹配；若仍有未匹配目录，再执行“地点名包含文件夹名”的单向模糊匹配。模糊匹配需用户确认后才会生效。刷新后需重新选择主文件夹，才能恢复本地图片。</p>
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
              <strong>{matchedPlaceCount}/{places.length}</strong>
              <em className={styles.summaryMeta}>未匹配地点 {unmatchedPlaceCount}</em>
            </div>
            <div className={styles.summaryBox}>
              <span>缺失文件</span>
              <strong>{summary.missingCount}</strong>
            </div>
          </div>

          {fuzzyMatches.length > 0 ? (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>模糊匹配确认</h3>
              <p className={styles.hint}>以下目录已按“地点名包含文件夹名”自动找到候选地点。你可以取消不需要的项，确认后才会正式纳入映射。</p>
              <div className={styles.matchList}>
                {fuzzyMatches.map((item) => (
                  <label key={`${item.folderName}-${item.matchedPlaceTitle}`} className={styles.matchItem}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggleFuzzyMatch(item.folderName)}
                    />
                    <span className={styles.matchText}>
                      <strong>{item.folderName}</strong>
                      <em>匹配到</em>
                      <strong>{item.matchedPlaceTitle}</strong>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className={`${styles.card} ${!layoutEnabled ? styles.cardMuted : ''}`}>
            <div className={styles.cardHeaderRow}>
              <h3 className={styles.cardTitle}>预设</h3>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutEnabled ? styles.toggleBtnActive : ''}`}
                onClick={() => {
                  if (!layoutEnabled) {
                    const ok = window.confirm('开启预设后，确认映射时会按当前预设重新排列已匹配图片，并替代原有位置记录，是否继续？');
                    if (!ok) return;
                  }
                  setLayoutEnabled((current) => !current);
                }}
              >
                {layoutEnabled ? '已开启' : '手动开启'}
              </button>
            </div>
            <p className={styles.hint}>
              {savedRecord
                ? '检测到当前主文件夹已有记录，预设默认关闭。手动开启后，确认映射会用新预设替代原有位置记录。'
                : '未检测到当前主文件夹旧记录，可直接使用预设生成初始排列。'}
            </p>
            <div className={!layoutEnabled ? styles.disabledBlock : ''}>
            <div className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutMode === 'grid' ? styles.toggleBtnActive : ''}`}
                disabled={!layoutEnabled}
                onClick={() => setLayoutMode('grid')}
              >
                整齐排列
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutMode === 'staggered' ? styles.toggleBtnActive : ''}`}
                disabled={!layoutEnabled}
                onClick={() => setLayoutMode('staggered')}
              >
                错位排列
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${layoutMode === 'random' ? styles.toggleBtnActive : ''}`}
                disabled={!layoutEnabled}
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
                    disabled={!layoutEnabled}
                    onClick={() => setLayoutStaggerAxis('horizontal')}
                  >
                    横向错位
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${layoutStaggerAxis === 'vertical' ? styles.toggleBtnActive : ''}`}
                    disabled={!layoutEnabled}
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
                    disabled={!layoutEnabled}
                    value={layoutGapX}
                    onChange={(event) => setLayoutGapX(clampNonNegative(Number(event.target.value)))}
                  />
                </label>
                <label className={styles.field}>
                  <span>竖向距离</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!layoutEnabled}
                    value={layoutGapY}
                    onChange={(event) => setLayoutGapY(clampNonNegative(Number(event.target.value)))}
                  />
                </label>
              </div>
            ) : (
              <p className={styles.hint}>随机排列会让每张图片相对于相邻图片产生 1-100 的随机附加距离。</p>
            )}
            </div>
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
          <button className={styles.actionBtn} type="button" onClick={handleApply} disabled={!canApply}>
            确认映射
          </button>
        </div>
      </div>
    </div>
  );
}
