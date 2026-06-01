/**
 * Migration script from v072 to v073
 * - Adds selectionToolbar.features.learning.enabled.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */
export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    selectionToolbar: {
      ...oldConfig?.selectionToolbar,
      features: {
        ...oldConfig?.selectionToolbar?.features,
        learning: {
          enabled: true,
        },
      },
    },
  }
}
