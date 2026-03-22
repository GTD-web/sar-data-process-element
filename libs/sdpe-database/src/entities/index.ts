/**
 * 공용 TypeORM 엔티티를 여기에 두고 data-source.ts 의 entities 배열에 포함한다.
 * 앱 전용 엔티티는 해당 앱 csc 폴더의 infrastructure 디렉터리에 둘 수 있다.
 */
import type { EntitySchema } from 'typeorm';

/** Aligns with DataSourceOptions.entities: class, path glob, or EntitySchema */
export const sdpeDatabaseEntities: Array<string | (new () => unknown) | EntitySchema> = [];
