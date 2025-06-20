import { login } from './actions';
import Link from 'next/link';
import { Suspense } from 'react';

// Komponen untuk menampilkan pesan error dari URL
function ErrorMessage({ error }: { error?: string }) {
  let message = '';
  if (error === 'InvalidCredentials') {
    message = 'Email atau password salah. Silakan coba lagi.';
  } else if (error === 'MissingFields') {
    message = 'Harap isi email dan password.';
  }
  if (!message) return null;
  return (
    <div
      aria-live="polite"
      className="p-3 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-sm"
    >
      {message}
    </div>
  );
}

// Komponen untuk menampilkan pesan sukses dari URL (setelah registrasi)
function SuccessMessage({ success }: { success?: string }) {
    if (success !== 'Registered') return null;
    return (
        <div
            aria-live="polite"
            className="p-3 bg-green-500/20 text-green-300 border border-green-500/30 rounded-lg text-sm"
        >
            Registrasi berhasil! Silakan login dengan akun baru Anda.
        </div>
    );
}

// PERBAIKAN FINAL: Tipe props yang benar untuk Next.js App Router
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-gray-200 p-4">
       <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
            <Link href="/" className="text-3xl font-bold text-white hover:text-indigo-400 transition-colors">
                Zepeto<span className="text-indigo-400">Hub</span>
            </Link>
            <p className="text-gray-400 mt-2">Selamat datang kembali! Silakan login.</p>
        </div>
        <div className="bg-gray-800/50 p-8 rounded-2xl shadow-2xl backdrop-blur-lg border border-gray-700/50">
          <form action={login} className="space-y-6">
            <Suspense fallback={null}>
                <ErrorMessage error={searchParams?.error as string} />
                <SuccessMessage success={searchParams?.success as string} />
            </Suspense>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email" name="email" type="email" required placeholder="anda@email.com"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password" name="password" type="password" required placeholder="••••••••"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <button
                type="submit"
                className="w-full px-4 py-3 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 transition-colors"
              >
                Login
              </button>
            </div>
          </form>
          <p className="text-sm text-center text-gray-400 mt-6">
            Belum punya akun?{' '}
            <Link href="/register" className="font-medium text-indigo-400 hover:text-indigo-300">
                Buat akun baru
            </Link>
          </p>
        </div>
       </div>
    </div>
  );
}
