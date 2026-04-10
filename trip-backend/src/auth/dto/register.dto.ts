import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  confirmPassword: string;
}
