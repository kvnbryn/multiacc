// File: /app/dashboard/akun/page.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { getZepetoAccounts, addZepetoAccount, deleteZepetoAccount, validateAccount } from '../actions';
import type { ZepetoAccount } from '@prisma/client';
import { Modal } from '../_components/Modal';

function StatusIndicator({ status, lastValidatedAt }: { status: string; lastValidatedAt?: Date | null }) {
    const isConnected = status === 'CONNECTED';
    const statusText = isConnected ? 'Terhubung' : 'Gagal';
    const bgColor = isConnected ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30';
    const dotColor = isConnected ? 'bg-green-400' : 'bg-red-400';

    return (
        <div className={`flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${bgColor}`}>
            <span className={`w-2 h-2 mr-1.5 rounded-full ${dotColor}`}></span>
            <span>{statusText}</span>
            {lastValidatedAt && (
                <span className="ml-2 opacity-70 hidden sm:inline">
                    ({new Date(lastValidatedAt).toLocaleDateString()})
                </span>
            )}
        </div>
    );
}

function AccountCard({ account, onAction }: { account: ZepetoAccount, onAction: () => void }) {
    const [isDeleting, startDeleteTransition] = useTransition();
    const [isValidating, startValidateTransition] = useTransition();

    const handleDelete = (formData: FormData) => {
        if (confirm('Apakah Anda yakin ingin menghapus akun ini?')) {
            startDeleteTransition(async () => {
                await deleteZepetoAccount(formData);
                onAction();
            });
        }
    };

    const handleValidate = (formData: FormData) => {
        startValidateTransition(async () => {
            await validateAccount(formData);
            onAction();
        });
    }

    return (
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50 transition-all hover:border-indigo-500/50">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    {account.profilePic ? (
                        <img 
                            src={account.profilePic} 
                            alt={account.displayName || ''} 
                            className="w-12 h-12 rounded-full object-cover border-2 border-gray-600" 
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-indigo-400 font-bold">
                           {(account.displayName || account.zepetoEmail).charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="flex-grow">
                        <p className="font-bold text-white">{account.displayName || account.name}</p>
                        <p className="text-sm text-gray-400">@{account.username || account.zepetoEmail}</p>
                    </div>
                </div>
                <form action={handleDelete}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <button type="submit" disabled={isDeleting} className="text-gray-500 hover:text-red-400 p-1 rounded-md transition-colors disabled:text-gray-600 disabled:cursor-not-allowed">
                        {isDeleting ? '...' : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                    </button>
                </form>
            </div>
            <div className="mt-4 flex items-center justify-between">
                <StatusIndicator status={account.status} lastValidatedAt={account.lastValidatedAt} />
                <form action={handleValidate}>
                    <input type="hidden" name="accountId" value={account.id} />
                    <button type="submit" disabled={isValidating} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors disabled:text-gray-600 disabled:cursor-not-allowed">
                        {isValidating ? 'Memeriksa...' : 'Cek Ulang Koneksi'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function AkunPage() {
    const [accounts, setAccounts] = useState<ZepetoAccount[]>([]);
    const [isModalOpen, setModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [modalError, setModalError] = useState<string | null>(null);
    const [isSubmitting, startSubmitTransition] = useTransition();

    const fetchAccounts = async () => {
        setIsLoading(true);
        const fetchedAccounts = await getZepetoAccounts(); 
        setAccounts(fetchedAccounts);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const handleFormSubmit = (formData: FormData) => {
        setModalError(null);
        startSubmitTransition(async () => {
            try {
                const result = await addZepetoAccount(formData);
                if (result?.success) {
                    await fetchAccounts();
                    setModalOpen(false);
                }
            } catch (error) {
                if (error instanceof Error) {
                    setModalError(error.message);
                } else {
                    setModalError('Terjadi kesalahan yang tidak diketahui.');
                }
            }
        });
    };
    
    const closeModal = () => {
        if (isSubmitting) return;
        setModalOpen(false);
        setModalError(null);
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-white">Manajemen Akun</h1>
                <button 
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors"
                >
                     <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
                    Tambah Akun
                </button>
            </div>
            
            {isLoading && accounts.length === 0 ? (
                <p className="text-center text-gray-400 mt-16">Memuat data akun...</p>
            ) : accounts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {accounts.map((acc) => <AccountCard key={acc.id} account={acc} onAction={fetchAccounts} />)}
                </div>
            ) : (
                <div className="text-center py-16 px-6 bg-gray-800/50 rounded-2xl border border-gray-700/50 mt-8">
                    <h3 className="text-lg font-semibold text-white">Belum Ada Akun</h3>
                    <p className="text-gray-400 mt-2">Klik tombol &apos;Tambah Akun&apos; untuk memulai.</p>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={closeModal} title="Tambah Akun ZEPETO Baru">
                 <form action={handleFormSubmit} className="space-y-4">
                    {modalError && (
                        <div className="p-3 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-sm">
                            {modalError}
                        </div>
                    )}
                    <div>
                        <label htmlFor="zepetoEmailModal" className="text-sm text-gray-400 mb-1 block">ZEPETO ID</label>
                        <input type="text" id="zepetoEmailModal" name="zepetoEmail" required placeholder="zepeto.creator" className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                    </div>
                    <div>
                        <label htmlFor="zepetoPasswordModal" className="text-sm text-gray-400 mb-1 block">Password</label>
                        <input type="password" id="zepetoPasswordModal" name="zepetoPassword" required placeholder="••••••••" className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                    </div>
                     <input type="hidden" name="name" value="Zepeto Account" />
                    <button type="submit" disabled={isSubmitting} className="w-full py-3 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                        {isSubmitting ? 'Menyimpan...' : 'Simpan Akun'}
                    </button>
                </form>
            </Modal>
        </div>
    );
}