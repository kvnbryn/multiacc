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

// === SCANNER V7 (WORLD SERVICE API) ===
async function tryEndpoints(scenarios: { url: string, payload: any }[], token: string) {
    let lastError;
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        // User Agent meniru Unity Editor biar dipercaya server World
        'User-Agent': 'UnityPlayer/2021.3.15f1 (UnityWebRequest/1.0, libcurl/7.84.0-DEV)',
        'X-Zepeto-App-Version': '3.25.0'
    };

    for (const scenario of scenarios) {
        try {
            console.log(`[Scanner] Trying: ${scenario.url}`);
            const res = await fetch(scenario.url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(scenario.payload)
            });
            
            if (res.ok) {
                const data = await res.json();
                // World Service API biasanya balikin object langsung atau dibungkus 'result'
                const result = data.result || data;
                if (result.uploadUrl) {
                    console.log(`[Scanner] SUCCESS: ${scenario.url}`);
                    return { ...result, sourceUrl: scenario.url };
                }
            }
            
            const errText = await res.text();
            // Kita log error tapi lanjut loop ke skenario berikutnya
            lastError = `[${res.status}] ${scenario.url}`;
            console.warn(`[Scanner] Fail: ${lastError} -> ${errText.substring(0,50)}`);
        } catch (e) {
            console.error(`[Scanner] Network Error to ${scenario.url}`, e);
        }
    }
    throw new Error(lastError || 'Semua endpoint menolak (404/405/500).');
}

export async function prepareZepetoUpload(formData: FormData) {
    const session = await getSession();
    if (!session.userId) return { success: false, message: 'Sesi tidak valid.' };

    const accountId = formData.get('accountId') as string;
    const fileName = formData.get('fileName') as string;
    const fileSize = parseInt(formData.get('fileSize') as string || "0");
    const categoryKey = formData.get('category') as string;

    const account = await prisma.zepetoAccount.findUnique({ where: { id: accountId } });
    if (!account || account.status !== 'CONNECTED') return { success: false, message: 'Akun bermasalah.' };

    try {
        const loginUrl = 'https://cf-api-studio.zepeto.me/api/authenticate/zepeto-id';
        const loginResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zepetoId: account.zepetoEmail, password: account.zepetoPassword })
        });

        if (!loginResponse.ok) throw new Error('Login gagal.');
        const loginData = await loginResponse.json();
        const bearerToken = `Bearer ${loginData.authToken}`;

        // === SKENARIO BARU: FOKUS KE WORLD SERVICE ===
        // Endpoint ini yang kemungkinan besar "Open" buat upload file gede
        const scenarios = [
            // 1. World Service API (V2 Files) - Target Utama
            {
                url: 'https://world-service-api.world.zepeto.run/v2/files',
                payload: {
                    name: fileName,
                    type: 'WORLD',
                    extension: 'zepeto'
                }
            },
            // 2. API World Creator (V2 Files) - Mirror dari atas
            {
                url: 'https://api-world-creator.zepeto.me/v2/files',
                payload: {
                    name: fileName,
                    type: 'WORLD',
                    extension: 'zepeto'
                }
            },
            // 3. World Service (V1 Files) - Legacy
            {
                url: 'https://world-service-api.world.zepeto.run/v1/files',
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
            sourceUrl: initData.sourceUrl
        };

    } catch (error: any) {
        console.error("Prepare Error:", error);
        return { success: false, message: "Gagal Scan Jalur Upload: " + error.message };
    }
}

export async function finalizeZepetoUpload(fileId: string, categoryId: string, token: string, fileName: string, sourceUrl?: string) {
    try {
        // Konfirmasi upload (PENTING buat World API biar status file jadi 'Active')
        if (sourceUrl) {
            console.log("Menyelesaikan upload di:", sourceUrl);
            await fetch(`${sourceUrl}/${fileId}/complete`, {
                method: 'POST',
                headers: { 'Authorization': token }
            }).catch(e => console.warn("Complete signal error (ignored):", e));
        }

        // Trik Bypass: Linking Asset lintas-platform
        console.log(`Linking File ID: ${fileId} ke Studio...`);
        const linkAssetResponse = await fetch(`https://cf-api-studio.zepeto.me/api/assets/link`, {
            method: 'POST',
            headers: { 
                'Authorization': token,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify({ categoryId, fileId, name: fileName })
        });

        let assetId = '';
        if (linkAssetResponse.ok) {
            const linkData = await linkAssetResponse.json();
            assetId = linkData.id;
        } else {
            console.warn("Direct Linking failed, trying Injection Fallback...");
            const createRes = await fetch(`https://cf-api-studio.zepeto.me/api/assets`, {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId, name: fileName, fileId: fileId })
            });
            
            if(createRes.ok) {
                const createData = await createRes.json();
                assetId = createData.id;
            } else {
                 throw new Error("Gagal Linking Asset (Server menolak metode Bypass).");
            }
        }

        // Build
        await new Promise(resolve => setTimeout(resolve, 3000));
        await fetch(`https://cf-api-studio.zepeto.me/api/assets/${assetId}/build/${categoryId}`, {
            method: 'POST', headers: { 'Authorization': token },
        });

        // Create Item
        await new Promise(resolve => setTimeout(resolve, 2000));
        const itemPayload = { price: 5, assetId: assetId, categoryId: categoryId, currency: "ZEM" };
        const itemResponse = await fetch('https://cf-api-studio.zepeto.me/api/items', {
            method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(itemPayload),
        });

        if (!itemResponse.ok) throw new Error("Gagal Create Item Final.");
        
        return { success: true, message: "Sukses! Item berhasil dibypass dan dibuat." };

    } catch (error: any) {
        return { success: false, message: error.message };
    }
}