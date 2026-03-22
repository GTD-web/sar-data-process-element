---
name: sdpe-server-dev
description: "SDPE 서버 개발자용 코딩 스킬. Nest.js + TypeScript 기반의 4-레이어 아키텍처(Infrastructure / Interface / Use Case / Algorithm 호출)로 CSC 모듈을 구현할 때 사용한다. 트리거: Nest.js 모듈 생성, Repository 작성, DTO 작성, Service 작성, Controller 작성, pgmq 큐 연동, API 엔드포인트 구현, CSC 코드 작성, 파이프라인 서비스 구현. 알고리즘 함수 자체 구현은 sdpe-algorithm-dev 스킬을 사용한다."
---

# SDPE 서버 개발자 코딩 스킬

## 1. 아키텍처 원칙

SDPE 서버 코드는 **4개 계층**으로 구성된다. 각 계층은 바로 아래 계층에만 의존한다.

```
Controller          ← HTTP 요청 수신, DTO 변환
    ↓
Use Case (Service)  ← 비즈니스 흐름 제어, Algorithm 호출
    ↓
Interface (DTO/Schema) ← 입출력 타입 정의, 유효성 검증
    ↓
Infrastructure (Repository) ← DB, NAS, pgmq 접근
```

Algorithm Layer(Python/C/C++)는 Use Case에서 subprocess 또는 gRPC로 호출한다.
Algorithm 코드 자체는 서버 개발자가 작성하지 않는다.

---

## 2. 프로젝트 디렉토리 구조

```
src/
├── csc01-common/               # CSC별 모듈 디렉토리
│   ├── csc01-common.module.ts
│   ├── infrastructure/
│   │   ├── db.repository.ts
│   │   └── nas.repository.ts
│   ├── interface/
│   │   ├── create-product.dto.ts
│   │   └── product-response.dto.ts
│   ├── use-case/
│   │   └── processing.service.ts
│   └── controller/
│       └── product.controller.ts
├── csc06-pipeline/
│   ├── infrastructure/
│   │   └── queue.repository.ts   # pgmq 연동
│   └── use-case/
│       └── pipeline.service.ts
└── shared/
    ├── entities/
    └── exceptions/
```

---

## 3. 계층별 코드 패턴

### 3.1 Infrastructure Layer — Repository

DB, NAS, pgmq 접근을 담당한다. 비즈니스 로직 없음.

```typescript
// infrastructure/product.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SarProductEntity } from '../entities/sar-product.entity';

@Injectable()
export class ProductRepository {
  constructor(
    @InjectRepository(SarProductEntity)
    private readonly repo: Repository<SarProductEntity>,
  ) {}

  async findById(id: string): Promise<SarProductEntity | null> {
    return this.repo.findOneBy({ id });
  }

  async save(entity: SarProductEntity): Promise<SarProductEntity> {
    return this.repo.save(entity);
  }

  // 공간 쿼리 — PostGIS 활용
  async findByBbox(minLon: number, minLat: number, maxLon: number, maxLat: number) {
    return this.repo
      .createQueryBuilder('p')
      .where('ST_Intersects(p.footprint, ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326))', {
        minLon, minLat, maxLon, maxLat,
      })
      .getMany();
  }
}
```

### 3.2 Infrastructure Layer — pgmq Queue Repository

```typescript
// infrastructure/queue.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface QueueMessage<T> {
  msgId: number;
  readCt: number;
  enqueuedAt: Date;
  vt: Date;
  message: T;
}

@Injectable()
export class QueueRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // 메시지 발행
  async send<T>(queueName: string, payload: T): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT * FROM pgmq.send($1, $2::jsonb)`,
      [queueName, JSON.stringify(payload)],
    );
    return result[0].send as number;
  }

  // 메시지 읽기 (visibility timeout 적용)
  async read<T>(queueName: string, vt: number = 30, qty: number = 1): Promise<QueueMessage<T>[]> {
    return this.dataSource.query(
      `SELECT * FROM pgmq.read($1, $2, $3)`,
      [queueName, vt, qty],
    );
  }

  // 처리 완료 후 메시지 삭제
  async delete(queueName: string, msgId: number): Promise<void> {
    await this.dataSource.query(
      `SELECT pgmq.delete($1, $2)`,
      [queueName, msgId],
    );
  }

  // 처리 실패 시 가시성 시간 초기화 (재시도 가능 상태로 복구)
  async setVisibilityTimeout(queueName: string, msgId: number, vt: number): Promise<void> {
    await this.dataSource.query(
      `SELECT pgmq.set_vt($1, $2, $3)`,
      [queueName, msgId, vt],
    );
  }
}
```

### 3.3 Interface Layer — DTO

입출력 타입 정의 및 유효성 검증. class-validator 사용.

```typescript
// interface/create-processing-job.dto.ts
import { IsString, IsEnum, IsNotEmpty } from 'class-validator';

