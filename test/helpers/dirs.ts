import { join } from 'path/posix';

// TODO: cwd?
export const WorkDir = '.';

export const AnnotationsDir = process.env.ANNOTATIONS_DIR ?? join(WorkDir, 'test', 'samples-annotated');

export const SamplesDir = process.env.SAMPLES_DIR ?? join(WorkDir, 'test', 'samples');
