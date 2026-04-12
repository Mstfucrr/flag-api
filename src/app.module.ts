import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import { CommonModule } from './common/common.module';
import { FlagsModule } from './flags/flags.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [databaseConfig],
    }),
    CommonModule,
    FlagsModule,
    HealthModule,
    ProjectsModule,
  ],
})
export class AppModule {}
