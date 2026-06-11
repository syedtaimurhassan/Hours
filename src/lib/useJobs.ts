import { onSnapshot } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import type { Job, ServerStamp } from '../types'
import { jobsCol } from './jobs'

/** Live list of the user's jobs, ordered. Archived jobs included (filter at call site). */
export function useJobs(uid: string): { jobs: Job[]; byId: Map<string, Job>; loaded: boolean } {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    return onSnapshot(
      jobsCol(uid),
      (snap) => {
        const list: Job[] = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: typeof data.name === 'string' ? data.name : 'Job',
            color: typeof data.color === 'string' ? data.color : 'slate',
            archived: data.archived === true,
            order: typeof data.order === 'number' ? data.order : 0,
            createdAt: (data.createdAt as ServerStamp | undefined) ?? null,
          }
        })
        list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        setJobs(list)
        setLoaded(true)
      },
      () => setLoaded(true),
    )
  }, [uid])

  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])
  return { jobs, byId, loaded }
}

export function activeJobs(jobs: Job[]): Job[] {
  return jobs.filter((j) => !j.archived)
}
