'use client';

import { useMemo, useState } from 'react';

import { buildVisibleNatureTopics, createInitialNatureViewState, enterNatureTopicShell } from './chinaNatureTopicState';
import { chinaNatureTopics } from './chinaNatureTopics';
import styles from './ChinaNatureMapRightPanel.module.css';

type ChinaNatureMapRightPanelProps = {
  styles?: Record<string, string>;
};

export function ChinaNatureMapRightPanel({ styles: shellStyles }: ChinaNatureMapRightPanelProps) {
  const topics = useMemo(() => buildVisibleNatureTopics(chinaNatureTopics), []);
  const [viewState, setViewState] = useState(() => createInitialNatureViewState(chinaNatureTopics));

  const activeTopic = viewState.activeTopicSlug
    ? topics.find((topic) => topic.topicSlug === viewState.activeTopicSlug) ?? null
    : null;

  if (viewState.mode === 'topic' && activeTopic) {
    return (
      <section className={styles.topicShell}>
        <div className={styles.topicShellCard}>
          <h2 className={styles.topicTitle}>{activeTopic.title}</h2>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setViewState({ mode: 'list', activeTopicSlug: null })}
          >
            切换专题
          </button>
        </div>
      </section>
    );
  }

  if (topics.length === 0) {
    return (
      <section className={styles.emptyState}>
        <p className={styles.emptyTitle}>暂无可展示专题</p>
        <p className={styles.emptyCopy}>启用专题后，这里会以大图卡片流展示入口。</p>
      </section>
    );
  }

  return (
    <section className={styles.topicList}>
      {topics.map((topic) => (
        <button
          key={topic.topicSlug}
          type="button"
          className={styles.heroCard}
          style={{ backgroundImage: `url(${topic.coverImageUrl})` }}
          onClick={() => setViewState((current) => enterNatureTopicShell(current, topic.topicSlug))}
        >
          <span className={styles.heroOverlay}>
            <span className={styles.heroTitle}>{topic.title}</span>
          </span>
        </button>
      ))}
      {shellStyles?.status ? <span className={styles.shellContractProbe} aria-hidden="true" /> : null}
    </section>
  );
}
