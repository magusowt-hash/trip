import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { isValidPhone, normalizePhone } from '../phone.util';
import { User } from '../user/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  private getSaltRounds(): number {
    const raw = process.env.AUTH_BCRYPT_SALT_ROUNDS;
    return raw ? Number(raw) : 12;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.getSaltRounds());
  }

  private signToken(user: Pick<User, 'id' | 'phone'>): string {
    return this.jwt.sign({
      sub: String(user.id),
      phone: user.phone,
    });
  }

  async register(dto: RegisterDto): Promise<{ user: { id: number; phone: string }; token: string }> {
    const phone = normalizePhone(dto.phone);
    if (!phone || !isValidPhone(phone)) {
      throw new HttpException({ error: 'Invalid phone' }, HttpStatus.BAD_REQUEST);
    }
    if (dto.password.length < 8) {
      throw new HttpException(
        { error: 'Password must be at least 8 characters' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.password !== dto.confirmPassword) {
      throw new HttpException({ error: 'Passwords do not match' }, HttpStatus.BAD_REQUEST);
    }

    const existing = await this.users.findOne({ where: { phone } });
    if (existing) {
      throw new HttpException({ error: 'Phone already registered' }, HttpStatus.CONFLICT);
    }

    const passwordHash = await this.hashPassword(dto.password);
    const entity = this.users.create({ phone, passwordHash });
    let saved: User;
    try {
      saved = await this.users.save(entity);
    } catch {
      throw new HttpException({ error: 'Registration failed' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const token = this.signToken(saved);
    return {
      user: { id: saved.id, phone: saved.phone },
      token,
    };
  }

  async login(dto: LoginDto): Promise<{ user: { id: number; phone: string }; token: string }> {
    const phone = normalizePhone(dto.phone);
    if (!phone || !isValidPhone(phone) || !dto.password) {
      throw new HttpException({ error: 'Invalid phone or password' }, HttpStatus.BAD_REQUEST);
    }

    const user = await this.users.findOne({ where: { phone } });
    if (!user) {
      throw new HttpException({ error: 'Invalid phone or password' }, HttpStatus.UNAUTHORIZED);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new HttpException({ error: 'Invalid phone or password' }, HttpStatus.UNAUTHORIZED);
    }

    const token = this.signToken(user);
    return { user: { id: user.id, phone: user.phone }, token };
  }
}
