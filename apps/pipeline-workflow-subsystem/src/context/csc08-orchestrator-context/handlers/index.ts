// Commands
import { StartPipelineHandler } from './commands/start-pipeline.handler';
import { HandleStepCompletedHandler } from './commands/handle-step-completed.handler';
import { HandleStepFailedHandler } from './commands/handle-step-failed.handler';
import { ReprocessPipelineHandler } from './commands/reprocess-pipeline.handler';

// Queries
import { GetJobStatusHandler } from './queries/get-job-status.handler';
import { GetPipelineExecutionHandler } from './queries/get-pipeline-execution.handler';

// Events
import { JobFailedAlertHandler } from './events/job-failed-alert.handler';
import { StepCompletedAuditHandler } from './events/step-completed-audit.handler';

export { StartPipelineCommand, StartPipelineHandler } from './commands/start-pipeline.handler';
export { HandleStepCompletedCommand, HandleStepCompletedHandler } from './commands/handle-step-completed.handler';
export { HandleStepFailedCommand, HandleStepFailedHandler } from './commands/handle-step-failed.handler';
export { ReprocessPipelineCommand, ReprocessPipelineHandler } from './commands/reprocess-pipeline.handler';
export { GetJobStatusQuery, GetJobStatusHandler } from './queries/get-job-status.handler';
export { GetPipelineExecutionQuery, GetPipelineExecutionHandler } from './queries/get-pipeline-execution.handler';
export { JobFailedAlertEvent, JobFailedAlertHandler } from './events/job-failed-alert.handler';
export { StepCompletedAuditEvent, StepCompletedAuditHandler } from './events/step-completed-audit.handler';

export const commandHandlers = [
  StartPipelineHandler,
  HandleStepCompletedHandler,
  HandleStepFailedHandler,
  ReprocessPipelineHandler,
];

export const queryHandlers = [GetJobStatusHandler, GetPipelineExecutionHandler];

export const eventHandlers = [JobFailedAlertHandler, StepCompletedAuditHandler];
