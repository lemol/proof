import { chromium } from "playwright"

// The browser tier runs on Playwright's installed Chromium, as CI does. Left to
// discovery it would take a system Chrome, whose updater and crash handler can
// hold its close past the tests' budgets.
process.env.PROOF_TEST_BROWSER ||= chromium.executablePath()
