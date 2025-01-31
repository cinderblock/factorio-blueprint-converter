import { join } from 'path/posix';

// TODO: Allow env override?
export const AnnotationsDir = join(import.meta.dirname, 'samples-annotated');

export const SamplesDir = join(import.meta.dirname, 'samples');
