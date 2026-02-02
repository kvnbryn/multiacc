'use client';

import { useState, useRef } from 'react';
import { prepareZepetoUpload, finalizeZepetoUpload } from '../actions';
import type { ZepetoAccount } from '@prisma/client';
import Link from 'next/link';

export function ZepetoUploader({ accounts }: { accounts: ZepetoAccount[] }) {
  // State diperluas untuk handle status loading yang lebih detail
  const [status, setStatus] = useState<{ 
      type: 'idle' | 'success' | 'error' | 'loading'; 
      message: string; 
  }>({ 
      type: 'idle', message: '' 
  });
  
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Mempersiapkan jalur bypass...' });

    const formData = new FormData(e.currentTarget);
    const zepetoFile = formData.get('zepetoFile') as File;

    // Validasi file basic
    if (!zepetoFile || zepetoFile.size === 0) {
        setStatus({ type: 'error', message: 'Silakan pilih file terlebih dahulu.' });
        return;
    }

    try {
        // === STEP 1: Minta Tiket & URL Upload ke Server Action ===
        // Kita tambahkan metadata manual ke formData agar Server Action bisa baca
        formData.append('fileName', zepetoFile.name);
        formData.append('fileSize', zepetoFile.size.toString());

        const prepResult = await prepareZepetoUpload(formData);

        if (!prepResult.success || !prepResult.uploadUrl) {
            throw new Error(prepResult.message || "Gagal persiapan upload.");
        }

        // === STEP 2: CLIENT-SIDE DIRECT UPLOAD (Bypass Vercel & Proxy) ===
        setStatus({ type: 'loading', message: `Sedang mengupload ${zepetoFile.name} (Direct Bypass)...` });
        
        // Kita pakai fetch browser biasa buat nembak langsung ke Zepeto CDN (S3/Google Cloud)
        // Ini kuncinya: File dikirim langsung dari browser user ke storage Zepeto.
        const uploadResponse = await fetch(prepResult.uploadUrl, {
            method: 'PUT',
            body: zepetoFile, // Kirim RAW Binary File
            headers: {
                'Content-Type': 'application/octet-stream' 
            }
        });

        if (!uploadResponse.ok) {
            throw new Error("Gagal upload fisik file ke server Zepeto. Cek koneksi internet.");
        }

        // === STEP 3: Finalisasi & Linking di Server ===
        setStatus({ type: 'loading', message: 'Finalisasi & Bypass Poligon...' });
        
        const finalResult = await finalizeZepetoUpload(
            prepResult.fileId, 
            prepResult.categoryIdMap, 
            prepResult.token,
            zepetoFile.name
        );

        if (finalResult.success) {
            setStatus({ type: 'success', message: finalResult.message as string });
            formRef.current?.reset();
        } else {
            setStatus({ type: 'error', message: finalResult.message as string });
        }

    } catch (error: any) {
        console.error("Upload Flow Error:", error);
        setStatus({ type: 'error', message: error.message || 'Terjadi kesalahan sistem yang tidak terduga.' });
    }
  };

  const commonInputStyle = "w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:bg-gray-800/50 disabled:cursor-not-allowed";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {status.type !== 'idle' && (
         <div className={`p-3 rounded-lg text-sm ${
            status.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
            status.type === 'error' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
            'bg-blue-500/20 text-blue-300 border border-blue-500/30'
         }`}>
            {status.message}
         </div>
      )}
      
      <div>
        <label htmlFor="accountId" className="block text-sm font-medium text-gray-300 mb-1">1. Pilih Akun ZEPETO Tujuan</label>
        <select 
          id="accountId" 
          name="accountId" 
          required 
          disabled={accounts.length === 0 || status.type === 'loading'} 
          className={commonInputStyle}
        >
          {accounts.length > 0 ? (
            accounts.filter(acc => acc.status === 'CONNECTED').map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.displayName || acc.name} (@{acc.username})
              </option>
            ))
          ) : (
            <option>Tambahkan akun yang terhubung terlebih dahulu</option>
          )}
        </select>
        {accounts.length > 0 && accounts.filter(acc => acc.status === 'CONNECTED').length === 0 && (
            <p className="text-xs text-yellow-400 mt-2">
                Tidak ada akun yang berstatus &apos;Terhubung&apos;. Silakan cek koneksi di halaman <Link href="/dashboard/akun" className="underline">Manajemen Akun</Link>.
            </p>
        )}
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-300 mb-1">2. Pilih Kategori Item</label>
        <select 
            id="category" 
            name="category" 
            required 
            disabled={status.type === 'loading'} 
            className={commonInputStyle}
        >
          <option value="top">Top (Atasan)</option>
          <option value="bottom">Bottom (Bawahan)</option>
          <option value="shoes">Shoes (Sepatu)</option>
          <option value="hair">Hair (Rambut)</option>
          <option value="dress">Dress</option>
        </select>
      </div>

      <div>
        <label htmlFor="zepetoFile" className="block text-sm font-medium text-gray-300 mb-1">3. Pilih File (.zepeto)</label>
        <input 
            type="file" 
            name="zepetoFile" 
            id="zepetoFile" 
            accept=".zepeto" 
            required 
            disabled={status.type === 'loading'} 
            className={`${commonInputStyle} file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600/50 file:text-indigo-200 hover:file:bg-indigo-600/70`}
        />
      </div>

      <button 
        type="submit" 
        disabled={status.type === 'loading' || accounts.filter(acc => acc.status === 'CONNECTED').length === 0} 
        className="w-full py-3 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
      >
        {status.type === 'loading' ? 'Memproses Bypass...' : 'UPLOAD SEKARANG'}
      </button>
    </form>
  );
}