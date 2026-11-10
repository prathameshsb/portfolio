import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({ resolve: base.resolve, test: { include: ['tests/**/*.integration.test.ts'], environment: 'node' } });
