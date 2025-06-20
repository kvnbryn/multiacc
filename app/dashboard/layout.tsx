// /app/dashboard/layout.tsx

import Link from 'next/link';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { logout } from './actions';
import { NavLinks } from './_components/NavLinks';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-200">
      <aside className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex items-center h-16 flex-shrink-0 px-4 bg-gray-900 border-r border-gray-800">
             <Link href="/dashboard" className="text-2xl font-bold text-white hover:text-indigo-400 transition-colors">
                Zepeto<span className="text-indigo-400">Hub</span>
            </Link>
          </div>
          <div className="flex-1 flex flex-col overflow-y-auto bg-gray-800 border-r border-gray-700/50">
            <nav className="flex-1 px-2 py-4 space-y-1">
              <NavLinks />
            </nav>
            <div className="px-2 py-4 border-t border-gray-700">
                <form action={logout}>
                    <button 
                        type="submit" 
                        className="w-full flex items-center px-2 py-2 text-sm font-medium rounded-md text-gray-300 hover:bg-gray-700 hover:text-white group"
                    >
                         <svg className="mr-3 h-6 w-6 text-gray-400 group-hover:text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                    </button>
                </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6 px-4 sm:px-6 lg:px-8">
            <div className="animate-fadeIn">
                {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
