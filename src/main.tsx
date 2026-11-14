import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import App from './App'
import TestDrawer from './components/TestDrawer'
import { DataProvider } from './data/DataProvider'
import './index.css'
import Air from './screens/Air'
import Home from './screens/Home'
import Overview from './screens/Overview'
import Ranking from './screens/Ranking'
import Sound from './screens/Sound'
import Sources from './screens/Sources'
import Tests from './screens/Tests'
import TwoWay from './screens/TwoWay'

const Lab = lazy(() => import('./screens/Lab'))
const Game = lazy(() => import('./game/Game'))

function Root() {
  return (
    <DataProvider>
      <Outlet />
      <TestDrawer />
    </DataProvider>
  )
}

const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Home /> },
      {
        element: <App />,
        children: [
          { path: 'overview', element: <Overview /> },
          { path: 'tests', element: <Tests /> },
          { path: 'ranking', element: <Ranking /> },
          { path: 'air', element: <Air /> },
          { path: 'sound', element: <Sound /> },
          { path: 'lab', element: <Suspense fallback={<p className="text-muted">Loading the lab…</p>}><Lab /></Suspense> },
          { path: 'twoway', element: <TwoWay /> },
          { path: 'sources', element: <Sources /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
  { path: '/fly', element: <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}><Game /></Suspense> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
