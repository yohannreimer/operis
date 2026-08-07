export function isFrontsProjectsV2Enabled() {
  return import.meta.env.VITE_FRONTS_PROJECTS_V2 === 'true';
}
