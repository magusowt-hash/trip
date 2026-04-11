'use client';

import { useState } from 'react';
import { BottomBar } from '@/components/layout/BottomBar';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/feedback/PageState';

type DetailState = 'default' | 'loading' | 'error';

type PostPageProps = {
  params: {
    id: string;
  };
};

function getDetailTitle(state: DetailState): string {
  if (state === 'loading') {
    return 'Detail_Loading';
  }

  if (state === 'error') {
    return 'Detail_Error';
  }

  return 'Detail_Default';
}

export default function PostDetailPage({ params }: PostPageProps) {
  const [state, setState] = useState<DetailState>('default');

  return (
    <main>
      <section className="container page grid">
        <article className="card grid">
          <h2 className="page-title">{getDetailTitle(state)}</h2>
          <p className="page-desc">文章 ID: {params.id}</p>
          <div className="row">
            <Button onClick={() => setState('default')}>Default</Button>
            <Button variant="secondary" onClick={() => setState('loading')}>Loading</Button>
            <Button variant="ghost" onClick={() => setState('error')}>Error</Button>
          </div>
        </article>

        {state === 'loading' ? <LoadingState title="详情内容加载中..." /> : null}

        {state === 'error' ? (
          <ErrorState
            title="内容加载失败"
            desc="网络异常或内容不存在，请稍后重试。"
            action={<Button>重试</Button>}
          />
        ) : null}

        {state === 'default' ? (
          <article className="card grid">
            <strong>旅行攻略正文（示例）</strong>
            <p className="page-desc" style={{ margin: 0 }}>
              这里展示图文详情、交通建议和评论区入口，作为 Post_Detail 的默认内容。
            </p>
          </article>
        ) : null}
      </section>
      <BottomBar />
    </main>
  );
}
