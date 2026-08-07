import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsObject,
    IsOptional,
    IsString,
    MinLength,
    ValidateNested,
} from 'class-validator';

/** Tek bir bağlam grubu: kendi `context`'i ve o bağlamda değerlendirilecek flag anahtarları. */
export class EvaluateBatchGroupDto {
    @ApiProperty({
        example: 'ctx-row-42',
        description:
            "İstemcinin ürettiği grup kimliği; response'ta aynen geri döner (context eşliğinde eşleştirme için).",
    })
    @IsString()
    @MinLength(1)
    id!: string;

    @ApiProperty({
        type: String,
        isArray: true,
        example: ['show_live_support_chat'],
        description: 'Bu bağlamda değerlendirilecek flag anahtarları',
    })
    @IsArray()
    @IsString({ each: true })
    flagKeys!: string[];

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
        example: { accountId: '9742948' },
        description: 'Bu gruba özel runtime bağlamı',
    })
    @IsOptional()
    @IsObject()
    context?: Record<string, unknown>;
}

export class EvaluateBatchBodyDto {
    @ApiProperty({
        type: [EvaluateBatchGroupDto],
        description:
            'Farklı bağlamlarda aynı (veya farklı) flag anahtarlarının tek istekte değerlendirilmesi için grup listesi',
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => EvaluateBatchGroupDto)
    groups!: EvaluateBatchGroupDto[];
}
