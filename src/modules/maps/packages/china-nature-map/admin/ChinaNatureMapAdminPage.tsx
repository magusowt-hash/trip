'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildAdminHeaders, useAdminAuth } from '@/app/management/admin-auth';
import styles from './ChinaNatureMapAdminPage.module.css';
import type { ChinaNatureAdminTopic } from '../api';

type RequestState = 'idle' | 'loading' | 'saving';
type StatusKind = 'idle' | 'info' | 'error';

type StatusMessage = {
  kind: StatusKind;
  text: string;
};

function cloneTopics(topics: ChinaNatureAdminTopic[]) {
  return topics.map((topic) => ({ ...topic }));
}

export function ChinaNatureMapAdminPage() {
  const { token } = useAdminAuth();
  const headers = useMemo(() => buildAdminHeaders(token), [token]);

  const [topics, setTopics] = useState<ChinaNatureAdminTopic[]>([]);
  const [requestState, setRequestState] = useState<RequestState>('loading');
  const [status, setStatus] = useState<StatusMessage>({ kind: 'idle', text: '' });

  useEffect(() => {
    let cancelled = false;

    async function loadTopics() {
      setRequestState('loading');
      setStatus({ kind: 'idle', text: '' });

      try {
        const response = await fetch('/api/admin/maps/china-nature/topics', {
          headers,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? '加载项失败');
        }

        if (!cancelled) {
          setTopics(Array.isArray(data?.topics) ? cloneTopics(data.topics) : []);
          setRequestState('idle');
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            kind: 'error',
            text: error instanceof Error ? error.message : '加载项失败',
          });
          setRequestState('idle');
        }
      }
    }

    void loadTopics();

    return () => {
      cancelled = true;
    };
  }, [headers]);

  const updateTopic = (topicSlug: string, patch: Partial<ChinaNatureAdminTopic>) => {
    setTopics((current) => current.map((topic) => (
      topic.topicSlug === topicSlug ? { ...topic, ...patch } : topic
    )));
  };

  const handleSave = async () => {
    setRequestState('saving');
    setStatus({ kind: 'idle', text: '' });

    try {
      const response = await fetch('/api/admin/maps/china-nature/topics', {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topics }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? '保存项失败');
      }

      setTopics(Array.isArray(data?.topics) ? cloneTopics(data.topics) : []);
      setStatus({ kind: 'info', text: '项已保存' });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : '保存项失败',
      });
    } finally {
      setRequestState('idle');
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>中国自然地图项管理</h1>
        <p className={styles.subtitle}>轻量维护标题、排序和启停状态。</p>
      </header>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSave}
          disabled={requestState !== 'idle'}
        >
          {requestState === 'saving' ? '保存中...' : '保存项'}
        </button>
        <div
          className={`${styles.status} ${status.kind === 'error' ? styles.statusError : ''}`.trim()}
        >
          {requestState === 'loading' ? '加载中...' : status.text}
        </div>
      </div>

      {topics.length === 0 && requestState !== 'loading' ? (
        <div className={styles.empty}>当前没有可管理的项。</div>
      ) : (
        <div className={styles.grid}>
          {topics.map((topic) => (
            <article key={topic.topicSlug} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.slug}>{topic.topicSlug}</span>
                <span className={topic.isEnabled ? styles.enabledBadge : styles.disabledBadge}>
                  {topic.isEnabled ? '已启用' : '已停用'}
                </span>
              </div>

              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>标题</span>
                  <input
                    className={styles.textInput}
                    value={topic.title}
                    onChange={(event) => updateTopic(topic.topicSlug, { title: event.target.value })}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>排序</span>
                  <input
                    className={styles.numberInput}
                    type="number"
                    value={topic.sortOrder}
                    onChange={(event) => updateTopic(topic.topicSlug, {
                      sortOrder: Number.parseInt(event.target.value, 10) || 0,
                    })}
                  />
                </label>

                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={topic.isEnabled}
                    onChange={(event) => updateTopic(topic.topicSlug, { isEnabled: event.target.checked })}
                  />
                  启用项
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
