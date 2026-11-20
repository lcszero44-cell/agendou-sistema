import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { SEGMENT_TEMPLATES } from '../../config/segmentTemplates';
import { formatBrazilianPhoneInput, getDayLabelShort } from '../../lib/brUtils';
import { saveServiceItem, saveStaffMember, updateStoreConfig } from '../../lib/storeRepository';
import { SegmentKey, ServiceItem, StaffMember, StoreConfig } from '../../types/booking';

interface OnboardingWizardModalProps {
  open: boolean;
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
  onClose: () => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({
  open,
  store,
  services,
  staff,
  onClose,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [segment, setSegment] = useState<SegmentKey>(store.segment);
  const [storeName, setStoreName] = useState(store.name);
  const [whatsapp, setWhatsapp] = useState(formatBrazilianPhoneInput(store.whatsapp));
  const [pixKey, setPixKey] = useState(store.pixKey || '');
  const [address, setAddress] = useState(store.address || '');
  const [firstServiceName, setFirstServiceName] = useState(services[0]?.name || '');
  const [firstStaffName, setFirstStaffName] = useState(staff[0]?.name || '');
  const [hours, setHours] = useState(store.businessHours);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleFinish = async () => {
    setSaving(true);
    try {
      const tpl = SEGMENT_TEMPLATES[segment];
      await updateStoreConfig({
        ...store,
        segment,
        name: storeName.trim() || store.name,
        primaryColor: tpl.store.primaryColor,
        accentColor: tpl.store.accentColor,
        heroImage: tpl.store.heroImage,
        whatsapp,
        pixKey,
        address,
        mapsQuery: address,
        businessHours: hours,
        onboardingCompleted: true,
      });

      if (services[0] && firstServiceName.trim() && firstServiceName !== services[0].name) {
        await saveServiceItem(
          store.storeId,
          { ...services[0], name: firstServiceName.trim() },
          false
        );
      }

      if (staff[0] && firstStaffName.trim() && firstStaffName !== staff[0].name) {
        await saveStaffMember(store.storeId, { ...staff[0], name: firstStaffName.trim() }, false);
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Configuração rápida · Passo {step} de 5
            </p>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              {step === 1 && 'Escolha o modelo da sua loja'}
              {step === 2 && 'Revise seus serviços principais'}
              {step === 3 && 'Defina sua equipe inicial'}
              {step === 4 && 'Confirme os dias de atendimento'}
              {step === 5 && 'Conecte seu WhatsApp e Pix'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="h-1 bg-stone-100 dark:bg-stone-800">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${step * 20}%`, backgroundColor: store.primaryColor }}
          />
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1.5">
                  Nome do seu negócio
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-stone-500">
                  Segmento de atuação
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(SEGMENT_TEMPLATES) as SegmentKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSegment(key)}
                      className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                        segment === key
                          ? 'text-white border-transparent'
                          : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                      }`}
                      style={
                        segment === key
                          ? { backgroundColor: SEGMENT_TEMPLATES[key].store.primaryColor }
                          : undefined
                      }
                    >
                      {SEGMENT_TEMPLATES[key].shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Sua loja já possui <strong>{services.length} serviço(s)</strong> configurados. Você
                pode renomear o principal abaixo ou ajustar todos na aba Serviços.
              </p>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Serviço em destaque
                </label>
                <input
                  type="text"
                  value={firstServiceName}
                  onChange={(e) => setFirstServiceName(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Defina o nome do profissional principal exibido na página pública. Depois você pode
                adicionar toda a equipe na aba Equipe.
              </p>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Profissional principal
                </label>
                <input
                  type="text"
                  value={firstStaffName}
                  onChange={(e) => setFirstStaffName(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <p className="text-xs text-stone-500 mb-2">
                Marque os dias em que a loja atende:
              </p>
              {['1', '2', '3', '4', '5', '6', '0'].map((k) => {
                const d = hours[k] || { enabled: false, open: '09:00', close: '18:00' };
                return (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 text-xs"
                  >
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={d.enabled}
                        onChange={(e) =>
                          setHours({ ...hours, [k]: { ...d, enabled: e.target.checked } })
                        }
                      />
                      {getDayLabelShort(Number(k))}
                    </label>
                    {d.enabled ? (
                      <div className="flex items-center gap-1.5 font-mono-nums">
                        <input
                          type="time"
                          value={d.open}
                          onChange={(e) =>
                            setHours({ ...hours, [k]: { ...d, open: e.target.value } })
                          }
                          className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                        />
                        <span>–</span>
                        <input
                          type="time"
                          value={d.close}
                          onChange={(e) =>
                            setHours({ ...hours, [k]: { ...d, close: e.target.value } })
                          }
                          className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                        />
                      </div>
                    ) : (
                      <span className="text-stone-400">Fechado</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  WhatsApp da loja (com DDD)
                </label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(formatBrazilianPhoneInput(e.target.value))}
                  placeholder="(11) 99999-8888"
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Endereço de atendimento
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">
                  Chave Pix (opcional, para sinal anti-falta)
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="E-mail, CNPJ, telefone ou chave aleatória"
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4 | 5)}
              className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4 | 5)}
              className="px-5 py-2.5 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 min-h-[44px]"
              style={{ backgroundColor: store.primaryColor }}
            >
              Próximo passo
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleFinish}
              className="px-5 py-2.5 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
              style={{ backgroundColor: store.primaryColor }}
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Finalizando...' : 'Concluir configuração'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
