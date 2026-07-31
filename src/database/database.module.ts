import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlagEntity } from './entities/flag.entity';
import { ProjectEntity } from './entities/project.entity';
import { FlagVersionEntity } from './entities/flag-version.entity';
import { RequestLogEntity } from './entities/request-log.entity';
import {
  buildTypeOrmConnectionOptions,
  type TypeOrmConnectionEnv,
} from './typeorm-connection';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env: TypeOrmConnectionEnv = {
          url: config.get<string>('database.url', ''),
          host: config.get<string>('database.host', 'localhost'),
          port: config.get<number>('database.port', 5432),
          user: config.get<string>('database.user', ''),
          password: config.get<string>('database.password', ''),
          name: config.get<string>('database.name', 'myapp'),
          poolMax: config.get<number>('database.poolMax', 20),
          poolConnectionTimeoutMs: config.get<number>(
            'database.poolConnectionTimeoutMs',
            5000,
          ),
        };
        const synchronize = config.get<boolean>('database.sync', false);

        return {
          type: 'postgres' as const,
          entities: [
            ProjectEntity,
            FlagEntity,
            FlagVersionEntity,
            RequestLogEntity,
          ],
          synchronize,
          autoLoadEntities: false,
          ...buildTypeOrmConnectionOptions(env),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
