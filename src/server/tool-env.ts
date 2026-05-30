import { configDir } from './config.js';

const persistentToolPath = [
  `${configDir}/bin`,
  `${configDir}/tools/npm/bin`,
  `${configDir}/tools/pnpm`,
  `${configDir}/tools/cargo/bin`,
  `${configDir}/tools/go/bin`,
];

export function persistentToolEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    NPM_CONFIG_PREFIX: `${configDir}/tools/npm`,
    PNPM_HOME: `${configDir}/tools/pnpm`,
    CARGO_HOME: `${configDir}/tools/cargo`,
    GOPATH: `${configDir}/tools/go`,
    PATH: [...persistentToolPath, baseEnv.PATH ?? ''].filter(Boolean).join(':'),
  };
}
