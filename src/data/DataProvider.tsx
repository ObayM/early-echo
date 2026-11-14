import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Candle, FlameModel, Summary, Test } from './types'

export interface Data {
  tests: Test[]
  byId: Map<string, Test>
  summary: Summary
  candle: Candle
  model: FlameModel
}

const DataContext = createContext<Data | null>(null)

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`${name}: ${res.status}`)
  return res.json()
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([get<Test[]>('tests.json'), get<Summary>('summary.json'), get<Candle>('candle.json'), get<FlameModel>('model.json')])
      .then(([tests, summary, candle, model]) => setData({ tests, summary, candle, model, byId: new Map(tests.map((t) => [t.id, t])) }))
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="text-muted">Couldn't load the data ({error}). Run <code>npm run data</code> and reload.</p>
  if (!data) return <p className="text-muted">Loading NASA's tests…</p>
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export function useData(): Data {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData must be used inside DataProvider')
  return data
}
