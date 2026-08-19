import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

/**
 * Loaded by the `component` project only. Two jobs, and the second is not optional.
 *
 * 1. `@testing-library/jest-dom/vitest` registers the DOM matchers (`toBeDisabled`,
 *    `toHaveAccessibleName`, ...) on Vitest's `expect` and, via the `/vitest` entry
 *    specifically, extends its TypeScript types too.
 *
 * 2. `cleanup` unmounts anything left mounted after each test. Testing Library registers
 *    this itself ONLY when it finds a global `afterEach`, which exists just under
 *    `globals: true` -- and this config deliberately does not set that. Without the
 *    explicit hook, every render stays in `document.body` and queries start matching
 *    elements from earlier tests, which fails as "found multiple elements" in the lucky
 *    case and as a false pass in the unlucky one.
 */
afterEach(cleanup)
