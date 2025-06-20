import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './lib/session';

export async function middleware(request: NextRequest) {
  const session = await getSession();
  const { pathname } = request.nextUrl;

  // Daftar path yang boleh diakses publik tanpa login
  const publicPaths = ['/', '/login', '/register'];

  const isPublicPath = publicPaths.includes(pathname);

  // Jika user belum login dan mencoba akses halaman non-publik
  if (!session.isLoggedIn && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Jika user sudah login dan mencoba akses halaman login/register
  if (session.isLoggedIn && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
     return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Matcher ini tidak perlu diubah, sudah benar
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
