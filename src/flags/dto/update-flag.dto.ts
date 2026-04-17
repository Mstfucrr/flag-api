import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateFlagDto {
  @ApiPropertyOptional({ example: 'renamed-flag-key' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: [RuleRowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleRowDto)
  rules?: RuleRowDto[];
}