export enum ProcessingLevel {
  LEVEL_0 = 'LEVEL_0',
  LEVEL_1 = 'LEVEL_1',
  LEVEL_2 = 'LEVEL_2',
  LEVEL_3 = 'LEVEL_3',
}

export class CreateProcessingJobDto {
  @IsString()
  @IsNotEmpty()
  readonly rawDataPath: string;

  @IsEnum(ProcessingLevel)
  readonly targetLevel: ProcessingLevel;

  @IsString()
  @IsNotEmpty()
  readonly satelliteId: string;
}

// interface/product-response.dto.ts
export class ProductResponseDto {
  readonly id: string;
  readonly level: ProcessingLevel;
  readonly footprint: GeoJSON.Geometry;
  readonly createdAt: Date;

  constructor(entity: SarProductEntity) {
    this.id = entity.id;
    this.level = entity.level;
    this.footprint = entity.footprint;
    this.createdAt = entity.createdAt;
  }
}
```

### 3.4 Use Case Layer — Service

비즈니스 흐름 제어. Repository와 Algorithm 호출 조율.

```typescript
// use-case/pipeline.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { QueueRepository } from '../infrastructure/queue.repository';
import { ProductRepository } from '../infrastructure/product.repository';
import { CreateProcessingJobDto } from '../interface/create-processing-job.dto';
import { AlgorithmRunner } from '../interface/algorithm-runner.interface';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private static readonly QUEUE_NAME = 'sdpe.processing';

  constructor(
    private readonly queueRepo: QueueRepository,
    private readonly productRepo: ProductRepository,
    private readonly algorithmRunner: AlgorithmRunner,
  ) {}

  // 처리 작업 큐 등록
  async enqueueJob(dto: CreateProcessingJobDto): Promise<number> {
    const msgId = await this.queueRepo.send(PipelineService.QUEUE_NAME, dto);
    this.logger.log(`Job enqueued: msgId=${msgId}, path=${dto.rawDataPath}`);
    return msgId;
  }

  // 큐에서 작업 소비 및 처리
  async processNextJob(): Promise<void> {
    const messages = await this.queueRepo.read<CreateProcessingJobDto>(
      PipelineService.QUEUE_NAME,
      30,  // visibility timeout: 30초
      1,
    );
    if (messages.length === 0) return;

    const msg = messages[0];
    try {
      // Algorithm Layer 호출 (Python subprocess / gRPC)
      const result = await this.algorithmRunner.run(msg.message);
      await this.productRepo.save(result);
      await this.queueRepo.delete(PipelineService.QUEUE_NAME, msg.msgId);
      this.logger.log(`Job completed: msgId=${msg.msgId}`);
    } catch (error) {
      this.logger.error(`Job failed: msgId=${msg.msgId}`, error);
      // visibility timeout 초기화 → 재시도 가능 상태로 복구
      await this.queueRepo.setVisibilityTimeout(PipelineService.QUEUE_NAME, msg.msgId, 0);
    }
  }
}
```

### 3.5 Controller Layer

HTTP 요청 수신, DTO 변환, 응답 반환. 비즈니스 로직 없음.

```typescript
// controller/pipeline.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { PipelineService } from '../use-case/pipeline.service';
import { CreateProcessingJobDto } from '../interface/create-processing-job.dto';
import { ProductResponseDto } from '../interface/product-response.dto';

