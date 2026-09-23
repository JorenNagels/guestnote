import type { ReactNode } from 'react'
import { MoneyIntl } from '../../../../../../components/money/intl.tsx'

export default function Layout({ children }: { children: ReactNode }) {
  return <MoneyIntl>{children}</MoneyIntl>
}
