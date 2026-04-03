/**
 * 처리 프로파일 Value Object.
 * 위성 ID + 촬영 모드 조합별 처리 파라미터를 정의한다.
 * CSC-08이 수신 이벤트를 받으면 이 프로파일로 어떤 파이프라인을 실행할지 결정한다.
 * (SAD 13.2 CSU-08.02 Processing Profile Manager, REQ-SCALE-002)
 */
export class ProcessingProfile {
  readonly id: string;
  readonly satelliteId: string;
  readonly mode: string;
  readonly polarizations: string[];
  readonly description: string;

  constructor(id: string, satelliteId: string, mode: string, polarizations: string[], description: string) {
    this.id = id;
    this.satelliteId = satelliteId;
    this.mode = mode;
    this.polarizations = polarizations;
    this.description = description;
  }
}
