import React, { useState } from 'react';
import { CalendarOff, Edit2, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_CLINIC_HOURS, GENERATED_ASSETS } from '../../config/segmentTemplates';
import { formatDateBR, getDayLabelShort } from '../../lib/brUtils';
import { deleteStaffMember, saveStaffMember } from '../../lib/storeRepository';
import { ServiceItem, StaffMember, StoreConfig, WeeklySchedule } from '../../types/booking';
import { SafeImage } from '../SafeImage';

interface AdminStaffTabProps {
  store: StoreConfig;
  services: ServiceItem[];
  staff: StaffMember[];
}

const AVATAR_PRESETS = [
  { label: 'Dra. Camila', url: GENERATED_ASSETS.avatarCamila },
  { label: 'Rafael', url: GENERATED_ASSETS.avatarRafael },
  { label: 'Juliana', url: GENERATED_ASSETS.avatarJuliana },
];

export const AdminStaffTab: React.FC<AdminStaffTabProps> = ({ store, services, staff }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>(GENERATED_ASSETS.avatarCamila);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<WeeklySchedule>(DEFAULT_CLINIC_HOURS);
  const [daysOff, setDaysOff] = useState<string[]>([]);
  const [newDayOff, setNewDayOff] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setRole('Especialista');
    setSpecialty('');
    setBio('');
    setAvatarUrl(GENERATED_ASSETS.avatarCamila);
    setServiceIds(services.map((s) => s.id));
    setSchedule(JSON.parse(JSON.stringify(store.businessHours)));
    setDaysOff([]);
    setModalOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setName(member.name);
    setRole(member.role);
    setSpecialty(member.specialty || '');
    setBio(member.bio || '');
    setAvatarUrl(member.avatarUrl || GENERATED_ASSETS.avatarCamila);
    setServiceIds(member.serviceIds || []);
    setSchedule(JSON.parse(JSON.stringify(member.schedule || store.businessHours)));
    setDaysOff([...(member.daysOff || [])]);
    setModalOpen(true);
  };

  const toggleService = (sid: string) => {
    setServiceIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveStaffMember(
        store.storeId,
        {
          id: editing?.id || '',
          storeId: store.storeId,
          name,
          role,
          specialty,
          bio,
          avatarUrl,
          serviceIds,
          schedule,
          daysOff,
          active: editing ? editing.active : true,
        },
        !editing
      );
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Equipe e horários individuais
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Defina quais serviços cada profissional realiza, horários de expediente, almoço e folgas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap"
          style={{ backgroundColor: store.primaryColor }}
        >
          <Plus className="w-4 h-4" />
          Adicionar profissional
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {staff.map((member) => (
          <div
            key={member.id}
            className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <SafeImage
                  src={member.avatarUrl}
                  alt={member.name}
                  fallbackLabel={member.name}
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {member.name}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {member.role} {!member.active ? '· Inativo' : ''}
                  </p>
                  {member.specialty && (
                    <p className="text-xs text-stone-600 dark:text-stone-300 truncate mt-0.5">
                      {member.specialty}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(member)}
                  className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 min-h-[38px] min-w-[38px] flex items-center justify-center"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {confirmDeleteId === member.id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteStaffMember(store.storeId, member.id);
                      setConfirmDeleteId(null);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold min-h-[38px]"
                  >
                    Excluir
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(member.id)}
                    className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 min-h-[38px] min-w-[38px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-stone-500 dark:text-stone-400 space-y-1.5 pt-2 border-t border-stone-100 dark:border-stone-800">
              <div>
                Serviços vinculados:{' '}
                <strong className="text-stone-800 dark:text-stone-200">
                  {member.serviceIds.length === 0
                    ? 'Todos'
                    : `${member.serviceIds.length} serviço(s)`}
                </strong>
              </div>
              <div>
                Dias ativos:{' '}
                <span className="text-stone-700 dark:text-stone-300">
                  {['1', '2', '3', '4', '5', '6', '0']
                    .filter((k) => member.schedule?.[k]?.enabled)
                    .map((k) => getDayLabelShort(Number(k)))
                    .join(', ') || 'Nenhum'}
                </span>
              </div>
              {member.daysOff.length > 0 && (
                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <CalendarOff className="w-3.5 h-3.5" />
                  Folgas cadastradas: {member.daysOff.length}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Staff Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                {editing ? 'Editar profissional' : 'Novo profissional'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Nome *</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Cargo / Registro *</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Ex: Dentista · CRO-SP"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Especialidade</label>
                <input
                  type="text"
                  maxLength={120}
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Bio curta</label>
                <textarea
                  rows={2}
                  maxLength={280}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-sm"
                />
              </div>

              {/* Avatar presets */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-stone-500">Foto do profissional</label>
                <div className="flex items-center gap-3">
                  {AVATAR_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setAvatarUrl(p.url)}
                      className={`p-1 rounded-xl border-2 transition-all ${
                        avatarUrl === p.url
                          ? 'border-stone-900 dark:border-stone-100'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <SafeImage src={p.url} alt={p.label} className="w-12 h-12 rounded-lg object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Services performed */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-stone-500">
                  Serviços que realiza
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {services.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={serviceIds.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Individual Weekly Schedule */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-stone-500">
                  Horários individuais por dia
                </label>
                <div className="space-y-2">
                  {['1', '2', '3', '4', '5', '6', '0'].map((dayKey) => {
                    const d = schedule[dayKey] || { enabled: false, open: '09:00', close: '18:00' };
                    return (
                      <div
                        key={dayKey}
                        className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 text-xs"
                      >
                        <label className="flex items-center gap-2 w-16 font-medium">
                          <input
                            type="checkbox"
                            checked={d.enabled}
                            onChange={(e) =>
                              setSchedule({
                                ...schedule,
                                [dayKey]: { ...d, enabled: e.target.checked },
                              })
                            }
                          />
                          {getDayLabelShort(Number(dayKey))}
                        </label>
                        {d.enabled && (
                          <>
                            <input
                              type="time"
                              value={d.open}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  [dayKey]: { ...d, open: e.target.value },
                                })
                              }
                              className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                            />
                            <span>até</span>
                            <input
                              type="time"
                              value={d.close}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  [dayKey]: { ...d, close: e.target.value },
                                })
                              }
                              className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                            />
                            <span className="text-stone-400 ml-1">Almoço:</span>
                            <input
                              type="time"
                              value={d.breakStart || ''}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  [dayKey]: { ...d, breakStart: e.target.value },
                                })
                              }
                              className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                            />
                            <span>–</span>
                            <input
                              type="time"
                              value={d.breakEnd || ''}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  [dayKey]: { ...d, breakEnd: e.target.value },
                                })
                              }
                              className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono-nums"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Days off / Vacation */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-stone-500">
                  Folgas e datas de férias
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newDayOff}
                    onChange={(e) => setNewDayOff(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 text-xs font-mono-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newDayOff && !daysOff.includes(newDayOff)) {
                        setDaysOff([...daysOff, newDayOff].sort());
                        setNewDayOff('');
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-semibold min-h-[38px]"
                  >
                    Adicionar folga
                  </button>
                </div>
                {daysOff.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {daysOff.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDaysOff(daysOff.filter((x) => x !== d))}
                        className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-mono-nums inline-flex items-center gap-1.5"
                      >
                        {formatDateBR(d, 'short')}
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold min-h-[48px] disabled:opacity-50"
                style={{ backgroundColor: store.primaryColor }}
              >
                {saving ? 'Salvando...' : editing ? 'Salvar profissional' : 'Cadastrar profissional'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
