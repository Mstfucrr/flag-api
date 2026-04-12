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
import { RuleRowDto } from './rule-row.dto';

export class CreateFlagDto {
  @ApiProperty({ example: 'portal-client-a', description: 'Portal project key — flags are isolated per project' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  projectKey!: string;

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

  @ApiProperty({ type: [RuleRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleRowDto)
  rules!: RuleRowDto[];

  @ApiPropertyOptional({ example: 'Initial create' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summaryNote?: string;
}
