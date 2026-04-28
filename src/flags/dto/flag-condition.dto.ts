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
    enumName: 'RuleOperator',
    example: 'eq',
    description:
      'Declarative comparison operator (aligned with @core-sdk/feature-flags-core).',
  })
  @IsString()
  @IsIn(OPERATOR_ENUM)
  operator!: RuleOperator;

  @ApiProperty({
    description:
      'Right-hand value: string, number, boolean, array, or JSON object. Meaning depends on `operator` (e.g. `in` / `notIn`: string array or list-shaped payload). For OpenAPI this field is untyped JSON.',
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
