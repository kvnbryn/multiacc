'use client';

import { useState, useRef, useEffect } from 'react';
import { prepareZepetoUpload, finalizeZepetoUpload } from '../actions';
import type { ZepetoAccount } from '@prisma/client';
import Link from 'next/link';

export function ZepetoUploader({ accounts }: { accounts: ZepetoAccount[] }) {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<{ 
      type: 'idle' | 'success' | 'error' | 'loading'; 
      message: string; 
  }>({ 
      type: 'idle', message: '' 
  });
  
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mounted) return;

    setStatus({ type: 'loading', message: 'Mencari jalur upload terbaik...' });

    const rawFormData = new FormData(e.currentTarget);
    const zepetoFile = rawFormData.get('zepetoFile') as File;
    const accountId = rawFormData.get('accountId') as string;
    const category = rawFormData.get('category') as string;

    if (!zepetoFile || zepetoFile.size === 0) {
        setStatus({ type: 'error', message: 'Pilih file dulu bos.' });
        return;
    }

    try {
        // === STEP 1: SERVER SIDE (Get Presigned URL) ===
        const metaFormData = new FormData();
        metaFormData.append('accountId', accountId);
        metaFormData.append('category', category);
        metaFormData.append('fileName', zepetoFile.name);
        metaFormData.append('fileSize', zepetoFile.size.toString());
        
        const prepResult = await prepareZepetoUpload(metaFormData);

        if (!prepResult || !prepResult.success || !prepResult.uploadUrl) {
            throw new Error(prepResult?.message || "Semua metode bypass gagal. Coba lagi nanti.");
        }

        const { uploadUrl, fileId, token, categoryIdMap, sourceUrl } = prepResult;

        // === STEP 2: CLIENT SIDE (Direct Upload) ===
        setStatus({ type: 'loading', message: `Mengupload ${zepetoFile.name} ke Cloud...` });
        
        // Gunakan PUT untuk S3 Presigned URL
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: zepetoFile,
            headers: {
                'Content-Type': 'application/octet-stream' 
            }
        });

        if (!uploadResponse.ok) {
            throw new Error(`Gagal Upload Cloud (${uploadResponse.status}). Koneksi diputus server.`);
        }

        // === STEP 3: FINALISASI ===
        setStatus({ type: 'loading', message: 'Linking Asset ke Studio...' });
        
        const finalResult = await finalizeZepetoUpload(
            fileId, 
            categoryIdMap, 
            token,
            zepetoFile.name,
            sourceUrl
        );

        if (finalResult?.success) {
            setStatus({ type: 'success', message: finalResult.message as string });
            formRef.current?.reset();
        } else {
            setStatus({ type: 'error', message: finalResult?.message || "Gagal linking asset." });
        }

    } catch (error: any) {
        console.error("Process Error:", error);
        setStatus({ type: 'error', message: error.message || 'Terjadi kesalahan sistem.' });
    }
  };

  const commonInputStyle = "w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:bg-gray-800/50 disabled:cursor-not-allowed";

  // FIX HYDRATION ERROR: Jangan render apapun sampai client siap
  if (!mounted) return null;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {status.type !== 'idle' && (
         <div className={`p-3 rounded-lg text-sm break-words ${
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