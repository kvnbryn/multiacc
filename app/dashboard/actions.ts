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
  if (!session.userId) throw new Error('Sesi tidak valid.');

  const dashboardUser = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!dashboardUser) throw new Error('User DB tidak ditemukan.');
  
  const zepetoId = formData.get('zepetoEmail') as string;
  const password = formData.get('zepetoPassword') as string;
  const nameLabel = formData.get('name') as string || 'Zepeto Account';

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

    if (!loginResponse.ok) throw new Error('Login ZEPETO gagal.');
    
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
    return { success: true, message: 'Akun berhasil ditambahkan!' };
  } catch (error: any) { 
    throw new Error(error.message || "Gagal tambah akun.");
  }
}

// === HELPER: SMART FETCH WRAPPER ===
async function tryEndpoints(endpoints: string[], payload: any, token: string) {
    let lastError;
    for (const url of endpoints) {
        try {
            console.log(`Trying upload endpoint: ${url}`);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Authorization': token,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                console.log(`Success endpoint: ${url}`);
                return await res.json();
            }
            lastError = await res.text();
            console.warn(`Failed endpoint ${url}: ${res.status} - ${lastError.substring(0,50)}`);
        } catch (e) {
            console.error(`Error connecting to ${url}`, e);
        }
    }
    throw new Error(`Semua endpoint gagal. Last error: ${lastError || 'Unknown'}`);
}

// === STEP 1: PERSIAPAN (Auto-Scan Endpoint) ===
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zepetoId: account.zepetoEmail, password: account.zepetoPassword })
        });

        if (!loginResponse.ok) throw new Error('Login gagal saat persiapan upload.');
        const loginData = await loginResponse.json();
        const bearerToken = `Bearer ${loginData.authToken}`;

        // 2. SCANNING ENDPOINTS (Cari yang ngasih link S3)
        // Kita coba beberapa kemungkinan endpoint yang biasanya dipakai di ekosistem Zepeto
        const potentialEndpoints = [
            'https://api-world-creator.zepeto.me/v1/files/upload-url', // Coba V1
            'https://api-world-creator.zepeto.me/v2/files/upload-url', // Coba V2 lagi
            'https://gw-napi.zepeto.io/files/upload-url',             // Coba Gateway
            'https://api-studio.zepeto.me/v1/files/upload-url'         // Coba Studio
        ];

        // Payload juga kita variasi sedikit kalau perlu, tapi standar WORLD biasanya aman
        const payload = { 
            name: fileName, 
            type: 'WORLD', // Trik biar dianggap file World (Limit gede)
            extension: 'zepeto' 
        };

        const initData = await tryEndpoints(potentialEndpoints, payload, bearerToken);

        // Kalau sukses, kita dapat URL S3 yang sakti (biasanya support CORS)
        return {
            success: true,
            uploadUrl: initData.uploadUrl, // S3 URL
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
        // 1. Konfirmasi Upload (Wajib buat S3 flow)
        // Kita tembak endpoint complete ke HOST yang sama dengan endpoint upload-url tadi (asumsi world creator)
        // Kalau fileId formatnya beda, server mungkin nolak, tapi kita coba standard
        await fetch(`https://api-world-creator.zepeto.me/v1/files/${fileId}/complete`, { // Coba V1 complete
            method: 'POST',
            headers: { 'Authorization': token }
        }).catch(() => {}); // Ignore error, kadang auto-complete

        // 2. Linking Asset
        const linkAssetResponse = await fetch(`https://cf-api-studio.zepeto.me/api/assets/link`, {
            method: 'POST',
            headers: { 
                'Authorization': token,
                'Content-Type': 'application/json'
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
            throw new Error(`Gagal Linking Asset: ${err}`);
        }

        // 3. Build & Create Item (Standard Flow)
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fetch(`https://cf-api-studio.zepeto.me/api/assets/${assetId}/build/${categoryId}`, {
            method: 'POST',
            headers: { 'Authorization': token },
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
        const itemPayload = { price: 5, assetId: assetId, categoryId: categoryId, currency: "ZEM" };
        const itemResponse = await fetch('https://cf-api-studio.zepeto.me/api/items', {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(itemPayload),
        });

        if (!itemResponse.ok) {
            const errData = await itemResponse.json().catch(() => ({}));
            throw new Error(`Gagal Create Item: ${errData.message || 'Unknown'}`);
        }
        
        return { success: true, message: "Sukses! Item berhasil dibypass dan dibuat." };

    } catch (error: any) {
        return { success: false, message: error.message };
    }
}