import type { DbExecutor } from "../../db/executor";
import type { WithAfterCommit } from "../../shared/types/after-commit";
import { authRepository } from "./auth.repository";
import { invalidateUserPermissions } from "../../shared/rbac/rbac.cache";
import { badRequest, notFound } from "../../shared/utils/errors";
import { runAuthTransactionWithAfterCommit } from "./auth-transaction.util";

export const authProvisioningService = {
  /**
   * Operatör tarafından tenant personeli provision — tx dışında hash'lenmiş şifre alır.
   */
  async provisionStaffAccountInTx(params: {
    tx: DbExecutor;
    universityId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    roleName: string;
  }): Promise<WithAfterCommit<Omit<import("./auth.types").User, "passwordHash">>> {
    const existing = await authRepository.findUserByEmailInTx(params.tx, params.email);
    if (existing) {
      throw badRequest("auth.emailAlreadyInUse");
    }

    const user = await authRepository.provisionUserWithRoleInTx(
      params.tx,
      {
        universityId: params.universityId,
        email: params.email,
        passwordHash: params.passwordHash,
        firstName: params.firstName,
        lastName: params.lastName,
        studentNumber: null,
        status: "active",
        mustChangePassword: true,
      },
      params.roleName
    );

    const { passwordHash, ...safe } = user;
    return {
      result: safe,
      afterCommit: async () => {
        await invalidateUserPermissions(user.id);
      },
    };
  },

  async provisionStaffAccount(params: {
    universityId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    roleName: string;
  }) {
    return await runAuthTransactionWithAfterCommit((tx) =>
      authProvisioningService.provisionStaffAccountInTx({ tx, ...params })
    );
  },

  async provisionPlatformAccount(params: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    roleName: string;
  }) {
    const existing = await authRepository.findPlatformUserByEmail(params.email);
    if (existing) {
      throw badRequest("platform.userEmailAlreadyInUse");
    }

    const role = await authRepository.findRoleByName(params.roleName, null);
    if (!role) {
      throw notFound("platform.roleNotFound");
    }

    return await runAuthTransactionWithAfterCommit((tx) =>
      authProvisioningService.provisionPlatformAccountInTx({ tx, ...params })
    );
  },

  async provisionPlatformAccountInTx(params: {
    tx: DbExecutor;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    roleName: string;
  }): Promise<WithAfterCommit<{ email: string; roles: string[] } & Omit<import("./auth.types").User, "passwordHash">>> {
    const existing = await authRepository.findUserByEmailInTx(params.tx, params.email);
    if (existing) {
      throw badRequest("platform.userEmailAlreadyInUse");
    }

    const user = await authRepository.provisionUserWithRoleInTx(
      params.tx,
      {
        universityId: null,
        email: params.email,
        passwordHash: params.passwordHash,
        firstName: params.firstName,
        lastName: params.lastName,
        studentNumber: null,
        status: "active",
        mustChangePassword: true,
      },
      params.roleName
    );

    const { passwordHash, ...safe } = user;
    return {
      result: { ...safe, roles: [params.roleName] },
      afterCommit: async () => {
        await invalidateUserPermissions(user.id);
      },
    };
  },

  async findPlatformUserByEmail(email: string) {
    return await authRepository.findPlatformUserByEmail(email);
  },

  async listPlatformUsers() {
    return await authRepository.listPlatformUsers();
  },
};
