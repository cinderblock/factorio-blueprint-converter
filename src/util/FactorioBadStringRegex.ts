// test for non-printable characters
export const FactorioBadStringRegex = /[\v]|[^-:\n\s\p{Letter}\p{Mark}\p{Number}\p{Punctuation}{Sc}\p{Sk}\p{Sm}]/imu;
// SymbolOther causes too many false positives
