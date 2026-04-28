import {
  RULE_OPERATORS,
  type RuleOperator,
} from '@core-sdk/feature-flags-core';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

const OPERATOR_ENUM = RULE_OPERATORS as readonly RuleOperator[];

export class FlagFilterRowDto {
  @ApiPropertyOptional({ example: 'f-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'user.email' })
  @IsString()
  field!: string;

  @ApiProperty({
    enum: OPERATOR_ENUM,
    example: 'eq',
  })
  @IsString()
  @IsIn(OPERATOR_ENUM)
  operator!: RuleOperator;

  @ApiProperty({
    description: 'Compared value (string, number, boolean, or JSON)',
    example: 'admin',
  })
  @Allow()
  value!: unknown;
}

export class FlagConditionRowDto {
  @ApiProperty({ example: 'cond-1' })
  @IsString()
  id!: string;

  @ApiProperty({
    example: true,
    description: 'When false, condition is not evaluated',
  })
  @IsBoolean()
  active!: boolean;

  @ApiProperty({ type: [FlagFilterRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlagFilterRowDto)
  filters!: FlagFilterRowDto[];
}
