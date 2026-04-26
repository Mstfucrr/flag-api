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

export class FlagFilterRowDto {
  @ApiPropertyOptional({ example: 'f-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'user.email' })
  @IsString()
  field!: string;

  @ApiProperty({
    enum: ['eq', 'neq', 'contains', 'in', 'gt', 'lt'],
    example: 'eq',
  })
  @IsString()
  @IsIn(['eq', 'neq', 'contains', 'in', 'gt', 'lt'])
  operator!: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';

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
