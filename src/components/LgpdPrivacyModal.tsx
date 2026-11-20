import React from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface LgpdPrivacyModalProps {
  open: boolean;
  storeName: string;
  onClose: () => void;
}

export const LgpdPrivacyModal: React.FC<LgpdPrivacyModalProps> = ({
  open,
  storeName,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lgpd-modal-title"
    >
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="lgpd-modal-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                Política de Privacidade (LGPD)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {storeName} · Lei nº 13.709/2018
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar política de privacidade"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
              1. Quais dados coletamos
            </h3>
            <p>
              Coletamos apenas seu nome, número de WhatsApp e, opcionalmente, seu e-mail e
              observações de preferência para realizar e organizar o seu atendimento.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
              2. Para que usamos seus dados
            </h3>
            <p>
              Seus dados são utilizados exclusivamente por {storeName} para confirmar horários,
              enviar lembretes pelo WhatsApp, permitir que você remarque ou cancele pelo seu link
              pessoal e organizar a fila de espera quando solicitado.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
              3. Segurança e sigilo
            </h3>
            <p>
              Seus dados pessoais nunca ficam visíveis na página pública nem são vendidos ou
              compartilhados com terceiros. Apenas a administração autenticada de {storeName} tem
              acesso à agenda de clientes.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
              4. Seus direitos como titular
            </h3>
            <p>
              Você pode solicitar acesso, correção ou exclusão definitiva dos seus dados a qualquer
              momento entrando em contato pelo WhatsApp oficial de {storeName}.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 px-4 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
        >
          Entendi
        </button>
      </div>
    </div>
  );
};
