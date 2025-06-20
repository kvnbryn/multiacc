
import { register } from './actions';
import Link from 'next/link';
import { Suspense } from 'react';

// ErrorMessage component untuk register
function RegisterErrorMessage({ error }: { error?: string }) {
  let message = '';
  if (error === 'UserExists') {
    message = 'Email ini sudah terdaftar. Silakan gunakan email lain.';
  } else if (error === 'InvalidData') {
    message = 'Data tidak valid. Pastikan email benar dan password minimal 6 karakter.';
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

// PERBAIKAN FINAL: Tipe props yang benar untuk Next.js App Router
export default function RegisterPage({
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
            <p className="text-gray-400 mt-2">Buat akun untuk mulai mengelola.</p>
        </div>
        <div className="bg-gray-800/50 p-8 rounded-2xl shadow-2xl backdrop-blur-lg border border-gray-700/50">
          <form action={register} className="space-y-6">
            <Suspense fallback={null}>
                <RegisterErrorMessage error={searchParams?.error as string} />
            </Suspense>
            <div>
              <label htmlFor="email-register" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                id="email-register" name="email" type="email" required placeholder="anda@email.com"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label htmlFor="password-register" className="block text-sm font-medium text-gray-300 mb-1">Password (min. 6 karakter)</label>
              <input
                id="password-register" name="password" type="password" required minLength={6} placeholder="••••••••"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <button
                type="submit"
                className="w-full px-4 py-3 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 transition-colors"
              >
                Buat Akun
              </button>
            </div>
          </form>
          <p className="text-sm text-center text-gray-400 mt-6">
            Sudah punya akun?{' '}
            <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">
                Login di sini
            </Link>
          </p>
        </div>
       </div>
    </div>
  );
}
