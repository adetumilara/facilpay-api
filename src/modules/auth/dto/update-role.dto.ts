import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];

  @IsString()
  @IsOptional()
  description?: string;
}