@Controller('v1/processing')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('jobs')
  async createJob(@Body() dto: CreateProcessingJobDto): Promise<{ msgId: number }> {
    const msgId = await this.pipelineService.enqueueJob(dto);
    return { msgId };
  }

  @Get('jobs/:id/status')
  async getJobStatus(@Param('id') id: string): Promise<ProductResponseDto> {
    return this.pipelineService.getStatus(id);
  }
}
```

---

## 4. Algorithm Layer 호출 패턴

서버 개발자는 Algorithm 함수를 직접 구현하지 않는다.
**인터페이스를 정의하고**, 실제 구현은 알고리즘 개발자가 채운다.

### 4.1 인터페이스 정의 (서버 개발자 작성)

```typescript
// interface/algorithm-runner.interface.ts
import { SarProductEntity } from '../entities/sar-product.entity';
import { CreateProcessingJobDto } from './create-processing-job.dto';

export interface IAlgorithmRunner {
  run(job: CreateProcessingJobDto): Promise<SarProductEntity>;
}

export const ALGORITHM_RUNNER = Symbol('ALGORITHM_RUNNER');
```

### 4.2 Mock 구현 (개발 중 병렬 작업용)

```typescript
// infrastructure/mock-algorithm-runner.ts
import { Injectable } from '@nestjs/common';
import { IAlgorithmRunner } from '../interface/algorithm-runner.interface';

@Injectable()
export class MockAlgorithmRunner implements IAlgorithmRunner {
  async run(job: CreateProcessingJobDto): Promise<SarProductEntity> {
    // 알고리즘 완성 전까지 고정 결과 반환
    return { id: 'mock-001', level: job.targetLevel, createdAt: new Date() } as any;
  }
}
```

### 4.3 실제 Python subprocess 연동 구현

```typescript
// infrastructure/python-algorithm-runner.ts
import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class PythonAlgorithmRunner implements IAlgorithmRunner {
  async run(job: CreateProcessingJobDto): Promise<SarProductEntity> {
    const { stdout } = await execFileAsync('python3', [
      'algorithms/run.py',
      '--input', job.rawDataPath,
      '--level', job.targetLevel,
    ]);
    return JSON.parse(stdout) as SarProductEntity;
  }
}
```

---

## 5. 모듈 구성

```typescript
// csc06-pipeline.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PipelineController } from './controller/pipeline.controller';
import { PipelineService } from './use-case/pipeline.service';
import { QueueRepository } from './infrastructure/queue.repository';
import { ProductRepository } from './infrastructure/product.repository';
import { PythonAlgorithmRunner } from './infrastructure/python-algorithm-runner';
import { ALGORITHM_RUNNER } from './interface/algorithm-runner.interface';
import { SarProductEntity } from './entities/sar-product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SarProductEntity])],
  controllers: [PipelineController],
  providers: [
    PipelineService,
    QueueRepository,
    ProductRepository,
    { provide: ALGORITHM_RUNNER, useClass: PythonAlgorithmRunner },
  ],
  exports: [PipelineService],
})
export class Csc06PipelineModule {}
```

---

## 6. 네이밍 빠른 참조

| 대상 | 규칙 | 예시 |
|---|---|---|
| 클래스 | PascalCase | `ProductRepository`, `PipelineService` |
| 인터페이스 | PascalCase + I 접두사 | `IAlgorithmRunner` |
| 파일명 | kebab-case.[역할].ts | `product.repository.ts` |
| 메서드/변수 | camelCase | `findById()`, `rawDataPath` |
| 상수 | UPPER_SNAKE_CASE | `QUEUE_NAME`, `ALGORITHM_RUNNER` |
| 비공개 멤버 | #camelCase | `#internalBuffer` |
| Enum 값 | UPPER_SNAKE_CASE | `LEVEL_0`, `LEVEL_1` |

---

## 7. 체크리스트 — 새 모듈 추가 시

- [ ] 디렉토리 구조가 `infrastructure/`, `interface/`, `use-case/`, `controller/` 4개로 분리되어 있는가
- [ ] Repository가 비즈니스 로직을 포함하지 않는가
- [ ] Service가 DB/NAS/Queue를 직접 접근하지 않고 Repository를 통하는가
- [ ] Algorithm 호출이 Interface(IAlgorithmRunner)를 통하는가
- [ ] Controller에서 `console.log` 대신 `Logger`를 사용하는가
- [ ] DTO에 `class-validator` 데코레이터가 적용되어 있는가
- [ ] `any` 타입이 사용되지 않았는가
- [ ] 모듈 파일에 `@Module()` 데코레이터가 있는가
- [ ] Git 브랜치가 `feature/csc[번호]-[기능명]` 형식인가
