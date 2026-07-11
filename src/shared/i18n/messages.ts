import { mergeCatalogs } from "../../core/i18n/translator";
import { commonMessages } from "./common.messages";
import { universityMessages } from "../../features/university/university.messages";

/**
 * i18n KOMPOZİSYON KÖKÜ — burada mesaj metni YAZILMAZ, sadece feature/ortak
 * katalog parçaları birleştirilir. Her feature kendi `*.messages.ts` dosyasını
 * taşır (bkz. features/university/university.messages.ts); yeni bir feature'ı çok
 * dilliye açmak = katalogunu buraya eklemek. `mergeCatalogs` anahtar çakışmasını
 * yükleme anında yakalar.
 */
export const messages = mergeCatalogs(commonMessages, universityMessages);
