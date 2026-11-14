import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Brand from './components/Brand'

const NAV = [
  { group: 'Start', items: [['/', 'Front page']] },
  { group: "NASA's data", items: [['/overview', 'Overview'], ['/tests', 'All tests'], ['/ranking', 'What keeps a flame alive'], ['/air', 'Cabin air']] },
  { group: 'Our test', items: [['/sound', 'Sound alarm'], ['/twoway', 'Two-laptop test'], ['/lab', '3D lab']] },
  { group: 'Method', items: [['/sources', 'Sources and checks']] },
] as const

function Nav() {
  return (
    <nav aria-label="Screens" className="flex flex-col">
      {NAV.map(({ group, items }) => (
        <div key={group}>
          <p className="mx-2 mb-1.5 mt-5 text-xs text-faint">{group}</p>
          {items.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `block rounded-lg px-2 py-3 text-base transition-colors hover:text-ink lg:py-[7px] lg:text-sm ${isActive ? 'bg-surface text-ink' : 'text-[#bbb]'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Stamp() {
  return (
    <p className="mt-auto px-2 pt-6 text-xs leading-4 text-faint">
      Data: NASA Physical Sciences Informatics, public domain (CC0).
    </p>
  )
}

export default function App() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <header className="sticky top-0 z-20 flex h-13 items-center justify-between bg-ground pl-2 pr-3 lg:hidden">
        <Brand />
        <button type="button" className="h-9 rounded-full border border-control px-3.5" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Menu'}
        </button>
      </header>
      <aside
        id="nav"
        className={`fixed inset-x-0 bottom-0 top-13 z-10 flex-col overflow-y-auto bg-ground px-4 pb-6 lg:inset-y-0 lg:left-0 lg:right-auto lg:flex lg:w-58 lg:pt-6 ${open ? 'flex' : 'hidden'}`}
      >
        <div className="hidden lg:block">
          <Brand />
          <p className="pl-[42px] pr-2 pt-1 text-xs leading-4 text-faint">NASA fire tests in space</p>
        </div>
        <Nav />
        <Stamp />
      </aside>
      <main className="max-w-[1480px] px-4 pb-12 pt-3 lg:ml-58 lg:px-8 lg:pb-16 lg:pt-7">
        <Outlet />
      </main>
    </>
  )
}
