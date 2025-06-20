// app/login/actions.ts

'use server';

import prisma from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // ===== PERBAIKAN DI SINI =====
  // Jika email atau password kosong, redirect dengan pesan error
  if (!email || !password) {
    return redirect('/login?error=MissingFields');
  }
  // =============================

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return redirect('/login?error=InvalidCredentials');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return redirect('/login?error=InvalidCredentials');
  }

  // Jika berhasil, buat session
  const session = await getSession();
  session.userId = user.id;
  session.isLoggedIn = true;
  await session.save();

  // Redirect ke dashboard
  redirect('/dashboard');
}