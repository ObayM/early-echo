import { Link } from 'react-router-dom'

export default function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2 text-base font-semibold" aria-label="Early Echo, front page">
      <svg viewBox="0 0 28 28" className="size-6 flex-none text-flame" aria-hidden="true">
        <circle cx="7" cy="14" r="3.2" fill="currentColor" />
        <path d="M13 7.5a9.2 9.2 0 0 1 0 13M18 4a14 14 0 0 1 0 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Early Echo
    </Link>
  )
}
