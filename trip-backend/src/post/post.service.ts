import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, PostImage, Privacy } from './post.entity';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(PostImage)
    private imageRepo: Repository<PostImage>,
  ) {}

  async findAll(topic?: string, cursor?: string, limit = 20) {
    const qb = this.postRepo.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .where('post.privacy = :privacy', { privacy: Privacy.Public });

    if (topic && topic !== '推荐') {
      qb.andWhere('post.topic = :topic', { topic });
    }

    if (cursor) {
      const [cursorCreatedAt, cursorId] = cursor.split('_');
      const cursorDate = new Date(cursorCreatedAt);
      qb.andWhere('post.createdAt < :cursorDate OR (post.createdAt = :cursorDate AND post.id < :cursorId)', {
        cursorDate,
        cursorId: parseInt(cursorId),
      });
    }

    const posts = await qb
      .orderBy('post.createdAt', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(limit + 1)
      .getMany();

    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();

    const result = await Promise.all(
      posts.map(async (post) => {
        const images = await this.imageRepo.find({ where: { postId: post.id }, order: { sortOrder: 'ASC' } });
        return {
          id: String(post.id),
          title: post.title,
          topic: post.topic,
          author: post.user?.nickname || '旅行者',
          avatar: post.user?.avatar || '',
          coverImageUrl: post.coverImageUrl || '',
          gallery: images.map((i) => i.url),
          commentsCnt: post.commentsCnt,
          favoritesCnt: post.favoritesCnt,
          createdAt: post.createdAt.toISOString(),
          cursor: `${post.createdAt.toISOString()}_${post.id}`,
        };
      }),
    );

    return {
      posts: result,
      nextCursor: hasMore ? result[result.length - 1]?.cursor : null,
      hasMore,
    };
  }

  async findById(id: number) {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!post) return null;

    const images = await this.imageRepo.find({ where: { postId: post.id }, order: { sortOrder: 'ASC' } });

    return {
      id: String(post.id),
      title: post.title,
      content: post.content,
      topic: post.topic,
      author: post.user?.nickname || '旅行者',
      avatar: post.user?.avatar || '',
      images: images.map((i) => ({
        id: String(i.id),
        url: i.url,
        caption: i.caption || '',
      })),
      commentsCnt: post.commentsCnt,
      favoritesCnt: post.favoritesCnt,
      createdAt: post.createdAt.toISOString(),
    };
  }

  async create(data: {
    userId: number;
    title: string;
    content: string;
    privacy: Privacy;
    topic: string;
    imageUrls: string[];
  }) {
    const post = this.postRepo.create({
      userId: data.userId,
      title: data.title,
      content: data.content,
      privacy: data.privacy,
      topic: data.topic || '推荐',
      coverImageUrl: data.imageUrls[0] || null,
    });
    const saved = await this.postRepo.save(post);

    const images = await Promise.all(
      data.imageUrls.map((url, idx) =>
        this.imageRepo.save({
          postId: saved.id,
          url,
          thumbnailUrl: null,
          caption: '',
          sortOrder: idx,
        }),
      ),
    );

    return {
      id: String(saved.id),
      title: saved.title,
      content: saved.content,
      topic: saved.topic,
      author: '你',
      avatar: '',
      images: images.map((i) => ({
        id: String(i.id),
        url: i.url,
        caption: i.caption || '',
      })),
      commentsCnt: 0,
      favoritesCnt: 0,
      createdAt: saved.createdAt.toISOString(),
    };
  }
}