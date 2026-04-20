import { DataSource, type DataSourceOptions } from 'typeorm';
import { sdpeDatabaseEntities } from './entities';
import { InitSdpeSchema1730000000000 } from './migrations/1730000000000-init-sdpe-schema';

const defaultLocalUrl = 'postgresql://sdpe:sdpe@127.0.0.1:5432/sdpe';

/**
 * TypeORM CLI 및 마이그레이션용 DataSource 설정.
 * DATABASE_URL 환경변수가 없으면 로컬 docker-compose 기본값을 사용한다.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? defaultLocalUrl,
  entities: sdpeDatabaseEntities as DataSourceOptions['entities'],
  migrations: [InitSdpeSchema1730000000000],
  synchronize: false,
});
