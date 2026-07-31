import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './common/logging/audit.interceptor';
import databaseConfig from './config/database.config';
import flagsConfig from './config/flags.config';
import redisConfig from './config/redis.config';
import { DatabaseModule } from './database/database.module';
import { FlagsModule } from './features/flags/flags.module';
import { HealthModule } from './features/health/health.module';
import { ProjectsModule } from './features/projects/projects.module';
import { RedisModule } from './repository/redis/redis.module';
import { ThrottlingModule } from './common/throttling/throttling.module';

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
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: AuditInterceptor,
        },
    ],
})
export class AppModule {}
