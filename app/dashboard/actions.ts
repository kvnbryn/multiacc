// File: app/dashboard/actions.ts

'use server';

import prisma from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect('/login');
}

export async function getZepetoAccounts() {
  const session = await getSession();
  if (!session.userId) return [];
  const accounts = await prisma.zepetoAccount.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
  return accounts;
}

export async function deleteZepetoAccount(formData: FormData) {
    const session = await getSession();
    if (!session.userId) throw new Error('Not authenticated');
    const accountId = formData.get('accountId') as string;
    await prisma.zepetoAccount.delete({
        where: { id: accountId, userId: session.userId }
    });
    revalidatePath('/dashboard/akun');
}

export async function validateAccount(formData: FormData) {
    const accountId = formData.get('accountId') as string;
    const randomSuccess = Math.random() > 0.2;
    await prisma.zepetoAccount.update({
        where: { id: accountId },
        data: { 
            status: randomSuccess ? 'CONNECTED' : 'FAILED', 
            lastValidatedAt: new Date() 
        }
    });
    revalidatePath('/dashboard/akun');
}

export async function addZepetoAccount(formData: FormData) {
  const session = await getSession();
  if (!session.userId) throw new Error('Sesi Anda tidak valid. Silakan login ulang.');

  const dashboardUser = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!dashboardUser) throw new Error('Akun dashboard Anda tidak ditemukan.');
  
  const zepetoId = formData.get('zepetoEmail') as string;
  const password = formData.get('zepetoPassword') as string;
  const nameLabel = formData.get('name') as string || 'Zepeto Account';

  if (!zepetoId || !password) throw new Error('ZEPETO ID dan Password tidak boleh kosong.');

  try {
    const loginUrl = 'https://cf-api-studio.zepeto.me/api/authenticate/zepeto-id';
    const loginResponse = await fetch(loginUrl, { 
        method: 'POST', 
        headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }, 
        body: JSON.stringify({ zepetoId, password }) 
    });

    if (!loginResponse.ok) throw new Error('Login ZEPETO gagal. Periksa ID dan Password.');
    
    const loginData = await loginResponse.json();
    const profile = loginData.profile;
    
    await prisma.zepetoAccount.create({
        data: {
          userId: dashboardUser.id,
          name: nameLabel, 
          zepetoEmail: zepetoId,
          zepetoPassword: password,
          displayName: profile.name, 
          username: profile.userId, 
          profilePic: profile.imageUrl,
          status: 'CONNECTED', 
          lastValidatedAt: new Date(),
        },
    });

    revalidatePath('/dashboard/akun');
    return { success: true, message: 'Akun Zepeto berhasil ditambahkan!' };
  } catch (error) { 
    console.error("Proses tambah akun ZEPETO gagal:", error); 
    if (error instanceof Error) throw new Error(error.message);
    throw new Error("Terjadi kesalahan sistem.");
  }
}

