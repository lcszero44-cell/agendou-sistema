import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { ArrowLeft, KeyRound, Lock, Mail, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

interface AdminAuthScreenProps {
  unverifiedUser?: User | null;
  unauthorizedEmail?: string | null;
  onBackToPublic: () => void;
  onUserReloaded?: () => void;
}

export const AdminAuthScreen: React.FC<AdminAuthScreenProps> = ({
  unverifiedUser,
  unauthorizedEmail,
  onBackToPublic,
  onUserReloaded,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'E-mail ou senha incorretos. Confira seus dados ou use "Esqueci minha senha".';
      case 'auth/email-already-in-use':
        return 'Este e-mail já possui conta. Faça login ou recupere a senha.';
      case 'auth/weak-password':
        return 'A senha deve ter pelo menos 6 caracteres.';
      case 'auth/invalid-email':
        return 'Informe um endereço de e-mail válido.';
      case 'auth/operation-not-allowed':
        return 'O login por E-mail/Senha ainda precisa ser ativado no Console do Firebase (Authentication > Sign-in method). Enquanto isso, você pode entrar instantaneamente com Google abaixo.';
      case 'auth/popup-closed-by-user':
        return 'A janela de login com Google foi fechada antes da conclusão.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.';
      default:
        return err instanceof Error ? err.message : 'Não foi possível autenticar agora.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
        setInfoMsg('Conta criada! Enviamos um link de confirmação para o seu e-mail.');
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMsg(
          'Se este e-mail estiver cadastrado, enviamos as instruções para redefinir sua senha.'
        );
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (unauthorizedEmail) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 sm:p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Acesso não autorizado
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              A conta <strong className="text-stone-900 dark:text-stone-100">{unauthorizedEmail}</strong> não
              está na lista de e-mails autorizados para criar lojas ou acessar o painel administrativo.
            </p>
          </div>
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full py-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold min-h-[48px]"
            >
              Sair e entrar com outra conta
            </button>
            <button
              type="button"
              onClick={onBackToPublic}
              className="w-full py-3 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-sm font-medium min-h-[44px]"
            >
              Voltar para a página pública
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (unverifiedUser) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 sm:p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Confirme seu e-mail
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Para proteger os dados dos seus clientes, confirme o link enviado para{' '}
              <strong className="text-stone-900 dark:text-stone-100">{unverifiedUser.email}</strong>.
            </p>
          </div>
          {infoMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs">
              {infoMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await unverifiedUser.reload();
                  if (auth.currentUser?.emailVerified) {
                    onUserReloaded?.();
                  } else {
                    setInfoMsg('Ainda aguardando confirmação. Verifique sua caixa de entrada e spam.');
                  }
                } catch (err) {
                  setErrorMsg(mapAuthError(err));
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full py-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold flex items-center justify-center gap-2 min-h-[48px]"
            >
              <RefreshCw className="w-4 h-4" />
              Já confirmei meu e-mail
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await sendEmailVerification(unverifiedUser);
                  setInfoMsg('Novo link de confirmação enviado!');
                } catch (err) {
                  setErrorMsg(mapAuthError(err));
                } finally {
                  setBusy(false);
                }
              }}
              className="w-full py-3 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-sm font-medium min-h-[44px]"
            >
              Reenviar e-mail
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 underline py-2"
            >
              Sair e usar outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col justify-center p-4">
      <div className="max-w-md w-full mx-auto space-y-5">
        <button
          type="button"
          onClick={onBackToPublic}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para a página pública
        </button>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Acesso protegido · Firebase Authentication
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-50">
              {mode === 'login' && 'Painel do Profissional'}
              {mode === 'signup' && 'Criar conta da loja'}
              {mode === 'reset' && 'Recuperar senha'}
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {mode === 'login' && 'Entre para gerenciar sua agenda, serviços, equipe e horários.'}
              {mode === 'signup' && 'Crie sua conta segura vinculada à sua loja.'}
              {mode === 'reset' && 'Informe seu e-mail cadastrado para receber o link de redefinição.'}
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs leading-relaxed"
            >
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs leading-relaxed">
              {infoMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setInfoMsg(null);
                        setMode('reset');
                      }}
                      className="text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 underline underline-offset-2"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 px-4 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity min-h-[48px] disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {busy
                ? 'Aguarde...'
                : mode === 'login'
                ? 'Entrar com e-mail e senha'
                : mode === 'signup'
                ? 'Criar conta'
                : 'Enviar link de recuperação'}
            </button>
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-stone-200 dark:border-stone-800" />
            <span className="shrink-0 mx-3 text-xs text-stone-400">ou acesso rápido</span>
            <div className="flex-grow border-t border-stone-200 dark:border-stone-800" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-4 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm font-semibold flex items-center justify-center gap-2.5 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors min-h-[48px] disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.29 14.29A7.18 7.18 0 0 1 4.91 12c0-.79.14-1.56.38-2.29V6.61H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l4-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.1C6.23 6.87 8.88 4.76 12 4.76z"
              />
            </svg>
            Entrar com Google
          </button>

          <div className="text-center text-xs text-stone-500 dark:text-stone-400">
            {mode === 'login' ? (
              <>
                Ainda não tem conta?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setInfoMsg(null);
                    setMode('signup');
                  }}
                  className="font-semibold text-stone-900 dark:text-stone-100 underline underline-offset-2"
                >
                  Criar agora
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setInfoMsg(null);
                  setMode('login');
                }}
                className="font-semibold text-stone-900 dark:text-stone-100 underline underline-offset-2"
              >
                Voltar para entrar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
