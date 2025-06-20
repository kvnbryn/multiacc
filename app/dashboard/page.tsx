// app/dashboard/page.tsx

import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getZepetoAccounts } from './actions';
import { ZepetoUploader } from './_components/ZepetoUploader';

export default async function DashboardUploadPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    redirect('/login');
  }

  const accounts = await getZepetoAccounts(session.userId);

  return (
    <div>
        <h1 className="text-3xl font-bold text-white mb-6">Upload Item ZEPETO</h1>
        <div className="max-w-2xl">
             <div className="bg-gray-800/50 p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-700/50">
                <ZepetoUploader accounts={accounts} />
            </div>
        </div>
    </div>
  );
}
