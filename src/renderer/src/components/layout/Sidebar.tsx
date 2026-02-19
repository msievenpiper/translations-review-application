import { NavLink } from 'react-router-dom'

const links = [
  { to: '/',         label: 'Audit',    icon: '🔍' },
  { to: '/history',  label: 'History',  icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Sidebar() {
  return (
    <aside className="w-48 bg-gray-900 text-gray-100 flex flex-col py-4 gap-1 shrink-0 border-r border-gray-800">
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Translation Auditor
      </div>
      {links.map(link => (
        <NavLink
          key={link.to}
          to={link.to}
          end
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 text-sm rounded mx-2 transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`
          }
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </NavLink>
      ))}
    </aside>
  )
}
