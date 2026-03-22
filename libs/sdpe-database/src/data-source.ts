import { DataSource, type DataSourceOptions } from 'typeorm';
import { sdpeDatabaseEntities } from './entities';
import { InitSdpeSchema1730000000000 } from './migrations/1730000000000-init-sdpe-schema';

const defaultLocalUrl = 'postgresql://sdpe:sdpe@127.0.0.1:5432/sdpe';

/**
 * TypeORM CLI entry (migrations). Set DATABASE_URL or rely on local docker-compose defaults.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? defaultLocalUrl,
  entities: sdpeDatabaseEntities as DataSourceOptions['entities'],
  migrations: [InitSdpeSchema1730000000000],
  synchronize: false,
});
