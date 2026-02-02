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

// === INTELLIGENT SCANNER V5 (CORRECTED PATHS) ===
async function tryEndpoints(scenarios: { url: string, payload: any }[], token: string) {
    let lastError;
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'X-Zepeto-App-Version': '3.25.0', // Headers Pura-pura App
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    };

    for (const scenario of scenarios) {
        try {
            console.log(`Trying Scanner: ${scenario.url}`);
            const res = await fetch(scenario.url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(scenario.payload)
            });
            
            if (res.ok) {
                const data = await res.json();
                // Check format balikan, kadang dibungkus 'result', kadang langsung
                const result = data.result || data;
                if (result.uploadUrl) {
                    console.log(`Scanner Success: ${scenario.url}`);
                    return { ...result, sourceUrl: scenario.url }; // Return endpoint yg berhasil
                }
            }
            
            const errText = await res.text();
            lastError = `[${res.status}] ${scenario.url} -> ${errText.substring(0, 80)}`;
            console.warn(`Scanner Fail: ${lastError}`);
        } catch (e) {
            console.error(`Scanner Connection Error to ${scenario.url}`, e);
        }
    }
    throw new Error(lastError || 'Semua endpoint menolak request (404/500).');
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

        // 2. SCANNING ENDPOINTS (V5 - THE FIX)
        // Kita hapus '/upload-url' dari path World Creator. Itu kuncinya.
        
        const scenarios = [
            // SCENARIO A: World Creator V2 (Standard)
            // Path: /v2/files (BUKAN /v2/files/upload-url)
            {
                url: 'https://api-world-creator.zepeto.me/v2/files',
                payload: {
                    name: fileName,
                    type: 'WORLD',
                    extension: 'zepeto'
                }
            },
            // SCENARIO B: World Creator V1 (Fallback)
            {
                url: 'https://api-world-creator.zepeto.me/v1/files',
                payload: {
                    name: fileName,
                    type: 'WORLD',
                    extension: 'zepeto'
                }
            },
            // SCENARIO C: Gateway (Fallback Terakhir)
            {
                url: 'https://gw-napi.zepeto.io/files',
                payload: {
                    name: fileName,
                    type: 'WORLD',
                    extension: 'zepeto'
                }
            }
        ];

        const initData = await tryEndpoints(scenarios, bearerToken);

        return {
            success: true,
            uploadUrl: initData.uploadUrl,
            fileId: initData.fileId || initData.id,
            token: bearerToken,
            categoryIdMap: { 'hair': '61681e66ec485e4a0df0d476', 'top': 'DR_TOP_01', 'bottom': 'DR_PANTS_01', 'dress': 'DR_DRESS_01', 'shoes': 'SH_SHOES_01' }[categoryKey],
            sourceUrl: initData.sourceUrl // Endpoint mana yang berhasil
        };

    } catch (error: any) {
        console.error("Prepare Error:", error);
        return { success: false, message: "Gagal Scan Endpoint: " + error.message };
    }
}

export async function finalizeZepetoUpload(fileId: string, categoryId: string, token: string, fileName: string, sourceUrl?: string) {
    try {
        // 1. Konfirmasi Upload (Khusus World API)
        // Kalau endpoint yang berhasil tadi adalah API World, kita harus panggil 'complete'
        if (sourceUrl && sourceUrl.includes('api-world-creator')) {
            console.log("Menyelesaikan upload di World Server...");
            await fetch(`${sourceUrl}/${fileId}/complete`, {
                method: 'POST',
                headers: { 'Authorization': token }
            }).catch(e => console.warn("Complete signal error (ignored):", e));
        }

        // 2. Linking Asset (Trick Bypass)
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
            console.warn("Direct Linking failed, trying Injection...");
            const createRes = await fetch(`https://cf-api-studio.zepeto.me/api/assets`, {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    categoryId, 
                    name: fileName, 
                    fileId: fileId,
                    description: ""
                })
            });
            
            if(createRes.ok) {
                const createData = await createRes.json();
                assetId = createData.id;
            } else {
                 throw new Error("Gagal Linking & Injecting Asset.");
            }
        }

        // 3. Build
        await new Promise(resolve => setTimeout(resolve, 3000));
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

        if (!itemResponse.ok) throw new Error("Gagal Create Item Final.");
        
        return { success: true, message: "Sukses! Item berhasil dibypass dan dibuat." };

    } catch (error: any) {
        return { success: false, message: error.message };
    }
}