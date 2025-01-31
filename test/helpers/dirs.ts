import { join } from 'path/posix';

// TODO: cwd?
export const WorkDir = '.';

// TODO: Allow env override?
export const AnnotationsDir = join(WorkDir, 'test', 'samples-annotated');

export const SamplesDir = join(WorkDir, 'test', 'samples');
