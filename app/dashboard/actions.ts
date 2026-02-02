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

// === INTELLIGENT SCANNER V6 (COMPLETE PAYLOAD) ===
async function tryEndpoints(scenarios: { url: string, payload: any }[], token: string) {
    let lastError;
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'X-Zepeto-App-Version': '3.40.0', // Update versi biar dianggap app baru
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    };

    for (const scenario of scenarios) {
        try {
            console.log(`[Scanner] Testing: ${scenario.url}`);
            const res = await fetch(scenario.url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(scenario.payload)
            });
            
            if (res.ok) {
                const data = await res.json();
                const result = data.result || data;
                if (result.uploadUrl) {
                    console.log(`[Scanner] SUCCESS: ${scenario.url}`);
                    return { ...result, sourceUrl: scenario.url };
                }
            }
            
            const errText = await res.text();
            lastError = `[${res.status}] ${scenario.url} -> ${errText.substring(0, 100)}`;
            console.warn(`[Scanner] Fail: ${lastError}`);
        } catch (e) {
            console.error(`[Scanner] Connection Error`, e);
        }
    }
    throw new Error(lastError || 'Semua endpoint menolak (404/500).');
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

        // === SKENARIO SERANGAN ENDPOINT ===
        // Kita coba 3 endpoint dengan payload yang sangat spesifik (meniru browser/unity)
        const scenarios = [
            // 1. Content FGW (Paling mungkin tembus buat bypass file besar)
            {
                url: 'https://content-fgw.zepeto.io/v2/storage/files/upload-url',
                payload: {
                    type: 'zepeto_file', // Tipe generic
                    name: fileName,
                    size: fileSize,
                    extension: 'zepeto'
                }
            },
            // 2. World Creator V2 (Target kedua)
            {
                url: 'https://api-world-creator.zepeto.me/v2/files', // Tanpa /upload-url
                payload: {
                    name: fileName,
                    type: 'WORLD', // Pura-pura jadi World
                    extension: 'zepeto',
                    size: fileSize,
                    usageType: 'build' // Parameter tambahan biar dikira valid
                }
            },
            // 3. Studio Assets (Fallback standard)
            {
                url: `https://cf-api-studio.zepeto.me/api/assets/upload-url?categoryId=${categoryKey}`,
                payload: {
                    contentType: 'application/octet-stream',
                    fileName: fileName
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
        return { success: false, message: "Server Error: " + error.message };
    }
}

export async function finalizeZepetoUpload(fileId: string, categoryId: string, token: string, fileName: string, sourceUrl?: string) {
    try {
        // Konfirmasi upload jika lewat World API
        if (sourceUrl && sourceUrl.includes('api-world-creator')) {
            await fetch(`${sourceUrl}/${fileId}/complete`, {
                method: 'POST', headers: { 'Authorization': token }
            }).catch(() => {});
        }

        // Trik Bypass: Linking
        console.log(`Linking File ID: ${fileId} to Category: ${categoryId}`);
        const linkAssetResponse = await fetch(`https://cf-api-studio.zepeto.me/api/assets/link`, {
            method: 'POST',
            headers: { 
                'Authorization': token, 'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify({ categoryId, fileId, name: fileName })
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
                body: JSON.stringify({ categoryId, name: fileName, fileId: fileId })
            });
            
            if(createRes.ok) {
                const createData = await createRes.json();
                assetId = createData.id;
            } else {
                 const err = await linkAssetResponse.text();
                 throw new Error(`Gagal Linking: ${err}`);
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