import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FlagConditionRowDto } from './flag-condition.dto';

/** POST body for `POST /projects/:projectKey/flags` — project key comes from the URL. */
export class CreateFlagBodyDto {
  @ApiProperty({ example: 'new-checkout', maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  key!: string;

  @ApiPropertyOptional({ example: 'Rollout description' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ type: [FlagConditionRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlagConditionRowDto)
  rules!: FlagConditionRowDto[];
}
