'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  createdAt?: string;
  onClose: () => void;
  commentList: CommentItem[];
  loading?: boolean;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onSubmitComment: () => void;
  onFavoriteClick?: () => void;
  onCommentLike?: (commentId: string) => Promise<void>;
  onReplyClick?: (commentId: string, author: string) => void;
  replyingTo?: string | null;
};

export function InfoColumn({
  topic,
  title,
  content,
  author,
  avatar,
  comments,
  favorites,
  createdAt,
  onClose,
  commentList,
  loading,
  commentText,
  onCommentTextChange,
  onSubmitComment,
  onFavoriteClick,
  onReplyClick,
  replyingTo,
}: Props) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return null;
    }
  };

  const formatCommentTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return date.toLocaleDateString('zh-CN');
    } catch {
      return '';
    }
  };

const dateStr = formatDate(createdAt);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  
  const getChildComments = (parentId: string): CommentItem[] => {
    return commentList.filter(c => c.parentId === parentId);
  };
  
  const getAuthorName = (parentId: string) => {
    return commentList.find(c => c.id === parentId)?.author || '';
  };
  
  const toggleExpand = (parentId: string) => {
    const newSet = new Set(expandedParents);
    if (newSet.has(parentId)) {
      newSet.delete(parentId);
    } else {
      newSet.add(parentId);
    }
    setExpandedParents(newSet);
  };

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
        <p style={s.content}>{content || ''}</p>
        <div style={s.tags}>
          <Link href={`/explore?tag=${encodeURIComponent(topic)}`} style={{ color: '#2563eb' }} onClick={onClose}>
            #{topic}
          </Link>
        </div>
        {dateStr && <small style={{ display: 'block', marginTop: 8, color: 'var(--color-text-muted)' }}>{dateStr}</small>}
      </div>

      <div style={s.commentCount}>共 {commentList.length} 条评论</div>

      <div style={{ ...s.commentList, display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-muted)' }}>加载中...</div>
        ) : commentList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-muted)' }}>暂无评论，快来抢沙发吧</div>
        ) : (
          <>
            {(() => {
              const parents = commentList.filter(c => !c.parentId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              return parents.map(parent => {
                const children = getChildComments(parent.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                const isExpanded = expandedParents.has(parent.id);
                return (
                  <div key={parent.id} style={{ display: 'flex', flexDirection: 'column' }}>
                    <CommentNode
                      comment={parent}
                      isParent={true}
                      getAuthorName={getAuthorName}
                      children={children}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleExpand(parent.id)}
                      onReplyClick={onReplyClick}
                      formatCommentTime={formatCommentTime}
                    />
                    {children.length > 0 && isExpanded && (
                      <div style={{ 
                        paddingLeft: '16px',
                        marginLeft: '18px',
                      }}>
                        {children.map(child => (
                          <CommentNode
                            key={child.id}
                            comment={child}
                            isParent={false}
                            getAuthorName={getAuthorName}
                            children={[]}
                            isExpanded={false}
                            onToggleExpand={() => {}}
                            onReplyClick={onReplyClick}
                            formatCommentTime={formatCommentTime}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </>
        )}
      </div>

      <div style={s.interactionRow}>
        <button type="button" style={s.likeBtn} onClick={onFavoriteClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{favorites}</span>
        </button>
        <button type="button" style={s.commentBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{comments}</span>
        </button>
      </div>

      {replyingTo && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--color-bg-subtle)',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 14,
        }}>
          <span style={{ color: 'var(--color-text-muted)' }}>
            回复 @{commentList.find(c => c.id === replyingTo)?.author || '用户'}
          </span>
          <button
            type="button"
            onClick={() => onReplyClick && onReplyClick('', '')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            取消
          </button>
        </div>
      )}
      
      <div style={s.inputRow}>
        <input
          type="text"
          placeholder={replyingTo ? `回复 @${commentList.find(c => c.id === replyingTo)?.author || '用户'}...` : "说点什么..."}
          value={commentText}
          onChange={(e) => onCommentTextChange(e.target.value)}
          style={s.commentInput}
          onKeyDown={(e) => e.key === 'Enter' && onSubmitComment()}
        />
        <button type="button" onClick={onSubmitComment} style={s.sendBtn}>
          发送
        </button>
      </div>
    </section>
  );
}

type CommentNodeProps = {
  comment: CommentItem;
  isParent: boolean;
  getAuthorName: (parentId: string) => string;
  children: CommentItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onReplyClick?: (commentId: string, author: string) => void;
  formatCommentTime: (dateStr?: string) => string;
};

function CommentNode({
  comment,
  isParent,
  getAuthorName,
  children,
  isExpanded,
  onToggleExpand,
  onReplyClick,
  formatCommentTime,
}: CommentNodeProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  
  const handleLikeClick = () => {
    if (liked) {
      setLikeCount(prev => prev - 1);
    } else {
      setLikeCount(prev => prev + 1);
    }
    setLiked(!liked);
  };
  
  const commentStyle: React.CSSProperties = {
    display: 'flex',
    padding: '8px 16px',
    borderBottom: 'none',
    backgroundColor: 'transparent',
  };
  
  const avatarStyle: React.CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    marginRight: '12px',
    flexShrink: 0,
  };
  
  const contentStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };
  
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4px',
  };
  
  const usernameStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: '14px',
    color: '#333',
  };
  
  const replyToStyle: React.CSSProperties = {
    fontWeight: 400,
    fontSize: '13px',
    color: '#999',
    marginLeft: '4px',
  };
  
  const timeStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#999',
    whiteSpace: 'nowrap',
    marginLeft: '8px',
  };
  
  const textStyle: React.CSSProperties = {
    fontSize: '14px',
    lineHeight: 1.4,
    color: '#333',
    marginBottom: '8px',
    wordBreak: 'break-word',
  };
  
  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '8px',
  };
  
  const actionButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '0',
  };
  
  const likeIconStyle: React.CSSProperties = {
    width: '16px',
    height: '16px',
    fill: 'none',
    stroke: '#666',
    strokeWidth: '2',
  };
  
  const replyToggleStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '0',
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };
  
  const parentId = comment.parentId;
  const replyToAuthor = isParent ? null : (parentId ? getAuthorName(parentId) : null);
  
  return (
    <div style={commentStyle}>
      <img
        src={comment.avatar || `https://i.pravatar.cc/40?u=${encodeURIComponent(comment.author)}`}
        alt={comment.author}
        style={avatarStyle}
      />
      <div style={contentStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={usernameStyle}>{comment.author}</span>
            {replyToAuthor && (
              <span style={replyToStyle}>回复 @{replyToAuthor}</span>
            )}
            <span style={timeStyle}>{formatCommentTime(comment.createdAt)}</span>
          </div>
        </div>
        
        <div style={textStyle}>{comment.content}</div>
        
        <div style={actionsStyle}>
          <button type="button" style={actionButtonStyle} onClick={handleLikeClick}>
            <svg style={{ ...likeIconStyle, fill: liked ? '#ff2442' : 'none', stroke: liked ? '#ff2442' : '#666' }} viewBox="0 0 24 24">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span style={{ color: liked ? '#ff2442' : '#666' }}>{likeCount}</span>
          </button>
          
          {onReplyClick && (
            <button
              type="button"
              style={actionButtonStyle}
              onClick={() => onReplyClick(comment.id, comment.author)}
            >
              回复
            </button>
          )}
        </div>
        
        {isParent && children.length > 0 && (
          <button
            type="button"
            style={replyToggleStyle}
            onClick={onToggleExpand}
          >
            {isExpanded ? '收起回复' : `展开${children.length}条回复`}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}