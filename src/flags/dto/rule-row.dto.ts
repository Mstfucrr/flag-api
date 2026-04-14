import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsBoolean, IsIn, IsString } from 'class-validator';

export class RuleRowDto {
  @ApiProperty({ example: 'rule-1' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user.role' })
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

  @ApiProperty({
    example: true,
    description: 'When false, rule is not evaluated',
  })
  @IsBoolean()
  active!: boolean;
}
