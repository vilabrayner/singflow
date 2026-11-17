import { defineConfig } from '@playwright/test';
import fullConfig from './playwright.config';

// Keep the full regression intact; release repeats only a small desktop subset.
export default defineConfig(fullConfig, {
  projects: fullConfig.projects!.map((project) => ({
    ...project,
    grep: project.name === 'mobile' ? /@release(?:\s|$)/ : /@release-desktop(?:\s|$)/,
  })),
});
