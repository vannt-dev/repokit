import type { Module } from "../model.js";
import { commitsModule } from "./commits.js";
import { depsModule } from "./deps.js";
import { editorconfigModule } from "./editorconfig.js";
import { gitignoreModule } from "./gitignore.js";
import { healthModule } from "./health.js";
import { hooksModule } from "./hooks.js";

/** `ci` and `release` join this list in the reusable-workflows plan. */
export const MODULES: Module[] = [
  editorconfigModule,
  gitignoreModule,
  commitsModule,
  hooksModule,
  healthModule,
  depsModule,
];
