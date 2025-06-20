import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

interface SessionData {
  userId?: string;
  isLoggedIn: boolean;
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'zepeto-dashboard-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(
    cookies(), 
    sessionOptions
  );
  
  return session;
}