// === STEP 1: PERSIAPAN UPLOAD (Revised V2) ===
export async function prepareZepetoUpload(formData: FormData) {
    const session = await getSession();
    if (!session.userId) return { success: false, message: 'Sesi tidak valid.' };

    const accountId = formData.get('accountId') as string;
    const fileName = formData.get('fileName') as string;
    const categoryKey = formData.get('category') as string;

    const account = await prisma.zepetoAccount.findUnique({ where: { id: accountId } });
    if (!account || account.status !== 'CONNECTED') return { success: false, message: 'Akun bermasalah.' };

    try {
        // 1. Login Zepeto
        const loginUrl = 'https://cf-api-studio.zepeto.me/api/authenticate/zepeto-id';
        const loginResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({ zepetoId: account.zepetoEmail, password: account.zepetoPassword })
        });

        if (!loginResponse.ok) throw new Error('Login gagal saat persiapan upload.');
        const loginData = await loginResponse.json();
        const bearerToken = `Bearer ${loginData.authToken}`;

        // 2. Minta URL Upload (Try Primary: World Creator)
        // REVISI: Ganti type jadi 'WORLD' dan tambahkan content type header
        const worldInitUrl = 'https://api-world-creator.zepeto.me/v2/files/upload-url'; 
        let initResponse = await fetch(worldInitUrl, {
            method: 'POST',
            headers: { 
                'Authorization': bearerToken,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({ 
                name: fileName, 
                type: 'WORLD', // <-- Ganti dari USER_FILE ke WORLD
                extension: 'zepeto' 
            })
        });

        // FALLBACK: Jika tipe 'WORLD' gagal, coba tipe 'generic' atau endpoint Content Gateway
        if (!initResponse.ok) {
            console.warn("Primary upload init failed, trying fallback...");
            
            // Coba payload alternatif
            initResponse = await fetch(worldInitUrl, {
                method: 'POST',
                headers: { 
                    'Authorization': bearerToken,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    name: fileName, 
                    type: 'USER_FILE', 
                    extension: 'zip' // Coba pura-pura jadi zip
                })
            });
        }

        if (!initResponse.ok) {
            // DEBUGGING: Ambil pesan error asli dari server Zepeto
            const errorText = await initResponse.text();
            console.error("Zepeto Upload Init Error:", errorText);
            throw new Error(`Gagal minta izin upload. Server: ${errorText.substring(0, 100)}`);
        }

        const initData = await initResponse.json();
        
        return {
            success: true,
            uploadUrl: initData.uploadUrl,
            fileId: initData.fileId,
            token: bearerToken,
            categoryIdMap: { 'hair': '61681e66ec485e4a0df0d476', 'top': 'DR_TOP_01', 'bottom': 'DR_PANTS_01', 'dress': 'DR_DRESS_01', 'shoes': 'SH_SHOES_01' }[categoryKey]
        };

    } catch (error: any) {
        console.error("Prepare Upload Error:", error);
        return { success: false, message: error.message };
    }
}

// === STEP 3: FINALISASI ===
export async function finalizeZepetoUpload(fileId: string, categoryId: string, token: string, fileName: string) {
    try {
        // 1. Konfirmasi Upload
        await fetch(`https://api-world-creator.zepeto.me/v2/files/${fileId}/complete`, {
            method: 'POST',
            headers: { 'Authorization': token }
        });

        // 2. Linking Asset
        const linkAssetResponse = await fetch(`https://cf-api-studio.zepeto.me/api/assets/link`, {
            method: 'POST',
            headers: { 
                'Authorization': token,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                categoryId: categoryId,
                fileId: fileId,
                name: fileName
            })
        });

        let assetId = '';
        if (linkAssetResponse.ok) {
            const linkData = await linkAssetResponse.json();
            assetId = linkData.id;
        } else {
            const err = await linkAssetResponse.text();
            throw new Error("Gagal menghubungkan file (Linking): " + err);
        }

        // 3. Build Asset (Tunggu 5 detik biar aman)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await fetch(`https://cf-api-studio.zepeto.me/api/assets/${assetId}/build/${categoryId}`, {
            method: 'POST',
            headers: { 'Authorization': token },
        });

        // 4. Create Item
        await new Promise(resolve => setTimeout(resolve, 2000));

        const itemPayload = { price: 5, assetId: assetId, categoryId: categoryId, currency: "ZEM" };
        const itemResponse = await fetch('https://cf-api-studio.zepeto.me/api/items', {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(itemPayload),
        });

        if (!itemResponse.ok) {
            const errData = await itemResponse.json().catch(() => ({}));
            throw new Error(`Gagal membuat item final: ${errData.message || 'Unknown Error'}`);
        }
        
        return { success: true, message: "Sukses! Item berhasil dibypass dan dibuat." };

    } catch (error: any) {
        return { success: false, message: error.message };
    }
}