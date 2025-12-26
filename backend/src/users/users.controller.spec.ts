import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [UsersService],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', () => {
      const createUserDto: CreateUserDto = {
        nombre: 'Test User',
        token: 'test-token',
        activo: true,
      };

      const result = controller.create(createUserDto);
      expect(result.nombre).toBe(createUserDto.nombre);
      expect(result.token).toBe(createUserDto.token);
      expect(result.activo).toBe(createUserDto.activo);
    });
  });

  describe('findAll', () => {
    it('should return all users', () => {
      const result = controller.findAll();
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return only active users when active=true', () => {
      const result = controller.findAll('true');
      expect(result).toBeInstanceOf(Array);
      result.forEach((user) => {
        expect(user.activo).toBe(true);
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by id', () => {
      const result = controller.findOne(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should throw HttpException for non-existent user', () => {
      expect(() => controller.findOne(999)).toThrow(HttpException);
    });
  });

  describe('findByToken', () => {
    it('should return a user by token', () => {
      const result = controller.findByToken('token123');
      expect(result).toBeDefined();
      expect(result.token).toBe('token123');
    });

    it('should throw HttpException for non-existent token', () => {
      expect(() => controller.findByToken('invalid-token')).toThrow(
        HttpException,
      );
    });
  });

  describe('update', () => {
    it('should update a user', () => {
      const updateUserDto: UpdateUserDto = {
        nombre: 'Updated Name',
      };

      const result = controller.update(1, updateUserDto);
      expect(result.nombre).toBe(updateUserDto.nombre);
      expect(result.id).toBe(1);
    });

    it('should throw HttpException for non-existent user', () => {
      const updateUserDto: UpdateUserDto = {
        nombre: 'Updated Name',
      };

      expect(() => controller.update(999, updateUserDto)).toThrow(
        HttpException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a user', () => {
      const result = controller.remove(1);
      expect(result).toEqual({ message: 'User deleted successfully' });
    });

    it('should throw HttpException for non-existent user', () => {
      expect(() => controller.remove(999)).toThrow(HttpException);
    });
  });
});
