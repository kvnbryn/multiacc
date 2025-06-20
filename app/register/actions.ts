// app/register/actions.ts

'use server';

import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';

export async function register(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password || password.length < 6) {
        return redirect('/register?error=InvalidData');
    }

    // Cek apakah user sudah ada
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return redirect('/register?error=UserExists');
    }

    // Hash password sebelum disimpan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru di database
    await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
        },
    });

    // Redirect ke halaman login setelah berhasil register
    redirect('/login?success=Registered');
}