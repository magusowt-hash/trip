import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum Gender {
  Unknown = 0,
  Male = 1,
  Female = 2,
  Other = 3,
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  phone: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'nickname', type: 'varchar', length: 64, nullable: true })
  nickname: string | null;

  @Column({ name: 'avatar', type: 'longtext', nullable: true })
  avatar: string | null;

  @Column({ type: 'tinyint', default: Gender.Unknown })
  gender: Gender;

  @Column({ name: 'birthday', type: 'date', nullable: true })
  birthday: Date | null;

  @Column({ name: 'region', type: 'varchar', length: 128, nullable: true })
  region: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
