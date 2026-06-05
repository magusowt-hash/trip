'use client';

import { useMemo } from 'react';

import { buildVisibleNatureTopics } from './chinaNatureTopicState';
import { chinaNatureTopics } from './chinaNatureTopics';
import styles from './ChinaNatureMapRightPanel.module.css';

type ChinaNatureMapRightPanelProps = {
  styles?: Record<string, string>;
};

export function ChinaNatureMapRightPanel({ styles: shellStyles }: ChinaNatureMapRightPanelProps) {
  const topics = useMemo(() => buildVisibleNatureTopics(chinaNatureTopics), []);

  if (topics.length === 0) {
    return (
      <section className={styles.emptyState}>
        <p className={styles.emptyTitle}>暂无可展示项</p>
        <p className={styles.emptyCopy}>启用项后，这里会以列表形式展示入口。</p>
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
        >
          <span className={styles.topicRowTitle}>{topic.title}</span>
        </button>
      ))}
      {shellStyles?.status ? <span className={styles.shellContractProbe} aria-hidden="true" /> : null}
    </section>
  );
}
