import { ORPCError } from "@orpc/client"
import { NOTEBASE_BETA_FEATURE_KEY } from "@read-frog/definitions"
import { useQuery } from "@tanstack/react-query"
import { isForkFeatureUnlocked } from "@/utils/fork-features"
import { orpc } from "@/utils/orpc/client"

export function isForkNotebaseBetaUnlocked() {
  return isForkFeatureUnlocked()
}

export function useNotebaseBetaStatus(enabled: boolean) {
  const unlocked = isForkNotebaseBetaUnlocked()
  return useQuery(orpc.betaAccess.status.queryOptions({
    input: {
      featureKey: NOTEBASE_BETA_FEATURE_KEY,
    },
    enabled: enabled && !unlocked,
    initialData: unlocked ? { featureKey: NOTEBASE_BETA_FEATURE_KEY, allowed: true } : undefined,
    staleTime: 60_000,
    meta: {
      suppressToast: true,
    },
  }))
}

export function isORPCForbiddenError(error: unknown) {
  return error instanceof ORPCError && (error.code === "FORBIDDEN" || error.status === 403)
}
