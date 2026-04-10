import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Friend } from './friend.entity';
import { User } from '../user/user.entity';

@Injectable()
export class FriendService {
  constructor(
    @InjectRepository(Friend)
    private readonly friends: Repository<Friend>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async addFriend(userId: number, friendId: number): Promise<boolean> {
    if (userId === friendId) {
      return false;
    }

    const existing = await this.friends.findOne({
      where: { userId, friendId },
    });
    if (existing) {
      return false;
    }

    const friendship = this.friends.create({ userId, friendId });
    await this.friends.save(friendship);
    return true;
  }

  async areFriends(userId: number, friendId: number): Promise<boolean> {
    const friendship = await this.friends.findOne({
      where: { userId, friendId },
    });
    return !!friendship;
  }

  async getFriends(userId: number): Promise<number[]> {
    const friendRecords = await this.friends.find({ where: { userId }, select: ['friendId'] });
    return friendRecords.map((f) => f.friendId);
  }

  async getFriendList(userId: number): Promise<{ id: number; nickname: string; avatar: string | null }[]> {
    const friendRecords = await this.friends.find({ where: { userId }, select: ['friendId'] });
    const friendIds = friendRecords.map((f) => f.friendId);

    if (friendIds.length === 0) {
      return [];
    }

    const friendUsers = await this.users.find({
      where: { id: In(friendIds) },
      select: ['id', 'nickname', 'avatar'],
    });

    return friendUsers.map((u) => ({
      id: u.id,
      nickname: u.nickname || `用户${u.id}`,
      avatar: u.avatar,
    }));
  }
}
