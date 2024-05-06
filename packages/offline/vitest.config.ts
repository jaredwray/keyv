import {defineConfig, mergeConfig} from 'vitest/config';
import vitestConfig from '../../vitest.general.config';

export default mergeConfig(vitestConfig, defineConfig({}));
