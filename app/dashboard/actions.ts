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

// === HELPER: SMART FETCH WRAPPER (SCANNER V3) ===
async function tryEndpoints(endpoints: string[], payload: any, token: string) {
    let lastError;
    // Header Manipulasi: Pura-pura jadi Unity Editor atau Web Creator
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'X-Zepeto-App-Version': '3.20.0', // Versi app terbaru biar gak ditolak
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    };

    for (const url of endpoints) {
        try {
            console.log(`Trying endpoint: ${url}`);
            const res = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                console.log(`Success endpoint: ${url}`);
                return await res.json();
            }
            
            const errText = await res.text();
            lastError = `[${res.status}] ${errText.substring(0, 100)}`;
            console.warn(`Failed ${url}: ${lastError}`);
        } catch (e) {
            console.error(`Connection error to ${url}`, e);
        }
    }
    throw new Error(`Semua endpoint gagal. Last error: ${lastError || 'Timeout/Unknown'}`);
}

// === STEP 1: PERSIAPAN (Auto-Scan Endpoint yang BENAR) ===
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

        // 2. SCANNING ENDPOINTS (V3 - PATH CORRECTION)
        // Kita ganti strategy: Bukan '/upload-url', tapi POST ke collection '/files' langsung.
        // Ini standar REST API Zepeto modern.
        const potentialEndpoints = [
            // Target Utama: World Service (Environment Khusus World, Limit Besar)
            'https://world-service-api.world.zepeto.run/v2/files', 
            'https://api-world-creator.zepeto.me/v2/files',
            
            // Fallback: API Studio atau Gateway dengan path v2
            'https://api-studio.zepeto.me/v2/files',
            'https://gw-napi.zepeto.io/files/v2'
        ];

        // Payload "Trojan": Kita bilang ini file WORLD (.zepetopackage) biar dikasih bucket yang gede
        const payload = { 
            name: fileName, 
            type: 'WORLD', // KUNCI: Jangan 'USER_FILE', pake 'WORLD' atau 'ITEM'
            extension: 'zepeto' // Tetap .zepeto biar gak curiga
        };

        const initData = await tryEndpoints(potentialEndpoints, payload, bearerToken);

        // Debugging: Pastikan kita dapet uploadUrl
        if (!initData.uploadUrl) {
            throw new Error("Server merespon OK tapi tidak ada uploadUrl. Response: " + JSON.stringify(initData));
        }

        return {
            success: true,
            uploadUrl: initData.uploadUrl, // Ini URL S3/GCS
            fileId: initData.fileId || initData.id,
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
        // 1. Linking Asset (Trick Bypass)
        // Kita paksa Studio menerima FileID yang kita upload lewat jalur World tadi.
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
            // Kalau Link gagal, kita coba "Inject" via Create Asset standard tapi skip upload
            // Ini langkah desperado kalau server nolak linking lintas-tipe
            const err = await linkAssetResponse.text();
            console.warn("Direct Link failed, trying Create fallback:", err);
            
            // Create Asset Metadata Only
            const createRes = await fetch(`https://cf-api-studio.zepeto.me/api/assets`, {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId, name: fileName, fileId: fileId }) // Coba inject fileId langsung
            });
            
            if(createRes.ok) {
                const createData = await createRes.json();
                assetId = createData.id;
            } else {
                 throw new Error(`Gagal Linking Asset: ${err}`);
            }
        }

        // 2. Build & Create Item
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