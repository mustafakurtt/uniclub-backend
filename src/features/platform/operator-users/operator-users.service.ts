import { CreatePlatformUserDTO } from "./operator-users.schema";
import type { PlatformUserDetail } from "./operator-users.types";
import { hashPassword } from "../../../shared/utils/password.util";
import { authService } from "../../auth/auth.service";

export const operatorUsersService = {
  async listPlatformUsers() {
    return await authService.listPlatformUsers();
  },

  async createPlatformUser(data: CreatePlatformUserDTO): Promise<PlatformUserDetail> {
    const passwordHash = await hashPassword(data.password);
    return await authService.provisionPlatformAccount({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      roleName: data.role,
    });
  },
};
