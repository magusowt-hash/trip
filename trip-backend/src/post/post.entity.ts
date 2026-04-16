import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../user/user.entity';

export enum Privacy {
  Public = 'public',
  Private = 'private',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'enum', enum: Privacy, default: Privacy.Public })
  privacy: Privacy;

  @Column({ type: 'varchar', length: 64, default: '推荐' })
  topic: string;

  @Column({ name: 'cover_image_url', type: 'longtext', nullable: true })
  coverImageUrl: string | null;

  @Column({ name: 'comments_cnt', type: 'int', default: 0 })
  commentsCnt: number;

  @Column({ name: 'favorites_cnt', type: 'int', default: 0 })
  favoritesCnt: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}

@Entity('post_images')
export class PostImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'post_id' })
  postId: number;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ type: 'longtext' })
  url: string;

  @Column({ type: 'longtext', nullable: true })
  caption: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'thumbnail_url', type: 'longtext', nullable: true })
  thumbnailUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}