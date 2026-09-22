import type { ReactNode } from 'react'
import { RunSheetIntl } from '../../../../../../components/run-sheet/intl.tsx'

export default function Layout({ children }: { children: ReactNode }) {
  return <RunSheetIntl>{children}</RunSheetIntl>
}
