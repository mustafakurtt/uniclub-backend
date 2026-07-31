import type { RelationHelpers } from "./types";

export const rbacRelations = (r: RelationHelpers) => ({
  roles: {
    university: r.one.universities({
      from: r.roles.universityId,
      to: r.universities.id,
    }),
    permissions: r.many.permissions({
      from: r.roles.id.through(r.rolePermissions.roleId),
      to: r.permissions.id.through(r.rolePermissions.permissionId),
    }),
    users: r.many.users({
      from: r.roles.id.through(r.userRoles.roleId),
      to: r.users.id.through(r.userRoles.userId),
    }),
    rolePermissions: r.many.rolePermissions(),
  },
  permissions: {
    roles: r.many.roles({
      from: r.permissions.id.through(r.rolePermissions.permissionId),
      to: r.roles.id.through(r.rolePermissions.roleId),
    }),
    userPermissions: r.many.userPermissions(),
  },
  rolePermissions: {
    role: r.one.roles({ from: r.rolePermissions.roleId, to: r.roles.id }),
    permission: r.one.permissions({ from: r.rolePermissions.permissionId, to: r.permissions.id }),
  },
  userRoles: {
    user: r.one.users({ from: r.userRoles.userId, to: r.users.id }),
    role: r.one.roles({ from: r.userRoles.roleId, to: r.roles.id }),
  },
  userPermissions: {
    user: r.one.users({ from: r.userPermissions.userId, to: r.users.id }),
    permission: r.one.permissions({ from: r.userPermissions.permissionId, to: r.permissions.id }),
  },
});
