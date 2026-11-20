/**
 * ============================================================================
 * CONTROLE DE ACESSO RESTRITO (LISTA ÚNICA DE E-MAILS AUTORIZADOS)
 * ============================================================================
 * Apenas os e-mails listados abaixo podem criar lojas e acessar o Painel Admin.
 * IMPORTANTE: Ao adicionar ou remover um e-mail aqui, atualize também a função
 * `isAuthorizedAdminEmail()` no arquivo `/firestore.rules` e reimplante as regras.
 */
export const AUTHORIZED_ADMIN_EMAILS: readonly string[] = [
  'lucaroch222@gmail.com',
];

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return AUTHORIZED_ADMIN_EMAILS.some((allowed) => allowed.toLowerCase() === normalized);
}
