import { Schema } from "effect"

export const diagnostic = (cause: unknown): string => {
  try {
    const message = cause instanceof Error ? cause.message || cause.name : String(cause)

    return message.trim() ? message : "Action rejected without a diagnostic"
  } catch {
    return "Action rejected with an unprintable value"
  }
}

export class ProofError extends Schema.TaggedError<ProofError>()("ProofError", {
  stage: Schema.String,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

export const combineErrors = (
  primary: { readonly error: unknown } | undefined,
  cleanup: readonly unknown[],
): void => {
  if (primary && cleanup.length > 0) {
    throw new AggregateError(
      [primary.error, ...cleanup],
      `Proof failed: ${diagnostic(primary.error)}; cleanup also failed`,
    )
  }

  if (primary) throw primary.error

  if (cleanup.length > 0) {
    throw new AggregateError(cleanup, `Proof cleanup failed: ${cleanup.map(diagnostic).join("; ")}`)
  }
}
