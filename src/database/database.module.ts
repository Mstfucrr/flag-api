import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlagEntity } from './entities/flag.entity';
import { ProjectEntity } from './entities/project.entity';
import { FlagVersionEntity } from './entities/flag-version.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url', '');
        const host = config.get<string>('database.host', 'localhost');
        const port = config.get<number>('database.port', 5432);
        const username = config.get<string>('database.user', '');
        const password = config.get<string>('database.password', '');
        const database = config.get<string>('database.name', 'myapp');
        const synchronize = config.get<boolean>('database.sync', true);

        const base = {
          type: 'postgres' as const,
          entities: [ProjectEntity, FlagEntity, FlagVersionEntity],
          synchronize,
          autoLoadEntities: false,
        };

        if (url) {
          return { ...base, url };
        }
        return {
          ...base,
          host,
          port,
          username,
          password,
          database,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
