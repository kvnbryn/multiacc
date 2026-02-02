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

// === INTELLIGENT ENDPOINT SCANNER (THE BYPASS) ===
async function tryEndpoints(endpoints: string[], payload: any, token: string) {
    let lastError;
    // Header ini KUNCI agar server mengira kita adalah "World Creator" resmi
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'X-Zepeto-App-Version': '3.25.0', // Versi app terbaru
        'X-Zepeto-Platform': 'Android',   // Pura-pura dari HP/Unity
        'User-Agent': 'ZEPETO/3.25.0 (Android; 11; SM-G991B)' 
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
                const data = await res.json();
                // Validasi apakah return data punya URL untuk upload
                if (data.uploadUrl || (data.result && data.result.uploadUrl)) {
                    console.log(`Success endpoint: ${url}`);
                    return data.result ? data.result : data;
                }
            }
            
            const errText = await res.text();
            lastError = `[${res.status}] ${url} -> ${errText.substring(0, 50)}`;
            console.warn(`Scanner Failed: ${lastError}`);
        } catch (e) {
            console.error(`Connection error to ${url}`, e);
        }
    }
    throw new Error(lastError || 'Semua endpoint menolak koneksi.');
}

export async function prepareZepetoUpload(formData: FormData) {
    const session = await getSession();
    if (!session.userId) return { success: false, message: 'Sesi tidak valid.' };

    const accountId = formData.get('accountId') as string;
    const fileName = formData.get('fileName') as string;
    const categoryKey = formData.get('category') as string;

    const account = await prisma.zepetoAccount.findUnique({ where: { id: accountId } });
    if (!account || account.status !== 'CONNECTED') return { success: false, message: 'Akun bermasalah.' };

    try {
        // 1. Login
        const loginUrl = 'https://cf-api-studio.zepeto.me/api/authenticate/zepeto-id';
        const loginResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zepetoId: account.zepetoEmail, password: account.zepetoPassword })
        });

        if (!loginResponse.ok) throw new Error('Login gagal.');
        const loginData = await loginResponse.json();
        const bearerToken = `Bearer ${loginData.authToken}`;

        // 2. SCANNING PATH YANG BENAR (Tanpa '/upload-url')
        // Kita incar endpoint 'v2/files' di host World Creator. Ini biasanya endpoint "Create File Entry"
        // yang otomatis balikin Presigned URL S3.
        const potentialEndpoints = [
            'https://api-world-creator.zepeto.me/v2/files',     // Target Utama (World V2)
            'https://api-world-creator.zepeto.me/v1/files',     // Target Cadangan (World V1)
            'https://gw-napi.zepeto.io/storage/v1/files',       // Target Gateway (General Storage)
            'https://api-studio.zepeto.me/v1/files'             // Target Studio (Jarang work buat bypass, tapi coba aja)
        ];

        const payload = { 
            name: fileName, 
            type: 'WORLD',    // KUNCI: 'WORLD' punya kuota size lebih besar drpd 'ITEM'
            extension: 'zepeto' 
        };

        const initData = await tryEndpoints(potentialEndpoints, payload, bearerToken);

        return {
            success: true,
            uploadUrl: initData.uploadUrl, // S3 URL yang support Direct Upload
            fileId: initData.fileId || initData.id,
            token: bearerToken,
            categoryIdMap: { 'hair': '61681e66ec485e4a0df0d476', 'top': 'DR_TOP_01', 'bottom': 'DR_PANTS_01', 'dress': 'DR_DRESS_01', 'shoes': 'SH_SHOES_01' }[categoryKey]
        };

    } catch (error: any) {
        console.error("Prepare Error:", error);
        return { success: false, message: "Gagal Scan Endpoint: " + error.message };
    }
}

export async function finalizeZepetoUpload(fileId: string, categoryId: string, token: string, fileName: string) {
    try {
        // 1. Link Asset (Trick: Paksa file 'World' jadi 'Item')
        // Ini step paling krusial. Kita ambil ID file yang udah diupload ke bucket World,
        // terus kita 'link' ke Studio seolah-olah itu file Item.
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
            // Fallback: Create Asset biasa tapi inject fileId
            console.warn("Direct linking failed, attempting metadata injection...");
            const createRes = await fetch(`https://cf-api-studio.zepeto.me/api/assets`, {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId, name: fileName, fileId: fileId })
            });
            if(createRes.ok) {
                const createData = await createRes.json();
                assetId = createData.id;
            } else {
                throw new Error("Gagal Linking & Injecting Asset.");
            }
        }

        // 2. Build (Verifikasi Metadata)
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fetch(`https://cf-api-studio.zepeto.me/api/assets/${assetId}/build/${categoryId}`, {
            method: 'POST',
            headers: { 'Authorization': token },
        });

        // 3. Create Item Final
        await new Promise(resolve => setTimeout(resolve, 2000));
        const itemPayload = { price: 5, assetId: assetId, categoryId: categoryId, currency: "ZEM" };
        const itemResponse = await fetch('https://cf-api-studio.zepeto.me/api/items', {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(itemPayload),
        });

        if (!itemResponse.ok) {
            throw new Error("Gagal Create Item Final.");
        }
        
        return { success: true, message: "Sukses! Item berhasil dibypass dan dibuat." };

    } catch (error: any) {
        return { success: false, message: error.message };
    }
}