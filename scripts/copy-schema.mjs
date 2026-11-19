// tsc does not copy non-TS assets; the schema file is read at runtime.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist/db', { recursive: true });
copyFileSync('src/db/schema.sql', 'dist/db/schema.sql');
