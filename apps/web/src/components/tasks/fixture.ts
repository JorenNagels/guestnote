import type { TaskRow } from '@guestnote/db'

/** A task with every field filled, so a test names only the one it is about. */
export function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: '018f0000-0000-7000-8000-000000000001',
    weddingId: '018f0000-0000-7000-8000-0000000000aa',
    title: 'Book the DJ',
    notes: null,
    status: 'open',
    visibility: 'shared',
    assigneeUserId: null,
    assigneeName: null,
    assigneeRole: 'planner',
    dueOffsetDays: null,
    dueAt: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2027-01-01T00:00:00Z'),
    updatedAt: new Date('2027-01-01T00:00:00Z'),
    ...over,
  }
}
