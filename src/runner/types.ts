import type { Page } from "playwright"
import type { Manifest } from "../manifest"

export interface Action {
  readonly name: string
  readonly expected?: string
  readonly run: (page: Page) => Promise<void>
}

export interface Scenario {
  readonly id: string
  readonly actions: readonly Action[]
  readonly masks?: readonly string[]
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly video?: boolean
}

export interface App {
  readonly baseURL: string
  readonly close: () => Promise<void>
}

export interface RunOptions {
  readonly launch: () => Promise<App>
  readonly scenarios: readonly Scenario[]
  readonly directory?: string
  readonly scenarioIds?: readonly string[]
  readonly executablePath?: string
  readonly headless?: boolean
  readonly args?: readonly string[]
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly fixedTime?: string
  readonly locale?: string
  readonly timezoneId?: string
  readonly deviceScaleFactor?: number
  readonly colorScheme?: "light" | "dark" | "no-preference"
  readonly timeout?: number
  readonly pace?: {
    readonly chapter?: number
    readonly action?: number
    readonly hold?: number
  }
}

export type RunResult =
  | { readonly outcome: "passed"; readonly exitCode: 0; readonly manifest: Manifest }
  | { readonly outcome: "failed"; readonly exitCode: 1; readonly manifest: Manifest }
  | { readonly outcome: "skipped"; readonly exitCode: 3; readonly reason: string }
