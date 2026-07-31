import { operatorUsersRepository } from "./operator-users.repository";
import { CreatePlatformUserDTO } from "./operator-users.schema";
import type { PlatformUserDetail } from "./operator-users.types";
import { badRequest, notFound } from "../../../shared/utils/errors";
import { hashPassword } from "../../../shared/utils/password.util";
import { authRepository } from "../../auth/auth.repository";

export const operatorUsersService = {
  async listPlatformUsers() {
    return await operatorUsersRepository.listPlatformUsers();
  },

  async createPlatformUser(data: CreatePlatformUserDTO): Promise<PlatformUserDetail> {
    const existing = await operatorUsersRepository.findPlatformUserByEmail(data.email);
    if (existing) {
      throw badRequest("platform.userEmailAlreadyInUse");
    }

    const role = await authRepository.findRoleByName(data.role, null);
    if (!role) {
      throw notFound("platform.roleNotFound");
    }

    const passwordHash = await hashPassword(data.password);
    const user = await operatorUsersRepository.createPlatformUserWithRole({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      roleId: role.id,
    });

    return { ...user, roles: [role.name] };
  },
};
