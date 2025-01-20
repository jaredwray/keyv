import {defineConfig, mergeConfig} from 'vitest/config';
import vitestConfig from '../../vitest.general.config.js';

export default mergeConfig(vitestConfig, defineConfig({}));
