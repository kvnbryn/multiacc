// app/page.tsx

import Link from 'next/link';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';

// Komponen untuk ikon-ikon fitur (SVG inline untuk mengurangi dependensi)
const FeatureIcon = ({ path }: { path: string }) => (
  <svg
    className="w-10 h-10 mb-4 text-indigo-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d={path}
    ></path>
  </svg>
);

export default async function LandingPage() {
  const session = await getSession();

  // Jika sudah login, langsung redirect ke dashboard seperti sebelumnya
  if (session.isLoggedIn) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-gray-200 font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">
            Zepeto<span className="text-indigo-400">Hub</span>
          </h1>
          <nav>
            <Link
              href="/login"
              className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-500 transition-colors duration-300"
            >
              Login
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-32 pb-16 text-center flex flex-col items-center">
          <div className="max-w-3xl">
            <h2 className="text-5xl md:text-6xl font-extrabold leading-tight text-white mb-4">
              Manajemen Akun ZEPETO, Dibuat Simpel.
            </h2>
            <p className="text-lg md:text-xl text-gray-400 mb-8">
              Satu dashboard untuk mengelola semua akun ZEPETO Anda. Unggah konten, pantau status, dan tingkatkan produktivitas Anda.
            </p>
            <Link
              href="/register"
              className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-500 transition-transform duration-300 transform hover:scale-105 inline-block"
            >
              Mulai Sekarang Gratis
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="bg-gray-800 py-20">
          <div className="container mx-auto px-6">
            <div className="text-center mb-12">
              <h3 className="text-4xl font-bold text-white">Fitur Unggulan Kami</h3>
              <p className="text-gray-400 mt-2">Semua yang Anda butuhkan untuk efisiensi maksimal.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-gray-900 p-8 rounded-lg text-center transform hover:-translate-y-2 transition-transform duration-300">
                <FeatureIcon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a3.001 3.001 0 015.658 0M12 6V3m0 3h-3m3 0h3" />
                <h4 className="text-xl font-semibold text-white mb-2">Multi-Akun</h4>
                <p className="text-gray-400">
                  Tambahkan dan kelola beberapa akun ZEPETO dari satu tempat tanpa perlu login berulang kali.
                </p>
              </div>
              {/* Feature 2 */}
              <div className="bg-gray-900 p-8 rounded-lg text-center transform hover:-translate-y-2 transition-transform duration-300">
                <FeatureIcon path="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                <h4 className="text-xl font-semibold text-white mb-2">Upload Otomatis</h4>
                <p className="text-gray-400">
                  Jadwalkan dan unggah item .zepeto ke akun pilihan Anda dengan beberapa klik saja.
                </p>
              </div>
              {/* Feature 3 */}
              <div className="bg-gray-900 p-8 rounded-lg text-center transform hover:-translate-y-2 transition-transform duration-300">
                <FeatureIcon path="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                <h4 className="text-xl font-semibold text-white mb-2">Validasi Status</h4>
                <p className="text-gray-400">
                  Cek status koneksi setiap akun secara real-time untuk memastikan semua berjalan lancar.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 py-6">
        <div className="container mx-auto px-6 text-center text-gray-500">
          <p>&copy; {new Date().getFullYear()} ZepetoHub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
