import React, { useState } from 'react';
import { Edit2, Plus, QrCode, Trash2, X } from 'lucide-react';
import { formatCurrencyBRL } from '../../lib/brUtils';
import { deleteServiceItem, saveServiceItem } from '../../lib/storeRepository';
import { ServiceItem, StoreConfig } from '../../types/booking';

interface AdminServicesTabProps {
  store: StoreConfig;
  services: ServiceItem[];
}

const EMPTY_SERVICE: Omit<ServiceItem, 'id' | 'storeId'> = {
  name: '',
  description: '',
  category: 'Consultas',
  durationMinutes: 45,
  priceCents: 15000,
  bufferMinutes: 10,
  requiresDeposit: false,
  depositAmountCents: 5000,
  returnDays: 30,
  active: true,
  sortOrder: 1,
};

export const AdminServicesTab: React.FC<AdminServicesTabProps> = ({ store, services }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [form, setForm] = useState<Omit<ServiceItem, 'id' | 'storeId'>>(EMPTY_SERVICE);
  const [priceReais, setPriceReais] = useState('150,00');
  const [depositReais, setDepositReais] = useState('50,00');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const parseReaisToCents = (val: string): number => {
    const clean = val.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return Number.isFinite(num) ? Math.round(num * 100) : 0;
  };

  const centsToInput = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_SERVICE, sortOrder: services.length + 1 });
    setPriceReais('150,00');
    setDepositReais('50,00');
    setModalOpen(true);
  };

  const openEdit = (srv: ServiceItem) => {
    setEditing(srv);
    const { id: _id, storeId: _sid, ...rest } = srv;
    setForm(rest);
    setPriceReais(centsToInput(srv.priceCents));
    setDepositReais(centsToInput(srv.depositAmountCents || 5000));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: ServiceItem = {
        ...form,
        id: editing?.id || '',
        storeId: store.storeId,
        priceCents: parseReaisToCents(priceReais),
        depositAmountCents: form.requiresDeposit ? parseReaisToCents(depositReais) : 0,
      };
      await saveServiceItem(store.storeId, payload, !editing);
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (srv: ServiceItem) => {
    await saveServiceItem(store.storeId, { ...srv, active: !srv.active }, false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Serviços e sinal via Pix
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Configure durações, intervalos de higienização/preparo, preços e exigência de sinal por serviço.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap"
          style={{ backgroundColor: store.primaryColor }}
        >
          <Plus className="w-4 h-4" />
          Novo serviço
        </button>
      </div>

      {services.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center space-y-3">
          <p className="font-medium text-stone-900 dark:text-stone-100">Nenhum serviço cadastrado</p>
          <p className="text-xs text-stone-500">Crie seu primeiro serviço para liberar a agenda pública.</p>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl text-white text-xs font-semibold min-h-[44px]"
            style={{ backgroundColor: store.primaryColor }}
          >
            Cadastrar primeiro serviço
          </button>
        </div>
      ) : (
        <div className="divide-y divide-stone-200 dark:divide-stone-800 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 overflow-hidden">
          {services.map((srv) => (
            <div
              key={srv.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <span>{srv.category}</span>
                  <span>·</span>
                  <span className="font-mono-nums">{srv.durationMinutes} min</span>
                  {srv.bufferMinutes > 0 && (
                    <>
                      <span>·</span>
                      <span>+{srv.bufferMinutes} min intervalo</span>
                    </>
                  )}
                  {!srv.active && (
                    <>
                      <span>·</span>
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Oculto</span>
                    </>
                  )}
                </div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-100">{srv.name}</h3>
                {srv.description && (
                  <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1">
                    {srv.description}
                  </p>
                )}
                {srv.requiresDeposit && srv.depositAmountCents > 0 && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 font-medium">
                    <QrCode className="w-3.5 h-3.5" />
                    Sinal via Pix: {formatCurrencyBRL(srv.depositAmountCents)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="font-mono-nums text-base font-semibold text-stone-900 dark:text-stone-100 mr-2">
                  {formatCurrencyBRL(srv.priceCents)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(srv)}
                  className="px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-medium hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[40px]"
                >
                  {srv.active ? 'Pausar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(srv)}
                  aria-label={`Editar ${srv.name}`}
                  className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {confirmDeleteId === srv.id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteServiceItem(store.storeId, srv.id);
                      setConfirmDeleteId(null);
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold min-h-[40px]"
                  >
                    Confirmar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(srv.id)}
                    aria-label={`Excluir ${srv.name}`}
                    className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[40px] min-w-[40px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Service Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                {editing ? 'Editar serviço' : 'Novo serviço'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Nome do serviço *</label>
                <input
                  type="text"
                  required
                  maxLength={90}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Limpeza Profissional"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Categoria</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Preço (R$)</label>
                  <input
                    type="text"
                    required
                    value={priceReais}
                    onChange={(e) => setPriceReais(e.target.value)}
                    placeholder="150,00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Duração (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    required
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Intervalo (min)</label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    step={5}
                    value={form.bufferMinutes}
                    onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Retorno (dias)</label>
                  <input
                    type="number"
                    min={0}
                    max={730}
                    value={form.returnDays}
                    onChange={(e) => setForm({ ...form, returnDays: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Descrição curta</label>
                <textarea
                  rows={2}
                  maxLength={260}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Explique em 1 frase o que está incluso"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>

              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requiresDeposit}
                    onChange={(e) => setForm({ ...form, requiresDeposit: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    Exigir sinal via Pix copia e cola (reduz faltas)
                  </span>
                </label>
                {form.requiresDeposit && (
                  <div>
                    <label className="block text-xs font-medium text-stone-500 mb-1">
                      Valor do sinal (R$)
                    </label>
                    <input
                      type="text"
                      value={depositReais}
                      onChange={(e) => setDepositReais(e.target.value)}
                      placeholder="50,00"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm font-mono-nums"
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-50"
                style={{ backgroundColor: store.primaryColor }}
              >
                {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar serviço'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
