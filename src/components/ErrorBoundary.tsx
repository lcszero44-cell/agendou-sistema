import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    let message = 'Ocorreu um erro inesperado ao carregar esta tela.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.error) {
        if (String(parsed.error).includes('Quota exceeded')) {
          message = 'Limite diário gratuito do banco de dados atingido. Ele será renovado amanhã.';
        } else if (String(parsed.error).includes('Missing or insufficient permissions')) {
          message = 'Sem permissão para acessar estes dados. Verifique se você está logado com a conta administradora da loja.';
        } else {
          message = parsed.error;
        }
      }
    } catch {
      if (error.message) message = error.message;
    }
    return { hasError: true, message };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary capturou:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 p-6">
          <div className="max-w-md w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              Algo não saiu como esperado
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
