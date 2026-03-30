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
