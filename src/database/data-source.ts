import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { FlagEntity } from './entities/flag.entity';
import { FlagVersionEntity } from './entities/flag-version.entity';
import { ProjectEntity } from './entities/project.entity';
import { RequestLogEntity } from './entities/request-log.entity';
import { buildTypeOrmConnectionOptions, readTypeOrmConnectionEnvFromProcess } from './typeorm-connection';

// `ConfigModule.forRoot`'un okuduğu dosyalarla aynı sıra (app.module.ts).
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

/**
 * TypeORM CLI'ın kullandığı DataSource (Nest DI'sız): migration üretme/çalıştırma
 * için. `synchronize: false` — migration akışı hiçbir zaman auto-sync kullanmaz.
 *
 *   npm run migration:generate -- src/database/migrations/İsim
 *   npm run migration:run
 *   npm run migration:revert
 */
export default new DataSource({
    type: 'postgres',
    entities: [ProjectEntity, FlagEntity, FlagVersionEntity, RequestLogEntity],
    migrations: ['src/database/migrations/*.ts'],
    synchronize: false,
    ...buildTypeOrmConnectionOptions(readTypeOrmConnectionEnvFromProcess()),
});
