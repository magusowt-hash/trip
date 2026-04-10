import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User, Gender } from './user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

export type UserProfile = Pick<User, 'id' | 'phone' | 'nickname' | 'avatar' | 'gender' | 'birthday' | 'region'>;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findById(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async getProfile(id: number): Promise<UserProfile | null> {
    const user = await this.findById(id);
    if (!user) return null;
    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      gender: user.gender,
      birthday: user.birthday,
      region: user.region,
    };
  }

  async updateProfile(id: number, dto: UpdateProfileDto): Promise<UserProfile> {
    const user = await this.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const updates: Partial<typeof user> = {};
    if (dto.nickname !== undefined) updates.nickname = dto.nickname || null;
    if (dto.avatar !== undefined) updates.avatar = dto.avatar || null;
    if (dto.gender !== undefined) updates.gender = dto.gender ?? Gender.Unknown;
    if (dto.birthday !== undefined) updates.birthday = dto.birthday ? new Date(dto.birthday) : null;
    if (dto.region !== undefined) updates.region = dto.region || null;

    Object.assign(user, updates);
    await this.users.save(user);
    return this.getProfile(id) as Promise<UserProfile>;
  }

  async searchUsers(keyword: string, excludeId: number): Promise<{ id: number; nickname: string; avatar: string | null }[]> {
    const users = await this.users.find({
      where: [
        { nickname: Like(`%${keyword}%`) },
        { phone: Like(`%${keyword}%`) },
      ],
      take: 20,
    });
    return users
      .filter((u) => u.id !== excludeId)
      .map((u) => ({
        id: u.id,
        nickname: u.nickname || `用户${u.id}`,
        avatar: u.avatar,
      }));
  }
}
