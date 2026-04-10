'use client';

import Link from 'next/link';
import type { CommentItem } from '../types';
import { modalStyles as s } from '../styles/modalStyles';

type Props = {
  topic: string;
  title: string;
  content: string | undefined;
  author: string;
  avatar: string | undefined;
  comments: number;
  favorites: number;
  onClose: () => void;
  commentList: CommentItem[];
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onSubmitComment: () => void;
};

/**
 * 右栏：作者、正文、评论列表、互动条、输入（纵向滚动仅发生在评论列表区域）
 */
export function InfoColumn({
  topic,
  title,
  content,
  author,
  avatar,
  comments,
  favorites,
  onClose,
  commentList,
  commentText,
  onCommentTextChange,
  onSubmitComment,
}: Props) {
  return (
    <section style={s.infoPanel} aria-label="帖子信息与评论">
      <div style={s.authorRow}>
        <div style={s.authorLeft}>
          <img src={avatar || `https://i.pravatar.cc/48?u=${encodeURIComponent(author)}`} alt={author} style={s.authorAvatar} />
          <div style={{ display: 'grid', gap: 0 }}>
            <strong style={{ fontSize: 15, lineHeight: 1.2 }}>{author}</strong>
            <small style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>发布者</small>
          </div>
        </div>
        <button type="button" style={s.mapIconBtn} aria-label="在地图上查看">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 21s7-4.35 7-10a7 7 0 1 0-14 0c0 5.65 7 10 7 10z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="11" r="2.25" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div style={s.contentBlock}>
        <strong id="post-detail-modal-title" style={s.title}>
          {title}
        </strong>
        <p style={s.content}>{content || '这是帖子详情页占位内容，可接入后端后展示完整正文。'}</p>
        <div style={s.tags}>
          <Link href={`/explore?tag=${encodeURIComponent(topic)}`} style={{ color: '#2563eb' }} onClick={onClose}>
            #{topic}
          </Link>
          <span style={{ marginLeft: 8, color: '#6b7280' }}>#fyp #旅行记录</span>
        </div>
        <small style={{ display: 'block', marginTop: 8, color: 'var(--color-text-muted)' }}>02-26 四川</small>
      </div>

      <div style={s.commentCount}>共 {commentList.length} 条评论</div>

      <div style={s.commentList}>
        {commentList.map((item) => (
          <div key={item.id} style={s.commentItem}>
            <img src={item.avatar} alt={item.name} style={s.commentAvatar} />
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={s.commentName}>{item.name}</strong>
                <small style={s.commentTime}>{item.time}</small>
              </div>
              <p style={s.commentText}>{item.text}</p>
              <small style={s.commentMeta}>♡ 0 | 回复</small>
            </div>
          </div>
        ))}
      </div>

      <div style={s.interactionBar}>
        <span>♡ {favorites}</span>
        <span>☆ 26</span>
        <span>💬 {comments}</span>
        <button type="button" style={s.planBtn} aria-label="制定旅行计划">
          制定计划
        </button>
      </div>

      <div style={s.inputRow}>
        <input
          type="text"
          value={commentText}
          onChange={(e) => onCommentTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmitComment();
          }}
          placeholder="说点什么..."
          aria-label="写评论"
          style={s.input}
        />
        <button type="button" onClick={onSubmitComment} style={s.sendBtn} aria-label="发送评论">
          发送
        </button>
      </div>
    </section>
  );
}

