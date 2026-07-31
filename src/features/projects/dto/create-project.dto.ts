import { ApiProperty } from '@nestjs/swagger';
import { IsLowercase, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
    @ApiProperty({ example: 'Partner mobile app' })
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
    name!: string;

    @ApiProperty({
        example: 'partner-mobile',
        description: 'Unique lowercase kebab-case identifier (used by SDK / clients).',
    })
    @IsString()
    @IsLowercase()
    @MinLength(1)
    @MaxLength(64)
    @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
        message: 'key must be lowercase kebab-case (letters/digits, single hyphens between segments)',
    })
    key!: string;
}
