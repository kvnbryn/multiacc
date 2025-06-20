// /app/dashboard/_components/NavLinks.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react'; // Import React

// Tentukan tipe untuk props ikon
type IconProps = React.ComponentProps<'svg'>;
type IconComponent = (props: IconProps) => JSX.Element;

const navigation: { name: string; href: string; icon: IconComponent }[] = [
  { name: 'Upload Item', href: '/dashboard', icon: (props: IconProps) => <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg> },
  { name: 'Manajemen Akun', href: '/dashboard/akun', icon: (props: IconProps) => <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3.001 3.001 0 015.658 0M12 6V3m0 3h-3m3 0h3" /></svg> },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navigation.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className={classNames(
            pathname === item.href
              ? 'bg-gray-900 text-white'
              : 'text-gray-300 hover:bg-gray-700 hover:text-white',
            'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
          )}
        >
          <item.icon className={classNames(
              pathname === item.href ? 'text-gray-300' : 'text-gray-400 group-hover:text-gray-300',
              'mr-3 flex-shrink-0 h-6 w-6'
            )}
            aria-hidden="true"
          />
          {item.name}
        </Link>
      ))}
    </>
  );
}
