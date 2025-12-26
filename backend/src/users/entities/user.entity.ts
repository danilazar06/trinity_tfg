export class User {
  id: number;
  nombre: string;
  token: string;
  activo: boolean;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
