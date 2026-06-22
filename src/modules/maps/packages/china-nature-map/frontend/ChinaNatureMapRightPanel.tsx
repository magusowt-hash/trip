'use client';

import type { NatureTopicDatasetItem, NatureTopicItem } from './chinaNatureTopics';
import type { NatureViewState } from './chinaNatureTopicState';

import styles from './ChinaNatureMapRightPanel.module.css';

type ChinaNatureMapRightPanelProps = {
  styles?: Record<string, string>;
  topics: NatureTopicItem[];
  viewState: NatureViewState;
  activeTopicTitle: string | null;
  items: NatureTopicDatasetItem[];
  selectedItemId: string | null;
  onEnterTopic: (topicSlug: string) => void;
  onBackToList: () => void;
  onItemSelect: (itemId: string) => void;
};

export function ChinaNatureMapRightPanel({
  styles: shellStyles,
  topics,
  viewState,
  activeTopicTitle,
  items,
  selectedItemId,
  onEnterTopic,
  onBackToList,
  onItemSelect,
}: ChinaNatureMapRightPanelProps) {
  if (topics.length === 0) {
    return (
      <section className={styles.emptyState}>
        <p className={styles.emptyTitle}>暂无可展示项</p>
        <p className={styles.emptyCopy}>启用项后，这里会以列表形式展示入口。</p>
      </section>
    );
  }

  if (viewState.mode === 'topic') {
    return (
      <section className={styles.topicDetail}>
        <div className={styles.topicHeader}>
          <button type="button" className={styles.backButton} onClick={onBackToList}>
            返回专题
          </button>
          <div className={styles.topicHeaderText}>
            <p className={styles.topicEyebrow}>中国自然地图</p>
            <h2 className={styles.topicHeading}>{activeTopicTitle ?? '专题地图'}</h2>
            <p className={styles.topicSummary}>根据表格导入 {items.length} 个海岛点位，点击条目可定位到地图。</p>
          </div>
        </div>

        <div className={styles.itemList}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.itemCard} ${selectedItemId === item.id ? styles.itemCardActive : ''}`}
              onClick={() => onItemSelect(item.id)}
            >
              <div className={styles.itemRank}>{item.rank}</div>
              <div className={styles.itemBody}>
                <p className={styles.itemTitle}>{item.name}</p>
                <p className={styles.itemMeta}>{item.locationLabel}</p>
                <p className={styles.itemCoord}>
                  {item.lat.toFixed(6)}N · {item.lng.toFixed(6)}E
                </p>
              </div>
            </button>
          ))}
        </div>
        {shellStyles?.status ? <span className={styles.shellContractProbe} aria-hidden="true" /> : null}
      </section>
    );
  }

  return (
    <section className={styles.topicList}>
      {topics.map((topic) => (
        <button
          key={topic.topicSlug}
          type="button"
          className={styles.topicRow}
          onClick={() => onEnterTopic(topic.topicSlug)}
        >
          <span className={styles.topicRowIcon} aria-hidden="true">{topic.icon}</span>
          <span className={styles.topicRowText}>
            <span className={styles.topicRowTitle}>{topic.title}</span>
            <span className={styles.topicRowMeta}>
              {topic.topicSlug === 'island' ? '已接入 30 个海岛点位' : '专题壳已创建，数据待补充'}
            </span>
          </span>
        </button>
      ))}
      {shellStyles?.status ? <span className={styles.shellContractProbe} aria-hidden="true" /> : null}
    </section>
  );
}
