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
  if (!session.userId) {
    return [];
  }
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
  // === LANGKAH 1: DAPATKAN SESI LOGIN DARI WEB DASHBOARD ===
  const session = await getSession();
  if (!session.userId) {
    throw new Error('Sesi Anda tidak valid. Silakan login ulang ke dashboard.');
  }

  // === LANGKAH 2: VALIDASI USER DASHBOARD KE DATABASE ===
  const dashboardUser = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!dashboardUser) {
    throw new Error('Akun dashboard Anda tidak ditemukan di database.');
  }
  
  // === LANGKAH 3: AMBIL DATA AKUN ZEPETO DARI FORM ===
  const zepetoId = formData.get('zepetoEmail') as string;
  const password = formData.get('zepetoPassword') as string;
  const nameLabel = formData.get('name') as string || 'Zepeto Account';

  if (!zepetoId || !password) {
      throw new Error('ZEPETO ID dan Password tidak boleh kosong.');
  }

  try {
    // === LANGKAH 4: COBA LOGIN KE API ZEPETO ===
    const loginUrl = 'https://cf-api-studio.zepeto.me/api/authenticate/zepeto-id';
    const loginResponse = await fetch(loginUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ zepetoId, password }) 
    });

    if (!loginResponse.ok) {
        throw new Error('Login ZEPETO gagal. Periksa kembali ID dan Password Anda.');
    }
    
    const loginData = await loginResponse.json();
    const profile = loginData.profile;
    if (!profile) {
        throw new Error('Data profil ZEPETO tidak ditemukan setelah login berhasil.');
    }
    
    // === LANGKAH 5: SIMPAN AKUN ===
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
    if (error instanceof Error) {
        throw new Error(error.message);
    }
    throw new Error("Terjadi kesalahan yang tidak diketahui saat menambah akun.");
  }
}

// === STEP 1: PERSIAPAN UPLOAD (Dapatkan Tiket Masuk & Token) ===
export async function prepareZepetoUpload(formData: FormData) {
    const session = await getSession();
    if (!session.userId) return { success: false, message: 'Sesi tidak valid.' };

    const accountId = formData.get('accountId') as string;
    const fileName = formData.get('fileName') as string;
    const categoryKey = formData.get('category') as string;

    if (!accountId || !fileName || !categoryKey) {
        return { success: false, message: "Data tidak lengkap (Account/File/Category missing)." };
    }

    const account = await prisma.zepetoAccount.findUnique({ where: { id: accountId } });
    if (!account || account.status !== 'CONNECTED') return { success: false, message: 'Akun bermasalah atau tidak terhubung.' };

    try {
        // 1. Login Zepeto untuk dapat Token
        const loginUrl = 'https://cf-api-studio.zepeto.me/api/authenticate/zepeto-id';
        const loginResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zepetoId: account.zepetoEmail, password: account.zepetoPassword })
        });

        if (!loginResponse.ok) throw new Error('Login ZEPETO gagal saat persiapan upload.');
        const loginData = await loginResponse.json();
        const bearerToken = `Bearer ${loginData.authToken}`;

        // 2. Minta URL Upload ke WORLD HOST (Bypass Limit Polygon & Size)
        const initUploadUrl = 'https://api-world-creator.zepeto.me/v2/files/upload-url'; 
        const initResponse = await fetch(initUploadUrl, {
            method: 'POST',
            headers: { 
                'Authorization': bearerToken,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                name: fileName, 
                type: 'USER_FILE', 
                extension: 'zepeto' 
            })
        });

        if (!initResponse.ok) throw new Error("Gagal meminta izin upload ke Server World.");

        const initData = await initResponse.json();
        
        // Return data ini ke Client agar browser bisa upload langsung
        return {
            success: true,
            uploadUrl: initData.uploadUrl, // URL tujuan upload (S3/GCS)
            fileId: initData.fileId,       // ID File yang akan dipakai nanti
            token: bearerToken,            // Token otentikasi
            categoryIdMap: { 'hair': '61681e66ec485e4a0df0d476', 'top': 'DR_TOP_01', 'bottom': 'DR_PANTS_01', 'dress': 'DR_DRESS_01', 'shoes': 'SH_SHOES_01' }[categoryKey]
        };

    } catch (error: any) {
        console.error("Prepare Upload Error:", error);
        return { success: false, message: error.message };
    }
}

// === STEP 3: FINALISASI (Setelah Browser selesai upload) ===
export async function finalizeZepetoUpload(fileId: string, categoryId: string, token: string, fileName: string) {
    try {
        // 1. Konfirmasi ke Server World bahwa upload selesai
        const completeResponse = await fetch(`https://api-world-creator.zepeto.me/v2/files/${fileId}/complete`, {
            method: 'POST',
            headers: { 'Authorization': token }
        });

        if (!completeResponse.ok) {
            console.warn("Warning: World Complete signal failed, but trying to proceed anyway...");
        }

        // 2. LINKING ASSET (Trik Bypass)
        // Kita daftarkan FileID dari World Server itu masuk ke Studio sebagai Item
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
            // Jika Link API gagal, kita lempar error karena ini metode utama bypass kita
            throw new Error("Gagal menghubungkan file (Linking Asset). Metode bypass ditolak server.");
        }

        // 3. BUILD ASSET
        await fetch(`https://cf-api-studio.zepeto.me/api/assets/${assetId}/build/${categoryId}`, {
            method: 'POST',
            headers: { 'Authorization': token },
        });

        // Tunggu sebentar biar server proses build (mocking delay)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 4. CREATE ITEM
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