import { Test, TestingModule } from '@nestjs/testing';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of users', () => {
      const users = service.findAll();
      expect(users).toBeInstanceOf(Array);
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', () => {
      const user = service.findOne(1);
      expect(user).toBeDefined();
      expect(user?.id).toBe(1);
      expect(user?.nombre).toBe('Lucía Gómez');
    });

    it('should return undefined for non-existent user', () => {
      const user = service.findOne(999);
      expect(user).toBeUndefined();
    });
  });

  describe('findByToken', () => {
    it('should return a user by token', () => {
      const user = service.findByToken('token123');
      expect(user).toBeDefined();
      expect(user?.token).toBe('token123');
      expect(user?.nombre).toBe('Lucía Gómez');
    });

    it('should return undefined for non-existent token', () => {
      const user = service.findByToken('invalid-token');
      expect(user).toBeUndefined();
    });
  });

  describe('findActiveUsers', () => {
    it('should return only active users', () => {
      const activeUsers = service.findActiveUsers();
      expect(activeUsers).toBeInstanceOf(Array);
      activeUsers.forEach((user) => {
        expect(user.activo).toBe(true);
      });
    });
  });

  describe('create', () => {
    it('should create a new user', () => {
      const createUserDto: CreateUserDto = {
        nombre: 'Test User',
        token: 'test-token',
        activo: true,
      };

      const initialCount = service.findAll().length;
      const newUser = service.create(createUserDto);

      expect(newUser).toBeDefined();
      expect(newUser.nombre).toBe(createUserDto.nombre);
      expect(newUser.token).toBe(createUserDto.token);
      expect(newUser.activo).toBe(createUserDto.activo);
      expect(newUser.id).toBeDefined();
      expect(service.findAll().length).toBe(initialCount + 1);
    });
  });

  describe('update', () => {
    it('should update an existing user', () => {
      const updateUserDto: UpdateUserDto = {
        nombre: 'Updated Name',
        activo: false,
      };

      const updatedUser = service.update(1, updateUserDto);

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.nombre).toBe(updateUserDto.nombre);
      expect(updatedUser?.activo).toBe(updateUserDto.activo);
      expect(updatedUser?.id).toBe(1);
    });

    it('should return undefined for non-existent user', () => {
      const updateUserDto: UpdateUserDto = {
        nombre: 'Updated Name',
      };

      const updatedUser = service.update(999, updateUserDto);
      expect(updatedUser).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove an existing user', () => {
      const initialCount = service.findAll().length;
      const removed = service.remove(1);

      expect(removed).toBe(true);
      expect(service.findAll().length).toBe(initialCount - 1);
      expect(service.findOne(1)).toBeUndefined();
    });

    it('should return false for non-existent user', () => {
      const removed = service.remove(999);
      expect(removed).toBe(false);
    });
  });
});
