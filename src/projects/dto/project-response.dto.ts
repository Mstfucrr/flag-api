import { ApiProperty } from '@nestjs/swagger';
import type { Project } from '../models/project.model';

export class ProjectResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty({ type: [String], example: ['dev', 'stage', 'prod'] })
  environments!: string[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export function mapProjectToResponse(entity: Project): ProjectResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    key: entity.key,
    environments: [...(entity.environments ?? [])],
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
