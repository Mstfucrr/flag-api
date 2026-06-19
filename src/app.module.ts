import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import flagsConfig from './config/flags.config';
import redisConfig from './config/redis.config';
import { DatabaseModule } from './database/database.module';
import { FlagsModule } from './flags/flags.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { RedisModule } from './redis/redis.module';
import { ThrottlingModule } from './throttling/throttling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [databaseConfig, redisConfig, flagsConfig],
    }),
    RedisModule,
    ThrottlingModule,
    DatabaseModule,
    FlagsModule,
    HealthModule,
    ProjectsModule,
  ],
})
export class AppModule {}
