import { defineCatalog } from "../../../core/i18n/translator";

export const operatorUsersMessages = defineCatalog({
  tr: {
    "platform.usersListed": "Platform hesapları listelendi.",
    "platform.userCreated": "Platform hesabı oluşturuldu.",
    "platform.userEmailAlreadyInUse": "Bu e-posta adresi zaten bir platform hesabında kayıtlı.",
    "platform.invalidPlatformRole": "Yalnızca platform rolleri atanabilir (super_admin, platform_support).",
    "platform.roleNotFound": "Rol bulunamadı.",
  },
  en: {
    "platform.usersListed": "Platform accounts listed.",
    "platform.userCreated": "Platform account created.",
    "platform.userEmailAlreadyInUse": "This email is already registered to a platform account.",
    "platform.invalidPlatformRole": "Only platform roles can be assigned (super_admin, platform_support).",
    "platform.roleNotFound": "Role not found.",
  },
});

export type OperatorUsersMessageKey = keyof (typeof operatorUsersMessages)["tr"];
