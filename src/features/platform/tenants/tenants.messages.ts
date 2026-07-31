import { defineCatalog } from "../../../core/i18n/translator";

export const tenantsMessages = defineCatalog({
  tr: {
    // hata
    "platform.tenantNotFound": "Üniversite bulunamadı.",
    "platform.tenantStatusUnchanged": "Tenant zaten bu durumda.",
    "platform.invalidTenantStatusTransition": "Bu durum geçişi geçerli değil.",
    "platform.adminEmailDomainMismatch": "Yönetici e-postası tenant'ın staff domainlerinden biriyle eşleşmeli.",
    "platform.adminEmailAlreadyInUse": "Bu e-posta adresi tenant'ta zaten kayıtlı.",
    "platform.tenantStaffDomainRequired": "İlk yönetici için en az bir staff domain tanımlanmalı.",
    "platform.invitePermissionRequired": "İlk yönetici daveti için platform.tenant.invite yetkisi gerekir.",
    "platform.invalidTenantListCursor": "Geçersiz tenant listesi cursor değeri.",
    // başarı
    "platform.tenantsListed": "Tenant listesi listelendi.",
    "platform.tenantStatusUpdated": "Tenant durumu güncellendi.",
    "platform.tenantOnboarded": "Tenant başarıyla açıldı.",
    "platform.adminInvited": "Tenant yöneticisi daveti oluşturuldu.",
    "platform.invitationsListed": "Bekleyen davetler listelendi.",
    "platform.invitationCancelled": "Davet iptal edildi.",
  },
  en: {
    // error
    "platform.tenantNotFound": "University not found.",
    "platform.tenantStatusUnchanged": "Tenant is already in this status.",
    "platform.invalidTenantStatusTransition": "This status transition is not valid.",
    "platform.adminEmailDomainMismatch": "Admin email must match one of the tenant's staff domains.",
    "platform.adminEmailAlreadyInUse": "This email address is already registered in the tenant.",
    "platform.tenantStaffDomainRequired": "At least one staff domain is required to provision the first admin.",
    "platform.invitePermissionRequired": "platform.tenant.invite permission is required to invite the initial administrator.",
    "platform.invalidTenantListCursor": "Invalid tenant list cursor value.",
    // success
    "platform.tenantsListed": "Tenant list retrieved.",
    "platform.tenantStatusUpdated": "Tenant status updated.",
    "platform.tenantOnboarded": "Tenant onboarded successfully.",
    "platform.adminInvited": "Tenant administrator invitation created.",
    "platform.invitationsListed": "Pending invitations retrieved.",
    "platform.invitationCancelled": "Invitation cancelled.",
  },
});

export type TenantsMessageKey = keyof (typeof tenantsMessages)["tr"];
