import type { Module } from "../model.js";

export const ciModule: Module = {
  id: "ci",
  enabled: (config) => config.modules.ci,
  outputs: (ctx) => ctx.platform.ciWorkflow(ctx),
};
