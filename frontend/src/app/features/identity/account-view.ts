export interface AccountView {
  roles?: ('HOST' | 'MUSICIAN' | 'PARTICIPANT')[];
  email: string;
  name?: string;
  role: 'HOST' | 'MUSICIAN' | 'PARTICIPANT';
  emailVerified?: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  administrator?: boolean;
  createdAt?: string;
  version?: number;
}
export function accountActive(account: AccountView) {
  return account.emailVerified !== false && (!account.status || account.status === 'APPROVED');
}
export function accountStatus(account: AccountView) {
  if (account.status === 'REJECTED') return 'Cadastro não aprovado';
  if (account.status === 'SUSPENDED') return 'Acesso suspenso';
  if (!account.emailVerified) return 'Confirme seu e-mail';
  return account.status === 'APPROVED' ? 'Acesso liberado' : 'Aguardando aprovação';
}

export function accountHasRole(account: AccountView, role: AccountView['role']) {
  return (account.roles ?? [account.role]).includes(role);
}
