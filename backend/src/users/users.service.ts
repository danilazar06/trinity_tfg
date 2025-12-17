import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private users: User[] = [
    new User({ id: 1, nombre: 'Lucía Gómez', token: 'token123', activo: true }),
    new User({ id: 2, nombre: 'Carlos Pérez', token: 'token456', activo: true }),
    new User({ id: 3, nombre: 'Ana Torres', token: 'token789', activo: false }),
    new User({ id: 4, nombre: 'Miguel Ruiz', token: 'token321', activo: true }),
    new User({ id: 5, nombre: 'Laura Sánchez', token: 'token654', activo: false }),
  ];

  private nextId = 6;

  create(createUserDto: CreateUserDto): User {
    const newUser = new User({
      id: this.nextId++,
      ...createUserDto,
    });
    this.users.push(newUser);
    return newUser;
  }

  findAll(): User[] {
    return this.users;
  }

  findOne(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  findByToken(token: string): User | undefined {
    return this.users.find(user => user.token === token);
  }

  findActiveUsers(): User[] {
    return this.users.filter(user => user.activo);
  }

  update(id: number, updateUserDto: UpdateUserDto): User | undefined {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return undefined;
    }

    this.users[userIndex] = new User({
      ...this.users[userIndex],
      ...updateUserDto,
    });

    return this.users[userIndex];
  }

  remove(id: number): boolean {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) {
      return false;
    }

    this.users.splice(userIndex, 1);
    return true;
  }
}